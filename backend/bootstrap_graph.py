import os
import time
import osmnx as ox
import networkx as nx

def bootstrap():
    print("Initializing OSMnx configuration...")
    ox.settings.use_cache = True
    ox.settings.log_console = True

    # Define a grid enclosing a much larger Bangalore area
    # Latitude: 12.85 to 13.12 (delta 0.27 -> 3 divisions)
    # Longitude: 77.45 to 77.78 (delta 0.33 -> 3 divisions)
    lat_bounds = [12.85, 12.94, 13.03, 13.12]
    lng_bounds = [77.45, 77.56, 77.67, 77.78]

    subgraphs = []

    for r in range(len(lat_bounds) - 1):
        for c in range(len(lng_bounds) - 1):
            south = lat_bounds[r]
            north = lat_bounds[r + 1]
            west = lng_bounds[c]
            east = lng_bounds[c + 1]

            print(f"Downloading cell (row={r}, col={c}): N:{north}, S:{south}, E:{east}, W:{west}...")
            try:
                # Download the drive street network for this sub-bbox
                G_sub = ox.graph_from_bbox(
                    bbox=(west, south, east, north),
                    network_type="drive",
                    simplify=True
                )
                print(f"Cell (row={r}, col={c}) completed: {len(G_sub)} nodes, {len(G_sub.edges())} edges.")
                subgraphs.append(G_sub)
            except Exception as e:
                print(f"Warning: Cell (row={r}, col={c}) could not be downloaded or has no streets: {e}")

            # Sleep to prevent Overpass rate limiting
            time.sleep(2)

    if not subgraphs:
        print("Error: No subgraphs were successfully downloaded.")
        return

    print(f"Merging {len(subgraphs)} subgraphs into a single combined graph...")
    G = nx.compose_all(subgraphs)

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
