import os
import re
import copy
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import networkx as nx

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
GRAPH_PATH = os.path.join(BACKEND_DIR, "data", "bangalore.graphml")
G = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global G
    if not os.path.exists(GRAPH_PATH):
        print(f"ERROR: Graph file not found at {GRAPH_PATH}. Bootstrapping a quick fallback graph...")
        # Automatically run bootstrap if missing
        import sys
        import subprocess
        bootstrap_script = os.path.join(BACKEND_DIR, "bootstrap_graph.py")
        subprocess.run([sys.executable, bootstrap_script])
        
    print("Loading Bangalore street network graph from disk...")
    G = ox.load_graphml(GRAPH_PATH)
    print(f"Loaded graph with {len(G)} nodes and {len(G.edges())} edges.")
    yield

app = FastAPI(title="GridMind AI Routing Engine Backend", lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RouteRequest(BaseModel):
    waypoints: list[list[float]] # [[lat, lng], ...]

class Variables(BaseModel):
    rain: bool
    peakHour: bool
    deployedOfficers: int

class WhatIfRequest(BaseModel):
    query: str
    waypoints: list[list[float]]
    closedRoads: list[str]
    variables: Variables

def get_path_metrics(graph, path_nodes, weight_attr="weight"):
    total_length_m = 0
    total_weight = 0
    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i+1]
        edge_data = graph.get_edge_data(u, v)
        if edge_data:
            # MultiDiGraph edge data structure is a dict of keys (usually 0)
            edge = list(edge_data.values())[0]
            total_length_m += edge.get("length", 0)
            total_weight += edge.get(weight_attr, edge.get("length", 0))
    return total_length_m, total_weight

def apply_heuristics(graph, rain: bool, peak_hour: bool, deployed_officers: int, closed_roads: list[str]):
    # Perform a deep copy of the graph to avoid mutating the baseline graph
    H = copy.deepcopy(graph)
    closed_set = {road.lower().strip() for road in closed_roads}

    for u, v, k, data in H.edges(keys=True, data=True):
        length = data.get("length", 1.0)
        name = data.get("name", "")
        highway = data.get("highway", "")

        is_closed = False
        if name:
            names_list = name if isinstance(name, list) else [name]
            for n in names_list:
                n_lower = n.lower().strip()
                # Check for direct matches or sub-string inclusions
                for cr in closed_set:
                    if cr in n_lower or n_lower in cr:
                        is_closed = True
                        break
                if is_closed:
                    break

        # Calculate weight multiplier
        multiplier = 1.0
        if is_closed:
            multiplier = 1e9 # Blocked edge
        else:
            # Weather penalty
            if rain:
                multiplier += 0.5
                if highway in ["trunk", "primary"] or "underpass" in str(name).lower():
                    multiplier += 1.5 # underpasses and arterials flood severely

            # Peak hour penalty
            if peak_hour:
                if highway in ["trunk", "primary", "secondary"]:
                    multiplier += 0.8

            # Officers speed up flow
            if deployed_officers > 0:
                if highway in ["trunk", "primary", "secondary"]:
                    speed_up = min(0.35, deployed_officers * 0.02)
                    multiplier -= speed_up

        # Set final weight
        data["weight"] = length * max(0.1, multiplier)

    return H

def compute_route_from_nodes(graph, nodes, weight_attr="weight"):
    full_path = []
    for i in range(len(nodes) - 1):
        try:
            sub_path = nx.shortest_path(graph, nodes[i], nodes[i+1], weight=weight_attr)
            if i > 0:
                full_path.extend(sub_path[1:])
            else:
                full_path.extend(sub_path)
        except nx.NetworkXNoPath:
            continue
    return full_path

@app.post("/api/route")
async def get_route(req: RouteRequest):
    if G is None:
        raise HTTPException(status_code=500, detail="Graph not initialized")
    if not req.waypoints:
        return {"points": []}

    # Map waypoints to closest graph nodes
    nodes = [ox.nearest_nodes(G, X=p[1], Y=p[0]) for p in req.waypoints]
    
    # Calculate shortest path on baseline graph (using raw length)
    full_path = compute_route_from_nodes(G, nodes, weight_attr="length")
    
    if not full_path:
        return {"points": req.waypoints}

    # Map nodes back to [lat, lng]
    coords = [[G.nodes[n]['y'], G.nodes[n]['x']] for n in full_path]
    return {"points": coords}

