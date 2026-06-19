import os
import osmnx as ox

def bootstrap():
    print("Initializing OSMnx configuration...")
    ox.settings.use_cache = True
    ox.settings.log_console = True

    # Define the bounding box enclosing Hebbal, MG Road, and Outer Ring Road corridors
    # Bounding Box: (left, bottom, right, top) -> (west, south, east, north)
    # Hebbal is around 13.0358, 77.5970
    # MG Road is around 12.9736, 77.6074
    # ORR is around 12.9959, 77.6968
    west = 77.56
    south = 12.94
    east = 77.72
    north = 13.06

    print(f"Downloading street network for bounding box: N:{north}, S:{south}, E:{east}, W:{west}...")
    
    # Download the drive street network
    G = ox.graph_from_bbox(
        bbox=(west, south, east, north),
        network_type="drive",
        simplify=True
    )
    
    # Save the graph locally in GraphML format
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(backend_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, "bangalore.graphml")
    
    print(f"Saving graph with {len(G)} nodes and {len(G.edges())} edges to {filepath}...")
    ox.save_graphml(G, filepath=filepath)
    print("Graph bootstrapped and saved successfully!")

if __name__ == "__main__":
    bootstrap()
