import os
import re
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import networkx as nx

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.path.exists(GRAPH_PATH):
        print(f"[graph] File not found at {GRAPH_PATH}. Running bootstrap...")
        import sys, subprocess
        bootstrap_script = os.path.join(BACKEND_DIR, "bootstrap_graph.py")
        subprocess.run([sys.executable, bootstrap_script])
    reload_graph_if_changed()
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
