import re
from backend.models.traffic import ClosedRoad, Variables
from backend.models.prediction import WhatIfRequest
from backend.graph.route_optimizer import build_weight_overrides, compute_route, get_path_metrics
from backend.utils.helpers import get_graph

def process_command_query(req: WhatIfRequest) -> dict:
    G = get_graph()
    if G is None:
        return {"error": "Graph not initialized"}
        
    query_lower = req.query.lower().strip()
    new_closed = list(req.closedRoads)
    new_officers = req.variables.deployedOfficers
    title = "What-If Projection"
    desc = ""
    query_matched = False

    if "close mg road" in query_lower or "mg road closed" in query_lower or "avoid mg road" in query_lower:
        if "mg road" not in [r.name.lower() for r in new_closed]:
            new_closed.append(ClosedRoad(name="MG Road", lat=12.9736, lng=77.6074))
        title = "MG Road Closed"
        desc = "MG Road closed. Rerouted major corridors via Cubbon Road & Queens Road."
        query_matched = True

    if "gate 3" in query_lower:
        if "gate 3 exit" not in [r.name.lower() for r in new_closed]:
            new_closed.append(ClosedRoad(name="Gate 3 Exit", lat=12.9788, lng=77.5996))
        title = "Gate 3 Exit Closed"
        desc = "Gate 3 Exit closed. Forced dispersing match crowd northwards."
        query_matched = True

    if "queens road" in query_lower and ("one way" in query_lower or "one-way" in query_lower or "convert" in query_lower):
        if "queens road" not in [r.name.lower() for r in new_closed]:
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

    # Resolve waypoints
    from osmnx import nearest_nodes
    nodes = [nearest_nodes(G, X=p[1], Y=p[0]) for p in req.waypoints]

    # Calculate baseline
    overrides_base = build_weight_overrides(G, rain=False, peak_hour=False,
                                            deployed_officers=0,
                                            closed_roads=req.closedRoads)
    path_base = compute_route(G, nodes, overrides_base)
    len_base, weight_base = get_path_metrics(G, path_base, overrides_base)

    # Calculate modified
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
    if "mg road" in [r.name.lower() for r in new_closed]:
        spillover = [{"road": "Queens Road Flow", "delta": 8},
                     {"road": "Cubbon Road Flow", "delta": 12},
                     {"road": "Richmond Circle", "delta": 4}]
    elif "gate 3 exit" in [r.name.lower() for r in new_closed]:
        spillover = [{"road": "Queens Road Flow", "delta": -6},
                     {"road": "Cubbon Road Flow", "delta": 4}]
    elif "queens road" in [r.name.lower() for r in new_closed]:
        spillover = [{"road": "Queens Road Capacity", "delta": 35},
                     {"road": "Cubbon Road Flow", "delta": -8}]
    else:
        reduction = congestion_before - congestion_after
        spillover = [{"road": "Primary Corridor", "delta": -int(reduction * 0.8)},
                     {"road": "Adjacent Junctions", "delta": -int(reduction * 0.4)}]

    recommendations = []
    if "mg road" in [r.name.lower() for r in new_closed]:
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
