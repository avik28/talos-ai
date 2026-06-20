import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(BACKEND_DIR)

GRAPH_PATH = os.environ.get(
    "GRAPH_PATH",
    os.path.join(ROOT_DIR, "datasets", "graph", "bangalore.graphml")
)

DATASET_PATH = os.path.join(ROOT_DIR, "datasets", "dataset.csv")

ML_MODEL_DIR = os.path.join(ROOT_DIR, "ml", "models")
TRAFFIC_FORECASTER_PATH = os.path.join(ML_MODEL_DIR, "traffic_forecaster.pkl")
INCIDENT_PREDICTOR_PATH = os.path.join(ML_MODEL_DIR, "incident_predictor.pkl")
