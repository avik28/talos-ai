import osmnx as ox
import networkx as nx
from pydantic import BaseModel

class ClosedRoad(BaseModel):
    name: str
    lat: float | None = None
    lng: float | None = None

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