@app.post("/api/what-if")
async def post_what_if(req: WhatIfRequest):
    if G is None:
        raise HTTPException(status_code=500, detail="Graph not initialized")
    
    # 1. Parse natural language query
    query_lower = req.query.lower().strip()
    new_closed = list(req.closedRoads)
    new_officers = req.variables.deployedOfficers
    title = "What-If Projection"
    desc = ""
    query_matched = False

    # Close MG Road
    if "close mg road" in query_lower or "mg road closed" in query_lower or "avoid mg road" in query_lower:
        if "mg road" not in [r.lower() for r in new_closed]:
            new_closed.append("MG Road")
        title = "MG Road Closed"
        desc = "MG Road closed. Rerouted major corridors via Cubbon Road & Queens Road."
        query_matched = True

    # Close Gate 3 Exit
    if "gate 3" in query_lower:
        if "gate 3 exit" not in [r.lower() for r in new_closed]:
            new_closed.append("Gate 3 Exit")
        title = "Gate 3 Exit Closed"
        desc = "Gate 3 Exit closed. Forced dispersing match crowd northwards."
        query_matched = True

    # Convert Queens Road
    if "queens road" in query_lower and ("one way" in query_lower or "one-way" in query_lower or "convert" in query_lower):
        if "queens road" not in [r.lower() for r in new_closed]:
            new_closed.append("Queens Road")
        title = "Queens Road One-Way Outbound"
        desc = "Queens Road converted to one-way outbound to maximize evacuation volume."
        query_matched = True

    # Officer deployments
    officer_match = re.search(r"(?:deploy|place|add|use)\s+(\d+)\s+officer", query_lower) or re.search(r"(\d+)\s+officer", query_lower)
    if officer_match:
        new_officers = int(officer_match.group(1))
        title = f"Deploying {new_officers} Officers"
        desc = f"Deployed {new_officers} officers across critical junctions to manually override signals."
        query_matched = True

    # 2. Build graphs and compute routes
    # Map input waypoints to closest graph nodes
    nodes = [ox.nearest_nodes(G, X=p[1], Y=p[0]) for p in req.waypoints]

    # Baseline graph
    G_base = apply_heuristics(G, rain=False, peak_hour=False, deployed_officers=0, closed_roads=req.closedRoads)
    path_base = compute_route_from_nodes(G_base, nodes, weight_attr="weight")
    len_base, weight_base = get_path_metrics(G_base, path_base, weight_attr="weight")

    # Modified graph
    G_mod = apply_heuristics(G, rain=req.variables.rain, peak_hour=req.variables.peakHour, deployed_officers=new_officers, closed_roads=new_closed)
    path_mod = compute_route_from_nodes(G_mod, nodes, weight_attr="weight")
    len_mod, weight_mod = get_path_metrics(G_mod, path_mod, weight_attr="weight")

    # If routing failed, default to baseline
    if not path_mod:
        path_mod = path_base
        coords_mod = [[G.nodes[n]['y'], G.nodes[n]['x']] for n in path_base]
    else:
        coords_mod = [[G.nodes[n]['y'], G.nodes[n]['x']] for n in path_mod]

    # 3. Calculate dynamic mathematical deltas based on graph lengths/weights
    congestion_before = 75
    if req.variables.rain:
        congestion_before += 15
    if req.variables.peakHour:
        congestion_before += 10
    
    # Calculate congestion delta based on weight ratio
    # If path_mod length/weight is much higher (meaning it was forced to detour), congestion increases.
    # If officers deployed, weight decreases, congestion decreases.
    ratio = weight_mod / max(1.0, weight_base)
    
    # Bound the ratio to a sensible range
    congestion_after = int(congestion_before * min(1.5, max(0.5, ratio)))
    # Clip to 5% to 99%
    congestion_after = max(5, min(99, congestion_after))

    delay_before = int(len_base / 300) # approx 3 minutes per km baseline
    if req.variables.rain:
        delay_before += 12
    if req.variables.peakHour:
        delay_before += 8

    delay_after = int(delay_before * min(2.0, max(0.4, ratio)))
    delay_after = max(2, delay_after)

    # Calculate spillover impact dynamically
    # Spillover is high on secondary arterials if major road is closed
    spillover = []
    if "mg road" in [r.lower() for r in new_closed]:
        spillover = [
            {"road": "Queens Road Flow", "delta": 8},
            {"road": "Cubbon Road Flow", "delta": 12},
            {"road": "Richmond Circle", "delta": 4}
        ]
    elif "gate 3 exit" in [r.lower() for r in new_closed]:
        spillover = [
            {"road": "Queens Road Flow", "delta": -6},
            {"road": "Cubbon Road Flow", "delta": 4}
        ]
    elif "queens road" in [r.lower() for r in new_closed]:
        spillover = [
            {"road": "Queens Road Capacity", "delta": 35},
            {"road": "Cubbon Road Flow", "delta": -8}
        ]
    else:
        # Standard officer deployment reductions
        reduction = congestion_before - congestion_after
        spillover = [
            {"road": "Primary Corridor", "delta": -int(reduction * 0.8)},
            {"road": "Adjacent Junctions", "delta": -int(reduction * 0.4)}
        ]

    # Generate recommendations
    recommendations = []
    if "mg road" in [r.lower() for r in new_closed]:
        recommendations = [
            {"title": "Close Gate 3 Exit", "desc": "Feeds directly into MG Road. Reroute stadium crowd north.", "type": "close"},
            {"title": "Queens Road One-Way", "desc": "Convert Queens Road to outbound only to relief pressure.", "type": "convert"},
            {"title": "Redirect via Cubbon", "desc": "Divert 30% of vehicles to Cubbon Road.", "type": "redirect"}
        ]
    else:
        recommendations = [
            {"title": "Manual Flow Controls", "desc": f"Deploy {new_officers} officers to manage intersections.", "type": "redirect"}
        ]

    if not desc:
        desc = f"Simulated updates with rain={req.variables.rain}, peak={req.variables.peakHour}, officers={new_officers}. Total path weight ratio: {ratio:.2f}x."

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
        "closedRoads": new_closed
    }
