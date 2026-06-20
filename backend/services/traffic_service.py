import osmnx as ox
from backend.utils.helpers import get_graph
from backend.graph.route_optimizer import build_weight_overrides, compute_route, ClosedRoad
from backend.utils.logger import get_logger

logger = get_logger("traffic_service")

def calculate_route_points(waypoints: list[list[float]], closed_roads: list[ClosedRoad], rain: bool, peak_hour: bool, deployed_officers: int) -> list[list[float]]:
    G = get_graph()
    if G is None:
        logger.error("Graph is not initialized.")
        return []
    
    if not waypoints:
        return []
    
    try:
        # Resolve waypoints to graph nodes
        nodes = [ox.nearest_nodes(G, X=p[1], Y=p[0]) for p in waypoints]
        
        # Build weight overrides based on closure and weather parameters
        overrides = build_weight_overrides(
            G, 
            rain=rain, 
            peak_hour=peak_hour,
            deployed_officers=deployed_officers,
            closed_roads=closed_roads
        )
        
        # Compute optimized path
        full_path = compute_route(G, nodes, overrides)
        
        # Fallback to pure length routing if no path found
        if not full_path:
            full_path = compute_route(G, nodes, {})
            
        if not full_path:
            return waypoints
            
        coords = [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in full_path]
        return coords
    except Exception as e:
        logger.error(f"Error computing route: {e}")
        return waypoints
