import os
import re
import time
import math
import itertools
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import networkx as nx
import pandas as pd
import numpy as np
import joblib

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
GRAPH_PATH = os.path.join(BACKEND_DIR, "data", "bangalore.graphml")
G = None
LAST_MAPPING_TIME = 0.0

def reload_graph_if_changed():
    global G, LAST_MAPPING_TIME
    try:
        if os.path.exists(GRAPH_PATH):
            mtime = os.path.getmtime(GRAPH_PATH)
            if mtime > LAST_MAPPING_TIME:
                print(f"[graph] Loading from disk (mtime changed)...")
                t0 = time.time()
                new_G = ox.load_graphml(GRAPH_PATH)
                G = new_G
                LAST_MAPPING_TIME = mtime
                print(f"[graph] Loaded {len(G)} nodes / {len(G.edges())} edges in {time.time()-t0:.1f}s")
    except Exception as e:
        print(f"[graph] Error loading: {e}")

MODEL_PATH = os.path.join(BACKEND_DIR, "model", "dual_intake_model.pkl")
DATASET_PATH = os.path.join(os.path.dirname(BACKEND_DIR), "public", "dataset.csv")

model = None
T_BASE_MAP = {}
GLOBAL_MEDIAN_T_BASE = 35.0

def load_ml_model_and_dataset():
    global model, T_BASE_MAP, GLOBAL_MEDIAN_T_BASE
    if os.path.exists(MODEL_PATH):
        try:
            print(f"[model] Loading ML model from {MODEL_PATH}...")
            model = joblib.load(MODEL_PATH)
            print("[model] ML Model loaded successfully.")
        except Exception as e:
            print(f"[model] Error loading model: {e}")
    else:
        print(f"[model] ML model file not found at {MODEL_PATH}")

    if os.path.exists(DATASET_PATH):
        try:
            print(f"[dataset] Loading dataset from {DATASET_PATH}...")
            df = pd.read_csv(DATASET_PATH)
            df['created_date'] = pd.to_datetime(df['created_date'], errors='coerce')
            df['closed_datetime'] = pd.to_datetime(df['closed_datetime'], errors='coerce')
            df['duration_mins'] = (df['closed_datetime'] - df['created_date']).dt.total_seconds() / 60.0
            df = df[(df['duration_mins'] > 0) & (df['duration_mins'] < 10080)].copy()
            
            t_base_df = df.groupby(['zone', 'event_cause'])['duration_mins'].median().reset_index()
            T_BASE_MAP = {}
            for _, row in t_base_df.iterrows():
                key = (str(row['zone']).strip().lower(), str(row['event_cause']).strip().lower())
                T_BASE_MAP[key] = float(row['duration_mins'])
                
            GLOBAL_MEDIAN_T_BASE = float(df['duration_mins'].median())
            print(f"[dataset] Cached {len(T_BASE_MAP)} t_base values. Global median: {GLOBAL_MEDIAN_T_BASE:.1f} mins.")
        except Exception as e:
            print(f"[dataset] Error loading dataset: {e}")
    else:
        print(f"[dataset] dataset.csv not found at {DATASET_PATH}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.path.exists(GRAPH_PATH):
        print(f"[graph] File not found at {GRAPH_PATH}. Running bootstrap...")
        import sys, subprocess
        bootstrap_script = os.path.join(BACKEND_DIR, "bootstrap_graph.py")
        subprocess.run([sys.executable, bootstrap_script])
    reload_graph_if_changed()
    load_ml_model_and_dataset()
    yield

app = FastAPI(title="GridMind AI Routing Engine Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Variables(BaseModel):
    rain: bool
    peakHour: bool
    deployedOfficers: int

class ClosedRoad(BaseModel):
    name: str
    lat: float | None = None
    lng: float | None = None

class RouteRequest(BaseModel):
    waypoints: list[list[float]]
    closedRoads: list[ClosedRoad] = []
    variables: Variables | None = None

class WhatIfRequest(BaseModel):
    query: str
    waypoints: list[list[float]]
    closedRoads: list[ClosedRoad]
    variables: Variables

# ---------------------------------------------------------------------------
# Fast heuristic weight computation — NO deepcopy of the full graph.
# Returns a dict {(u, v, k): weight} only for edges that differ from length.
# ---------------------------------------------------------------------------
def build_weight_overrides(
    graph,
    rain: bool,
    peak_hour: bool,
    deployed_officers: int,
    closed_roads: list[ClosedRoad],
) -> dict:
    closed_names: set[str] = set()
    closed_coords: list[tuple[float, float]] = []

    for cr in closed_roads:
        name = getattr(cr, "name", "")
        lat = getattr(cr, "lat", None)
        lng = getattr(cr, "lng", None)
        if name:
            closed_names.add(name.lower().strip())
        if lat is not None and lng is not None:
            closed_coords.append((lat, lng))

    # Collect nodes near closed coords first (fast lookup)
    blocked_nodes: set = set()
    for lat, lng in closed_coords:
        try:
            blocked_nodes.add(ox.nearest_nodes(graph, X=lng, Y=lat))
        except Exception as e:
            print(f"[route] Could not find node near ({lat},{lng}): {e}")

    overrides: dict = {}
    for u, v, k, data in graph.edges(keys=True, data=True):
        length = data.get("length", 1.0)
        name = data.get("name", "")
        highway = data.get("highway", "")

        # Check proximity block
        if u in blocked_nodes or v in blocked_nodes:
            overrides[(u, v, k)] = length * 1e9
            continue

        # Check name-based block
        is_closed = False
        if name and closed_names:
            names_list = name if isinstance(name, list) else [name]
            for n in names_list:
                n_lower = n.lower().strip()
                for cn in closed_names:
                    if cn in n_lower or n_lower in cn:
                        is_closed = True
                        break
                if is_closed:
                    break

        multiplier = 1.0
        if is_closed:
            multiplier = 1e9
        else:
            if rain:
                multiplier += 0.5
                if highway in ["trunk", "primary"] or "underpass" in str(name).lower():
                    multiplier += 1.5
            if peak_hour:
                if highway in ["trunk", "primary", "secondary"]:
                    multiplier += 0.8
            if deployed_officers > 0:
                if highway in ["trunk", "primary", "secondary"]:
                    speed_up = min(0.35, deployed_officers * 0.02)
                    multiplier -= speed_up

        final_weight = length * max(0.1, multiplier)
        if abs(final_weight - length) > 0.001:  # only store if different from length
            overrides[(u, v, k)] = final_weight

    return overrides


def make_weight_fn(graph, overrides: dict):
    """Return a callable suitable for nx.shortest_path(weight=...)."""
    def weight_fn(u, v, edge_dict):
        # edge_dict is {key: attr_dict} for a MultiDiGraph
        best = float("inf")
        for k, data in edge_dict.items():
            w = overrides.get((u, v, k), data.get("length", 1.0))
            if w < best:
                best = w
        return best
    return weight_fn


def get_path_metrics(graph, path_nodes, overrides: dict):
    total_length_m = 0.0
    total_weight = 0.0
    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edge_data = graph.get_edge_data(u, v)
        if edge_data:
            k0 = list(edge_data.keys())[0]
            length = edge_data[k0].get("length", 0)
            weight = overrides.get((u, v, k0), length)
            total_length_m += length
            total_weight += weight
    return total_length_m, total_weight


def compute_route(graph, nodes: list, overrides: dict) -> list:
    weight_fn = make_weight_fn(graph, overrides)
    full_path = []
    for i in range(len(nodes) - 1):
        try:
            sub = nx.shortest_path(graph, nodes[i], nodes[i + 1], weight=weight_fn)
            full_path.extend(sub if i == 0 else sub[1:])
        except nx.NetworkXNoPath:
            continue
    return full_path


@app.post("/api/route")
async def get_route(req: RouteRequest):
    reload_graph_if_changed()
    if G is None:
        raise HTTPException(status_code=500, detail="Graph not initialized")
    if not req.waypoints:
        return {"points": []}

    rain = req.variables.rain if req.variables else False
    peak_hour = req.variables.peakHour if req.variables else False
    deployed_officers = req.variables.deployedOfficers if req.variables else 0

    nodes = [ox.nearest_nodes(G, X=p[1], Y=p[0]) for p in req.waypoints]
    overrides = build_weight_overrides(G, rain=rain, peak_hour=peak_hour,
                                       deployed_officers=deployed_officers,
                                       closed_roads=req.closedRoads)
    full_path = compute_route(G, nodes, overrides)

    if not full_path:
        # Fallback: plain length routing on baseline graph
        full_path = compute_route(G, nodes, {})

    if not full_path:
        return {"points": req.waypoints}

    coords = [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in full_path]
    return {"points": coords}


@app.post("/api/what-if")
async def post_what_if(req: WhatIfRequest):
    reload_graph_if_changed()
    if G is None:
        raise HTTPException(status_code=500, detail="Graph not initialized")

    query_lower = req.query.lower().strip()
    new_closed = list(req.closedRoads)
    new_officers = req.variables.deployedOfficers
    title = "What-If Projection"
    desc = ""
    query_matched = False

    if "close mg road" in query_lower or "mg road closed" in query_lower or "avoid mg road" in query_lower:
        if "mg road" not in [getattr(r, "name", "").lower() for r in new_closed]:
            new_closed.append(ClosedRoad(name="MG Road", lat=12.9736, lng=77.6074))
        title = "MG Road Closed"
        desc = "MG Road closed. Rerouted major corridors via Cubbon Road & Queens Road."
        query_matched = True

    if "gate 3" in query_lower:
        if "gate 3 exit" not in [getattr(r, "name", "").lower() for r in new_closed]:
            new_closed.append(ClosedRoad(name="Gate 3 Exit", lat=12.9788, lng=77.5996))
        title = "Gate 3 Exit Closed"
        desc = "Gate 3 Exit closed. Forced dispersing match crowd northwards."
        query_matched = True

    if "queens road" in query_lower and ("one way" in query_lower or "one-way" in query_lower or "convert" in query_lower):
        if "queens road" not in [getattr(r, "name", "").lower() for r in new_closed]:
            new_closed.append(ClosedRoad(name="Queens Road", lat=12.9836, lng=77.5966))
        title = "Queens Road One-Way Outbound"
        desc = "Queens Road converted to one-way outbound to maximize evacuation volume."
        query_matched = True

    officer_match = re.search(r"(?:deploy|place|add|use)\s+(\d+)\s+officer", query_lower) or \
                    re.search(r"(\d+)\s+officer", query_lower)
    if officer_match:
        new_officers = int(officer_match.group(1))
        title = f"Deploying {new_officers} Officers"
        desc = f"Deployed {new_officers} officers across critical junctions."
        query_matched = True

    nodes = [ox.nearest_nodes(G, X=p[1], Y=p[0]) for p in req.waypoints]

    overrides_base = build_weight_overrides(G, rain=False, peak_hour=False,
                                            deployed_officers=0,
                                            closed_roads=req.closedRoads)
    path_base = compute_route(G, nodes, overrides_base)
    len_base, weight_base = get_path_metrics(G, path_base, overrides_base)

    overrides_mod = build_weight_overrides(G, rain=req.variables.rain,
                                           peak_hour=req.variables.peakHour,
                                           deployed_officers=new_officers,
                                           closed_roads=new_closed)
    path_mod = compute_route(G, nodes, overrides_mod)
    len_mod, weight_mod = get_path_metrics(G, path_mod, overrides_mod)

    if not path_mod:
        path_mod = path_base
        coords_mod = [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in path_base]
    else:
        coords_mod = [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in path_mod]

    congestion_before = 75
    if req.variables.rain:
        congestion_before += 15
    if req.variables.peakHour:
        congestion_before += 10

    ratio = weight_mod / max(1.0, weight_base)
    congestion_after = int(congestion_before * min(1.5, max(0.5, ratio)))
    congestion_after = max(5, min(99, congestion_after))

    delay_before = int(len_base / 300)
    if req.variables.rain:
        delay_before += 12
    if req.variables.peakHour:
        delay_before += 8
    delay_after = int(delay_before * min(2.0, max(0.4, ratio)))
    delay_after = max(2, delay_after)

    spillover = []
    if "mg road" in [getattr(r, "name", "").lower() for r in new_closed]:
        spillover = [{"road": "Queens Road Flow", "delta": 8},
                     {"road": "Cubbon Road Flow", "delta": 12},
                     {"road": "Richmond Circle", "delta": 4}]
    elif "gate 3 exit" in [getattr(r, "name", "").lower() for r in new_closed]:
        spillover = [{"road": "Queens Road Flow", "delta": -6},
                     {"road": "Cubbon Road Flow", "delta": 4}]
    elif "queens road" in [getattr(r, "name", "").lower() for r in new_closed]:
        spillover = [{"road": "Queens Road Capacity", "delta": 35},
                     {"road": "Cubbon Road Flow", "delta": -8}]
    else:
        reduction = congestion_before - congestion_after
        spillover = [{"road": "Primary Corridor", "delta": -int(reduction * 0.8)},
                     {"road": "Adjacent Junctions", "delta": -int(reduction * 0.4)}]

    recommendations = []
    if "mg road" in [getattr(r, "name", "").lower() for r in new_closed]:
        recommendations = [
            {"title": "Close Gate 3 Exit", "desc": "Feeds directly into MG Road. Reroute stadium crowd north.", "type": "close"},
            {"title": "Queens Road One-Way", "desc": "Convert Queens Road to outbound only to relief pressure.", "type": "convert"},
            {"title": "Redirect via Cubbon", "desc": "Divert 30% of vehicles to Cubbon Road.", "type": "redirect"},
        ]
    else:
        recommendations = [
            {"title": "Manual Flow Controls",
             "desc": f"Deploy {new_officers} officers to manage intersections.", "type": "redirect"}
        ]

    if not desc:
        desc = f"Simulated with rain={req.variables.rain}, peak={req.variables.peakHour}, officers={new_officers}. Weight ratio: {ratio:.2f}x."

    return {
        "queryMatched": query_matched,
        "title": title,
        "congestionBefore": congestion_before,
        "congestionAfter": congestion_after,
        "delayBefore": delay_before,
        "delayAfter": delay_after,
        "officersDeployed": new_officers,
        "spilloverImpact": spillover,
        "recommendations": recommendations,
        "description": desc,
        "points": coords_mod,
        "closedRoads": new_closed,
    }


class PredictRequest(BaseModel):
    event_type: str
    event_cause: str
    corridor: str
    veh_type: str
    priority: str
    zone: str
    latitude: float
    longitude: float
    endlatitude: float | None = 0.0
    endlongitude: float | None = 0.0
    created_date: str | None = None
    reason_breakdown: str | None = ""
    actual_clearance_time: float | None = None
    estimated_volume: int | None = None
    duration_hr: float | None = None


class IncidentInfo(BaseModel):
    id: str
    latitude: float
    longitude: float
    severity: str
    kind: str
    event_type: str | None = "unplanned"
    event_cause: str | None = "others"
    corridor: str | None = "Non-corridor"
    veh_type: str | None = "heavy_vehicle"
    priority: str | None = "Medium"
    zone: str | None = "Central Zone 2"
    reason_breakdown: str | None = ""
    created_date: str | None = None
    endlatitude: float | None = 0.0
    endlongitude: float | None = 0.0


class GenerateDiversionsRequest(BaseModel):
    primary_incident: IncidentInfo
    all_incidents: list[IncidentInfo]
    rain: bool
    peak_hour: bool
    deployed_officers: int


def haversine_distance(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return 6371 * c


def run_prediction_logic(req, rain: bool, peak_hour: bool):
    global model, T_BASE_MAP, GLOBAL_MEDIAN_T_BASE
    
    if model is None:
        return {
            "s_impact": GLOBAL_MEDIAN_T_BASE,
            "features": {
                "hour_of_day": 12,
                "day_of_week": 0,
                "is_peak_hour": 0,
                "impact_distance_km": 0.0,
                "has_mech_failure": 0,
                "t_base": GLOBAL_MEDIAN_T_BASE
            }
        }
        
    # Temporal Features
    if req.created_date:
        try:
            dt = pd.to_datetime(req.created_date)
        except Exception:
            dt = pd.Timestamp.now()
    else:
        dt = pd.Timestamp.now()
        
    hour_of_day = dt.hour
    day_of_week = dt.dayofweek
    is_peak_hour = 1 if peak_hour else (1 if (8 <= hour_of_day <= 11) or (17 <= hour_of_day <= 20) else 0)
    
    # Spatial Features
    lat1 = req.latitude
    lon1 = req.longitude
    lat2 = req.endlatitude if req.endlatitude is not None else 0.0
    lon2 = req.endlongitude if req.endlongitude is not None else 0.0
    
    if lat2 == 0.0 or lon2 == 0.0:
        impact_distance_km = 0.0
    else:
        try:
            impact_distance_km = float(haversine_distance(lat1, lon1, lat2, lon2))
            if np.isnan(impact_distance_km):
                impact_distance_km = 0.0
        except Exception:
            impact_distance_km = 0.0
            
    # Text Engineering
    keywords = ['tyre', 'clutch', 'brake', 'engine', 'breakdown', 'burst']
    reason_clean = str(req.reason_breakdown or "").lower()
    has_mech_failure = 1 if any(k in reason_clean for k in keywords) else 0
    
    # T_base lookup
    key = (str(req.zone).strip().lower(), str(req.event_cause).strip().lower())
    t_base = T_BASE_MAP.get(key, GLOBAL_MEDIAN_T_BASE)

    # --- Known-cause normalisation ---
    # The training set only has: accident, congestion, construction, others,
    # pot_holes, procession, protest, road_conditions, tree_fall,
    # vehicle_breakdown, water_logging, test_demo
    # Unknown causes (e.g. 'public_event') fall through the OHE as 'Unknown'
    # and the model picks up long-duration construction/water-logging noise.
    # Map them to the nearest semantically-close trained cause.
    KNOWN_CAUSES = {
        'accident', 'congestion', 'construction', 'others', 'pot_holes',
        'procession', 'protest', 'road_conditions', 'tree_fall',
        'vehicle_breakdown', 'water_logging', 'test_demo'
    }
    CAUSE_REMAP = {
        'public_event': 'procession',   # crowd-movement events closest to procession
        'event': 'procession',
        'rally': 'procession',
        'sports': 'procession',
        'match': 'procession',
        'concert': 'procession',
        'breakdown': 'vehicle_breakdown',
        'fire': 'accident',
    }
    event_cause_for_model = str(req.event_cause).strip().lower()
    if event_cause_for_model not in KNOWN_CAUSES:
        event_cause_for_model = CAUSE_REMAP.get(event_cause_for_model, 'others')

    # Inference Payload
    input_data = {
        'event_type': req.event_type,
        'event_cause': event_cause_for_model,
        'corridor': req.corridor,
        'veh_type': req.veh_type,
        'priority': req.priority,
        'zone': req.zone,
        'hour_of_day': hour_of_day,
        'day_of_week': day_of_week,
        'is_peak_hour': is_peak_hour,
        'impact_distance_km': impact_distance_km,
        'has_mech_failure': has_mech_failure,
        't_base': t_base
    }
    
    input_df = pd.DataFrame([input_data])
    
    try:
        raw_prediction = float(model.predict(input_df)[0])
        # The model was trained on incident duration data that includes long-running
        # infrastructure causes (pot_holes avg ~2358 min, water_logging ~2145 min).
        # Clamp to a sane operational ceiling of 480 min (8 hours) so these outliers
        # don't pollute incident-clearance predictions.
        s_impact = min(raw_prediction, 480.0)
        print(f"[debug] Raw ML prediction: {raw_prediction:.2f} -> clamped: {s_impact:.2f} "
              f"for cause={req.event_cause} (mapped={event_cause_for_model}) "
              f"zone={req.zone} t_base={t_base:.2f} peak={is_peak_hour}")
    except Exception as e:
        print(f"Prediction logic error: {e}")
        s_impact = GLOBAL_MEDIAN_T_BASE
        
    return {
        "s_impact": s_impact,
        "features": {
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            "is_peak_hour": is_peak_hour,
            "impact_distance_km": impact_distance_km,
            "has_mech_failure": has_mech_failure,
            "t_base": t_base
        }
    }


def build_diversion_overrides(
    graph,
    rain: bool,
    peak_hour: bool,
    deployed_officers: int,
    blocked_locations: list[tuple[float, float]]
) -> dict:
    blocked_nodes = set()
    for lat, lng in blocked_locations:
        try:
            center_node = ox.nearest_nodes(graph, X=lng, Y=lat)
            blocked_nodes.add(center_node)
            # Add neighbors (1-hop)
            for nbr in graph.neighbors(center_node):
                blocked_nodes.add(nbr)
                # 2-hop neighbors
                for nbr2 in graph.neighbors(nbr):
                    blocked_nodes.add(nbr2)
        except Exception as e:
            print(f"[diversions] Could not block nodes near ({lat},{lng}): {e}")

    overrides = {}
    for u, v, k, data in graph.edges(keys=True, data=True):
        length = data.get("length", 1.0)
        name = data.get("name", "")
        highway = data.get("highway", "")

        # Blocked node proximity
        if u in blocked_nodes or v in blocked_nodes:
            overrides[(u, v, k)] = length * 1e9
            continue

        multiplier = 1.0
        if rain:
            multiplier += 0.5
            if highway in ["trunk", "primary"] or "underpass" in str(name).lower():
                multiplier += 1.5
        if peak_hour:
            if highway in ["trunk", "primary", "secondary"]:
                multiplier += 0.8
        if deployed_officers > 0:
            if highway in ["trunk", "primary", "secondary"]:
                speed_up = min(0.35, deployed_officers * 0.02)
                multiplier -= speed_up

        final_weight = length * max(0.1, multiplier)
        if abs(final_weight - length) > 0.001:
            overrides[(u, v, k)] = final_weight

    return overrides


def find_alternative_paths(graph, source_node, target_node, num_paths=3, weight_overrides=None):
    paths = []
    current_overrides = dict(weight_overrides) if weight_overrides else {}

    for i in range(num_paths):
        def weight_fn(u, v, edge_dict):
            best = float("inf")
            for k, data in edge_dict.items():
                w = current_overrides.get((u, v, k), data.get("length", 1.0))
                if w < best:
                    best = w
            return best

        try:
            path = nx.shortest_path(graph, source_node, target_node, weight=weight_fn)
            paths.append(path)
            
            # Penalize edges in the path so subsequent iterations are forced to find alternatives
            for j in range(len(path) - 1):
                u_p, v_p = path[j], path[j + 1]
                edge_data = graph.get_edge_data(u_p, v_p)
                if edge_data:
                    for k in edge_data.keys():
                        orig = current_overrides.get((u_p, v_p, k), edge_data[k].get("length", 1.0))
                        current_overrides[(u_p, v_p, k)] = orig * 5.0
        except nx.NetworkXNoPath:
            break

    return paths


@app.post("/api/predict-impact")
async def predict_impact(req: PredictRequest):
    global model
    if model is None:
        raise HTTPException(status_code=500, detail="ML model not loaded on server startup")
        
    # Override peak hour based on date if not explicitly set
    if req.created_date:
        try:
            dt = pd.to_datetime(req.created_date)
            is_peak = (8 <= dt.hour <= 11) or (17 <= dt.hour <= 20)
        except Exception:
            is_peak = False
    else:
        is_peak = False
        
    pred_res = run_prediction_logic(req, False, is_peak)
    ml_clearance = pred_res["s_impact"]  # Raw ML output: incident clearance minutes
    
    # --- Event-Aware Scaling ---
    # The ML model predicts incident clearance time. For event forecasting, we
    # scale by the volume/capacity ratio and duration to get a meaningful impact.
    volume = req.estimated_volume or 0
    duration_hr = req.duration_hr or 0.0
    
    HOURLY_ROAD_CAPACITY = 4000  # vehicles/hr typical urban arterial capacity
    
    if volume > 0 and duration_hr > 0:
        # Volume-to-capacity ratio (dimensionless, typically 0.5 - 12+)
        vc_ratio = volume / HOURLY_ROAD_CAPACITY
        # Duration factor: longer events compound traffic stress
        dur_factor = min(duration_hr / 4.0, 2.5)  # normalized, cap at 2.5
        # Combine: ML baseline * volume pressure * duration stress
        # Scale: 12.5 converts VC*duration into a 0-100 impact score range
        volume_impact = vc_ratio * dur_factor * 12.5
        # Blend with ML prediction: use volume impact as primary, ML as modifier
        s_impact = min(99.0, max(10.0, volume_impact * (1.0 + ml_clearance / 200.0)))
    elif volume > 0:
        # Volume only, no duration info
        vc_ratio = volume / HOURLY_ROAD_CAPACITY
        s_impact = min(99.0, max(10.0, vc_ratio * 15.0 + ml_clearance * 0.3))
    else:
        # Pure incident mode (no event volume) — use ML clearance directly
        s_impact = min(99.0, max(10.0, ml_clearance))
    
    strike_threshold = s_impact * 1.25
    
    # --- Resource Calculation scaled to event size ---
    if volume > 0:
        impact_norm = s_impact / 100.0
        officers = max(4, math.ceil(4 + (volume / 1000.0) * impact_norm * 1.5))
        cross_streets = max(5, round(volume / 3000))
        barricades = max(2, round(cross_streets * impact_norm * 8))
        tow_trucks = max(1, round(s_impact / 25.0))
    else:
        # Spatial feature calculation for unplanned incidents
        lat1 = req.latitude
        lon1 = req.longitude
        lat2 = req.endlatitude if req.endlatitude is not None else 0.0
        lon2 = req.endlongitude if req.endlongitude is not None else 0.0
        
        if lat2 == 0.0 or lon2 == 0.0:
            impact_distance_km = 0.0
        else:
            try:
                impact_distance_km = float(haversine_distance(lat1, lon1, lat2, lon2))
                if np.isnan(impact_distance_km):
                    impact_distance_km = 0.0
            except Exception:
                impact_distance_km = 0.0
                
        officers = math.ceil(impact_distance_km / 1.5) + 2
        cross_streets = 5
        barricades = max(2, round(cross_streets * (min(100.0, s_impact) / 100.0) * 8))
        tow_trucks = max(1, round(s_impact / 33.0))
    
    strike_issued = False
    if req.actual_clearance_time is not None:
        strike_issued = bool(req.actual_clearance_time > strike_threshold)
        
    return {
        "s_impact": round(s_impact, 1),
        "strike_threshold": round(strike_threshold, 1),
        "officers": officers,
        "barricades": barricades,
        "tow_trucks": tow_trucks,
        "strike_issued": strike_issued,
        "features": pred_res["features"]
    }


@app.post("/api/generate-diversions")
async def generate_diversions(req: GenerateDiversionsRequest):
    global G
    reload_graph_if_changed()
    if G is None:
        raise HTTPException(status_code=500, detail="Graph not initialized")
        
    p_inc = req.primary_incident
    
    # 1. Identify incidents within 3km of primary incident
    co_occurring = []
    blocked_locations = [(p_inc.latitude, p_inc.longitude)]
    
    for inc in req.all_incidents:
        if inc.id == p_inc.id:
            continue
        dist = haversine_distance(p_inc.latitude, p_inc.longitude, inc.latitude, inc.longitude)
        if dist <= 3.0:
            co_occurring.append(inc)
            blocked_locations.append((inc.latitude, inc.longitude))
            
    # 2. Perform inferences
    primary_pred = run_prediction_logic(p_inc, req.rain, req.peak_hour)
    joint_s_impact = primary_pred["s_impact"]
    inferences_run = 1
    warnings_list = []
    
    if co_occurring:
        warnings_list.append(f"Detected {len(co_occurring)} other incidents within 3km threshold radius.")
        joint_factors = []
        for inc in co_occurring:
            pred = run_prediction_logic(inc, req.rain, req.peak_hour)
            joint_factors.append(pred["s_impact"])
            inferences_run += 1
            
        compounding_delay = 0.4 * sum(joint_factors)
        joint_s_impact = primary_pred["s_impact"] + compounding_delay
        warnings_list.append(
            f"Executed {inferences_run} simultaneous inferences. Primary predicted clearance: {primary_pred['s_impact']:.1f}m. "
            f"Compounding proximity delay added: +{compounding_delay:.1f}m. Joint Clearance: {joint_s_impact:.1f}m."
        )
        
    joint_strike_threshold = joint_s_impact * 1.25
    
    # 3. Calculate start/end points for routing (using the incident ID hash angle method)
    id_num = 0
    try:
        id_num = int(re.sub(r"\D", "", p_inc.id))
    except Exception:
        id_num = 0
        
    angle_deg = [0, 45, 90, 135][id_num % 4]
    phi = (angle_deg * math.pi) / 180
    
    r_lat = 0.027
    r_lng = 0.02775
    
    start_pt = (p_inc.latitude - r_lat * math.cos(phi), p_inc.longitude - r_lng * math.sin(phi))
    end_pt = (p_inc.latitude + r_lat * math.cos(phi), p_inc.longitude + r_lng * math.sin(phi))
    
    # 4. Generate the weight overrides on G
    overrides = build_diversion_overrides(
        G,
        rain=req.rain,
        peak_hour=req.peak_hour,
        deployed_officers=req.deployed_officers,
        blocked_locations=blocked_locations
    )
    
    # 5. Route on graph to get 3 paths using the penalty method
    start_node = ox.nearest_nodes(G, X=start_pt[1], Y=start_pt[0])
    end_node = ox.nearest_nodes(G, X=end_pt[1], Y=end_pt[0])
    
    paths = find_alternative_paths(G, start_node, end_node, num_paths=3, weight_overrides=overrides)
    
    # Convert paths to route formats
    routes = []
    route_names = [
        "Route A · Graph Detour Primary (Model OP)",
        "Route B · Parallel Graph Secondary (Model OP)",
        "Route C · Alternate Graph Tertiary (Model OP)"
    ]
    
    for i, path in enumerate(paths):
        coords = [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in path]
        
        # Calculate distance
        total_length_m = 0.0
        cross_streets = 0
        for j in range(len(path) - 1):
            u, v = path[j], path[j + 1]
            edge_data = G.get_edge_data(u, v)
            if edge_data:
                k0 = list(edge_data.keys())[0]
                total_length_m += edge_data[k0].get("length", 0)
                if G.degree(u) > 2:
                    cross_streets += 1
                    
        dist_km = round(total_length_m / 1000.0, 2)
        if dist_km == 0.0:
            dist_km = 3.0 # fallback
        if cross_streets == 0:
            cross_streets = len(path) // 3 + 2
            
        # Calculate time based on variables and distance
        speed_kmh = 22.0
        if req.rain:
            speed_kmh -= 6.0
        if req.peak_hour:
            speed_kmh -= 8.0
        if req.deployed_officers > 0:
            speed_kmh += min(4.0, req.deployed_officers * 0.4)
        speed_kmh = max(6.0, speed_kmh)
        
        base_time = round((dist_km / speed_kmh) * 60.0)
        
        routes.append({
            "id": f"dyn_route_{i+1}",
            "name": route_names[i],
            "points": coords,
            "distanceKm": dist_km,
            "crossStreets": cross_streets,
            "strikes": 0,
            "status": "Active",
            "baseTimeMin": base_time
        })
        
    # If we failed to find any route, fallback to straight line
    if not routes:
        routes = [
            {
                "id": "dyn_route_1",
                "name": "Route A · Straight-Line Fallback (Model OP)",
                "points": [list(start_pt), list(end_pt)],
                "distanceKm": 6.0,
                "crossStreets": 8,
                "strikes": 0,
                "status": "Active",
                "baseTimeMin": 25
            }
        ]
        
    return {
        "routes": routes,
        "s_impact": joint_s_impact,
        "strike_threshold": joint_strike_threshold,
        "warnings": warnings_list,
        "inferences_run": inferences_run
    }


class IncidentItem(BaseModel):
    id: str
    kind: str
    severity: str
    location: str
    description: str
    status: str
    createdAt: float
    score: float
    requested_officers: int
    lat: float
    lng: float

class StationItem(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    officersAvailable: int
    responseMin: int
    successRate: int
    efficiency: int

class DispatchPlanVariables(BaseModel):
    rain: bool
    peakHour: bool

class DispatchPlanRequest(BaseModel):
    incidents: list[IncidentItem]
    stations: list[StationItem]
    variables: DispatchPlanVariables


def build_kinematic_weights(graph, rain: bool, peak_hour: bool, incident_coords: list) -> dict:
    overrides = {}
    for u, v, k, data in graph.edges(keys=True, data=True):
        length = data.get("length", 1.0)
        maxspeed = data.get("maxspeed", 40.0)
        
        # Maxspeed parsing
        v_free = 40.0
        if isinstance(maxspeed, list):
            maxspeed = maxspeed[0]
        if isinstance(maxspeed, str):
            try:
                m = re.search(r"\d+", maxspeed)
                if m:
                    v_free = float(m.group())
            except Exception:
                v_free = 40.0
        elif isinstance(maxspeed, (int, float)):
            v_free = float(maxspeed)
            
        highway = data.get("highway", "")
        if isinstance(highway, list):
            highway = highway[0] if highway else ""
            
        c_base = 0.10
        if highway in ["motorway", "trunk"]:
            c_base = 0.30
        elif highway in ["primary"]:
            c_base = 0.25
        elif highway in ["secondary"]:
            c_base = 0.20
        elif highway in ["tertiary"]:
            c_base = 0.15
            
        c_weather = 0.20 if rain else 0.0
        c_time = 0.30 if peak_hour else 0.0
        
        c_prox = 0.0
        if incident_coords:
            node_lat = graph.nodes[u].get("y", 12.9716)
            node_lng = graph.nodes[u].get("x", 77.5946)
            for lat, lng in incident_coords:
                dist = haversine_distance(node_lat, node_lng, lat, lng)
                if dist <= 1.5:
                    c_prox += 0.40 * (1.5 - dist) / 1.5
                    
        c_level = min(0.99, max(0.0, c_base + c_weather + c_time + c_prox))
        v_effective = max(5.0, v_free * (1.0 - c_level))
        
        # travel time in minutes: (length / 1000) / v_effective * 60 = length * 0.06 / v_effective
        t_edge = (length * 0.06) / v_effective
        overrides[(u, v, k)] = t_edge
        
    return overrides


def make_kinematic_weight_fn(overrides: dict):
    def weight_fn(u, v, edge_dict):
        best = float("inf")
        for k, data in edge_dict.items():
            w = overrides.get((u, v, k), None)
            if w is None:
                w = data.get("length", 1.0) * 0.0015
            if w < best:
                best = w
        return best
    return weight_fn


@app.post("/api/dispatch-plan")
async def get_dispatch_plan(req: DispatchPlanRequest):
    global G
    reload_graph_if_changed()
    if G is None:
        raise HTTPException(status_code=500, detail="Graph not initialized")

    rain = req.variables.rain
    peak_hour = req.variables.peakHour
    incident_coords = [(inc.lat, inc.lng) for inc in req.incidents]
    
    # 1. Pre-calculate travel times for all stations to all incidents
    kinematic_weights = build_kinematic_weights(G, rain, peak_hour, incident_coords)
    weight_fn = make_kinematic_weight_fn(kinematic_weights)
    
    # Map station name to details and track available officer counts dynamically
    available_officers = {s.name: s.officersAvailable for s in req.stations}
    station_nodes = {}
    for s in req.stations:
        try:
            station_nodes[s.name] = ox.nearest_nodes(G, X=s.lng, Y=s.lat)
        except Exception:
            station_nodes[s.name] = None
            
    # Pre-build response structures
    station_allocs_dict = {
        s.name: {
            "station": s.name,
            "available": s.officersAvailable,
            "eta": s.responseMin,
            "allocations": []
        }
        for s in req.stations
    }
    
    incident_allocs = []
    deployment_orders = []
    
    # Sort incidents by score descending (highest priority gets allocated first)
    sorted_incidents = sorted(req.incidents, key=lambda x: x.score, reverse=True)
    
    for inc in sorted_incidents:
        try:
            inc_node = ox.nearest_nodes(G, X=inc.lng, Y=inc.lat)
        except Exception:
            inc_node = None
        o_req = inc.requested_officers
        
        # Calculate travel time for all stations to this incident
        station_etas = {}
        for s in req.stations:
            s_node = station_nodes[s.name]
            if s_node is not None and inc_node is not None:
                try:
                    travel_time = nx.shortest_path_length(G, s_node, inc_node, weight=weight_fn)
                    travel_time = round(travel_time, 1)
                except Exception:
                    dist = haversine_distance(s.lat, s.lng, inc.lat, inc.lng)
                    travel_time = round((dist / 30.0) * 60.0, 1)
            else:
                dist = haversine_distance(s.lat, s.lng, inc.lat, inc.lng)
                travel_time = round((dist / 30.0) * 60.0, 1)
            station_etas[s.name] = travel_time
            
        # Single station scores
        single_scores = []
        for s in req.stations:
            o_avail = available_officers[s.name]
            p_deficit = max(0, o_req - o_avail)
            s_dispatch = round(1.0 * station_etas[s.name] + 10.0 * p_deficit, 1)
            single_scores.append((s, s_dispatch, p_deficit))
            
        # Find best single station
        best_single_station, best_single_score, best_single_deficit = min(single_scores, key=lambda x: x[1])
        
        chosen_stations = [best_single_station]
        is_swarm = False
        final_score = best_single_score
        
        # Swarm Protocol Trigger
        if best_single_deficit > 0:
            # Find the 3 nearest neighbors to the best station by travel time
            other_stations = [s for s in req.stations if s.name != best_single_station.name]
            other_stations.sort(key=lambda s: station_etas[s.name])
            neighbors = other_stations[:3]
            
            swarm_options = []
            # Combos of size 2
            for n in neighbors:
                swarm_options.append([best_single_station, n])
            # Combos of size 3
            if len(neighbors) >= 2:
                for n1, n2 in itertools.combinations(neighbors, 2):
                    swarm_options.append([best_single_station, n1, n2])
                    
            best_swarm_option = None
            best_swarm_score = float("inf")
            
            for option in swarm_options:
                k = len(option)
                max_arrival = max(station_etas[s.name] for s in option)
                combined_avail = sum(available_officers[s.name] for s in option)
                p_deficit_swarm = max(0, o_req - combined_avail)
                s_swarm = round(1.0 * max_arrival + 5.0 * (k - 1) + 10.0 * p_deficit_swarm, 1)
                
                if s_swarm < best_swarm_score:
                    best_swarm_score = s_swarm
                    best_swarm_option = option
            
            if best_swarm_score < best_single_score:
                chosen_stations = best_swarm_option
                is_swarm = True
                final_score = best_swarm_score
                
        # Allocate officers
        allocated_details = []
        needed = o_req
        
        # Sort chosen stations: primary (best_single) first, then neighbors by ETA
        sorted_chosen = [chosen_stations[0]]
        if len(chosen_stations) > 1:
            sorted_chosen.extend(sorted(chosen_stations[1:], key=lambda s: station_etas[s.name]))
            
        for s in sorted_chosen:
            if needed <= 0:
                break
            avail = available_officers[s.name]
            assigned = min(needed, avail)
            if assigned > 0:
                available_officers[s.name] -= assigned
                station_allocs_dict[s.name]["available"] = available_officers[s.name]
                
                alloc_item = {
                    "incidentId": inc.id,
                    "incidentLabel": f"{inc.kind} @ {inc.location}",
                    "officers": assigned,
                    "eta": station_etas[s.name],
                    "station": s.name
                }
                station_allocs_dict[s.name]["allocations"].append(alloc_item)
                allocated_details.append({
                    "station": s.name,
                    "officers": assigned,
                    "eta": station_etas[s.name]
                })
                needed -= assigned
                
        total_assigned = o_req - needed
        
        incident_allocs.append({
            "id": inc.id,
            "label": f"{inc.kind} @ {inc.location}",
            "score": inc.score,
            "requested": o_req,
            "assigned": total_assigned,
            "stations": allocated_details
        })
        
        # Deployment Order Note and Status
        is_dispatched = inc.status == "Dispatched"
        is_resolved = inc.status == "Resolved"
        
        if total_assigned > 0:
            if is_swarm:
                sources_str = ", ".join(f"{s['station']} ({s['officers']})" for s in allocated_details)
                note_str = f"Swarm Protocol: Dispatched {total_assigned} officers from {sources_str}."
            else:
                note_str = f"Dispatched {total_assigned} officers from {allocated_details[0]['station']} (ETA {allocated_details[0]['eta']} min)."
        else:
            note_str = f"Needs {o_req} officers. Shortage across neighboring stations."
            
        max_eta = max((s["eta"] for s in allocated_details), default=0.0)
        
        deployment_orders.append({
            "id": inc.id,
            "incidentId": inc.id,
            "incidentLabel": f"{inc.kind} @ {inc.location}",
            "officers": total_assigned,
            "stations": allocated_details,
            "eta": max_eta if total_assigned > 0 else None,
            "note": note_str,
            "status": "Dispatched" if is_dispatched else ("Staged" if total_assigned > 0 else "Pending")
        })
        
    # Autoreinforcement selection (best remaining station)
    # 1. Map active incidents to their closest station based on Haversine distance
    station_incidents = {s.name: [] for s in req.stations}
    for inc in req.incidents:
        if inc.status == "Resolved":
            continue
        closest_station_name = None
        min_dist = float("inf")
        for s in req.stations:
            dist = haversine_distance(s.lat, s.lng, inc.lat, inc.lng)
            if dist < min_dist:
                min_dist = dist
                closest_station_name = s.name
        if closest_station_name:
            station_incidents[closest_station_name].append(inc)

    # 2. Compute reinforcement benefit scores for all stations
    now_ms = int(time.time() * 1000)
    sev_map = {"Low": 18, "Medium": 38, "High": 60, "Critical": 82}
    reinforcement_benefits = []
    
    for s in req.stations:
        inc_list = station_incidents[s.name]
        if not inc_list:
            score = 0
            reasons = ["No active incidents in station area"]
        else:
            B_base = max(sev_map.get(inc.severity, 18) for inc in inc_list)
            
            # Age escalation
            age_escalations = []
            for inc in inc_list:
                age_min = max(0, int((now_ms - inc.createdAt) / 60000))
                if age_min >= 25:
                    age_escalations.append(22)
                elif age_min >= 10:
                    age_escalations.append(12)
                else:
                    age_escalations.append(0)
            A_esc = max(age_escalations) if age_escalations else 0
            
            # Clustering/Corridor
            n_incidents = len(inc_list)
            C_corridor = (10 + (n_incidents - 1) * 8) if n_incidents >= 2 else 0
            
            # Mitigation Adjustment (officersAvailable represents current staffing)
            M_adj = -2 * s.officersAvailable
            
            score = max(0, min(100, B_base + A_esc + C_corridor + M_adj))
            reasons = [
                f"Base severity: {B_base}",
                f"Age escalation: +{A_esc}",
                f"Clustering: +{C_corridor}",
                f"Mitigation: {M_adj}"
            ]
            
        reinforcement_benefits.append({
            "station": s.name,
            "score": score,
            "reasons": reasons
        })
        
    sorted_benefits = sorted(reinforcement_benefits, key=lambda x: x["score"], reverse=True)
    
    best_reinforcement = None
    if sorted_benefits and sorted_benefits[0]["score"] > 0:
        target_name = sorted_benefits[0]["station"]
        target_station = next(s for s in req.stations if s.name == target_name)
        best_reinforcement = {
            "station": target_name,
            "score": sorted_benefits[0]["score"],
            "eta": target_station.responseMin,
            "reasons": sorted_benefits[0]["reasons"]
        }
        
    # Team assignments
    team_assignments = []
    labels = ["Alpha", "Bravo", "Charlie", "Delta"]
    capabilities = [
        ["Signal Control", "Traffic Diversion"],
        ["Parking Management", "Crowd Flow"],
        ["Barricading", "Route Security"],
        ["Emergency Response", "Rapid Extraction"],
    ]
    for index, item in enumerate(sorted_incidents[:4]):
        members = min(10, max(6, int(round(item.score / 12.0))))
        team_assignments.append({
            "name": labels[index],
            "members": members,
            "capabilities": capabilities[index],
            "incidentLabel": f"{item.kind} · {item.location}"
        })
        
    return {
        "stationAllocations": list(station_allocs_dict.values()),
        "incidentAllocations": incident_allocs,
        "bestReinforcement": best_reinforcement,
        "teamAssignments": team_assignments,
        "deploymentOrders": deployment_orders,
        "reinforcementBenefits": sorted_benefits
    }


class RetrainRequest(BaseModel):
    id: str
    event_type: str
    latitude: float
    longitude: float
    endlatitude: float | None = 0.0
    endlongitude: float | None = 0.0
    event_cause: str
    created_date: str
    actual_duration_mins: float
    zone: str
    corridor: str
    description: str | None = ""
    priority: str

def append_feedback_to_csv(data_path, feedback_item):
    try:
        df = pd.read_csv(data_path)
        new_row = {}
        for col in df.columns:
            new_row[col] = feedback_item.get(col, None)
        new_row['id'] = feedback_item.get('id', 'FKID999999')
        df_new = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df_new.to_csv(data_path, index=False)
        print(f"[dataset] Appended row to {data_path}. Total rows: {len(df_new)}")
    except Exception as e:
        print(f"[dataset] Error appending to CSV: {e}")
        raise e

def retrain_model_sync():
    global model, T_BASE_MAP, GLOBAL_MEDIAN_T_BASE
    print("[retrain] Starting synchronous model training...")
    try:
        import sys
        model_dir = os.path.join(BACKEND_DIR, "model")
        if model_dir not in sys.path:
            sys.path.append(model_dir)
        from model_training import load_and_clean_data, engineer_features, train_impact_engine
        
        df_clean = load_and_clean_data(DATASET_PATH)
        df_engineered, feature_list = engineer_features(df_clean)
        df_scored, trained_pipeline = train_impact_engine(df_engineered, feature_list)
        
        # Save to dual_intake_model.pkl
        joblib.dump(trained_pipeline, MODEL_PATH)
        
        # Update in-memory references
        model = trained_pipeline
        
        # Rebuild T_BASE_MAP
        t_base_df = df_clean.groupby(['zone', 'event_cause'])['duration_mins'].median().reset_index()
        new_t_base_map = {}
        for _, row in t_base_df.iterrows():
            key = (str(row['zone']).strip().lower(), str(row['event_cause']).strip().lower())
            new_t_base_map[key] = float(row['duration_mins'])
            
        T_BASE_MAP = new_t_base_map
        GLOBAL_MEDIAN_T_BASE = float(df_clean['duration_mins'].median())
        
        print("[retrain] Model retraining complete and reloaded successfully.")
    except Exception as e:
        print(f"[retrain] Error during retraining: {e}")
        raise e

@app.post("/api/retrain")
async def post_retrain(req: RetrainRequest):
    import datetime
    
    try:
        dt_str = req.created_date.replace("Z", "")
        if "." in dt_str:
            dt_str = dt_str.split(".")[0]
        dt = datetime.datetime.fromisoformat(dt_str)
    except Exception as ex:
        print(f"[retrain] Datetime parse failed for {req.created_date}: {ex}")
        dt = datetime.datetime.now()
        
    closed_dt = dt + datetime.timedelta(minutes=req.actual_duration_mins)
    
    created_date_str = dt.strftime("%Y-%m-%d %H:%M:%S")
    closed_datetime_str = closed_dt.strftime("%Y-%m-%d %H:%M:%S")
    
    feedback_item = {
        "id": req.id,
        "event_type": req.event_type,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "endlatitude": req.endlatitude or 0.0,
        "endlongitude": req.endlongitude or 0.0,
        "event_cause": req.event_cause,
        "created_date": created_date_str,
        "closed_datetime": closed_datetime_str,
        "status": "closed",
        "priority": req.priority,
        "zone": req.zone,
        "corridor": req.corridor,
        "description": req.description or "",
        "reason_breakdown": req.description or ""
    }
    
    append_feedback_to_csv(DATASET_PATH, feedback_item)
    retrain_model_sync()
    
    return {"status": "success"}


class ActionPlanRequest(BaseModel):
    briefing: str

@app.post("/api/generate-action-plan")
async def post_generate_action_plan(req: ActionPlanRequest):
    lovable_api_key = os.environ.get("LOVABLE_API_KEY")
    if not lovable_api_key:
        raise HTTPException(status_code=500, detail="LOVABLE_API_KEY environment variable is not set")
    
    system_prompt = (
        "You are GridMind AI, a senior traffic-operations commander for the Bengaluru City Traffic Police. "
        "Write a concise, decisive, field-ready EVENT ACTION PLAN that an officer can execute immediately. "
        "Use plain text only (no markdown symbols like # or *). Use UPPERCASE section headers and short dash bullets. "
        "Include these sections in order: SITUATION, OBJECTIVE, DEPLOYMENT, TRAFFIC CONTROL, DIVERSIONS, EMERGENCY CORRIDOR, "
        "ESCALATION TRIGGERS, COMMS & PUBLIC ADVISORY, and PRIOR-EVENT LESSON. "
        "Be specific and operational. Keep the whole plan under 350 words."
    )
    
    url = "https://ai.gateway.lovable.dev/v1/chat/completions"
    headers = {
        "Lovable-API-Key": lovable_api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "model": "google/gemini-3-flash-preview",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate the action plan from this structured briefing:\n\n{req.briefing}"}
        ]
    }
    
    import requests
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=30)
        if res.status_code != 200:
            return {"plan": "", "source": "error", "error": f"AI Gateway returned status {res.status_code}: {res.text}", "status": res.status_code}
        
        data = res.json()
        choice_text = data["choices"][0]["message"]["content"]
        return {"plan": choice_text.strip(), "source": "ai"}
    except Exception as e:
        return {"plan": "", "source": "error", "error": str(e), "status": 500}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
