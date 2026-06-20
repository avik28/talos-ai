import os
import time
import osmnx as ox
from backend.utils.constants import GRAPH_PATH
from backend.utils.logger import get_logger

logger = get_logger("helpers")

G = None
LAST_MAPPING_TIME = 0.0

def load_graph():
    global G, LAST_MAPPING_TIME
    try:
        if os.path.exists(GRAPH_PATH):
            mtime = os.path.getmtime(GRAPH_PATH)
            if mtime > LAST_MAPPING_TIME:
                logger.info(f"Loading graph from disk at {GRAPH_PATH}...")
                t0 = time.time()
                new_G = ox.load_graphml(GRAPH_PATH)
                G = new_G
                LAST_MAPPING_TIME = mtime
                logger.info(f"Loaded {len(G)} nodes / {len(G.edges())} edges in {time.time()-t0:.1f}s")
        else:
            logger.warning(f"Graph file not found at {GRAPH_PATH}")
    except Exception as e:
        logger.error(f"Error loading graph: {e}")
    return G

def get_graph():
    global G
    if G is None:
        load_graph()
    return G
