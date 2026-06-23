import os
import osmnx as ox
import networkx as nx

def bootstrap():
    print("Initializing OSMnx configuration...")
    ox.settings.use_cache = True
    ox.settings.log_console = True

    # Bounding box covering Devanahalli (Airport Rd) to the north
    # and all other key zones (MG Road, Hebbal, Whitefield)
    west = 77.45
    south = 12.85
    east = 77.78
    north = 13.27

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(backend_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, "bangalore.graphml")

    print(f"Target bounding box: N:{north}, S:{south}, E:{east}, W:{west}")

    # --- Phase 1: Highways (motorway, trunk, primary) ---
    print("\n--- Phase 1: Downloading Highways (motorway, trunk, primary) ---")
    try:
        # Download without initial simplification to preserve connection points for next phases
        G_raw = ox.graph_from_bbox(
            bbox=(west, south, east, north),
            network_type="drive",
            custom_filter='["highway"~"motorway|trunk|primary"]',
            simplify=False
        )
        print(f"Phase 1 downloaded raw graph: {len(G_raw)} nodes, {len(G_raw.edges())} edges.")
        
        # Simplify for saving and backend loading
        G_simple = ox.simplify_graph(G_raw)
        print(f"Phase 1 simplified graph: {len(G_simple)} nodes, {len(G_simple.edges())} edges.")
        print(f"Saving Phase 1 graph to {filepath}...")
        ox.save_graphml(G_simple, filepath=filepath)
        print("Phase 1 successfully saved!")
    except Exception as e:
        print(f"CRITICAL ERROR in Phase 1: {e}")
        return

    # --- Phase 2: Major Streets (secondary, tertiary) ---
    print("\n--- Phase 2: Downloading Major Streets (secondary, tertiary) ---")
    try:
        G2_raw = ox.graph_from_bbox(
            bbox=(west, south, east, north),
            network_type="drive",
            custom_filter='["highway"~"secondary|tertiary"]',
            simplify=False
        )
        print(f"Phase 2 downloaded raw graph: {len(G2_raw)} nodes, {len(G2_raw.edges())} edges.")
        
        # Merge raw graphs to preserve exact intersection topology
        print("Merging Phase 1 and Phase 2 raw graphs...")
        G_raw = nx.compose(G_raw, G2_raw)
        print(f"Merged raw graph: {len(G_raw)} nodes, {len(G_raw.edges())} edges.")
        
        # Simplify the merged graph
        G_simple = ox.simplify_graph(G_raw)
        print(f"Merged simplified graph: {len(G_simple)} nodes, {len(G_simple.edges())} edges.")
        print(f"Saving Phase 2 graph to {filepath}...")
        ox.save_graphml(G_simple, filepath=filepath)
        print("Phase 2 successfully saved!")
    except Exception as e:
        print(f"ERROR in Phase 2: {e}. Proceeding with Phase 1 graph.")

    # --- Phase 3: Minor Streets (residential, unclassified) ---
    print("\n--- Phase 3: Downloading Minor Streets (residential, unclassified) ---")
    try:
        G3_raw = ox.graph_from_bbox(
            bbox=(west, south, east, north),
            network_type="drive",
            custom_filter='["highway"~"residential|unclassified"]',
            simplify=False
        )
        print(f"Phase 3 downloaded raw graph: {len(G3_raw)} nodes, {len(G3_raw.edges())} edges.")
        
        # Merge raw graphs to preserve exact intersection topology
        print("Merging with Phase 3 raw graph...")
        G_raw = nx.compose(G_raw, G3_raw)
        print(f"Final merged raw graph: {len(G_raw)} nodes, {len(G_raw.edges())} edges.")
        
        # Simplify the final merged graph
        G_simple = ox.simplify_graph(G_raw)
        print(f"Final simplified graph: {len(G_simple)} nodes, {len(G_simple.edges())} edges.")
        print(f"Saving final graph to {filepath}...")
        ox.save_graphml(G_simple, filepath=filepath)
        print("Phase 3 successfully saved! All bootstrapping completed.")
    except Exception as e:
        print(f"ERROR in Phase 3: {e}. Proceeding with Phase 2 graph.")

if __name__ == "__main__":
    bootstrap()
