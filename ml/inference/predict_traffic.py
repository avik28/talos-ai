import os
import joblib
import pandas as pd
from backend.utils.constants import TRAFFIC_FORECASTER_PATH
from backend.utils.logger import get_logger

logger = get_logger("predict_traffic")

model = None
if os.path.exists(TRAFFIC_FORECASTER_PATH):
    model = joblib.load(TRAFFIC_FORECASTER_PATH)

def predict_clearance(event_cause: str, latitude: float, longitude: float, priority: str, requires_road_closure: bool) -> float:
    global model
    if model is None:
        if os.path.exists(TRAFFIC_FORECASTER_PATH):
            model = joblib.load(TRAFFIC_FORECASTER_PATH)
        else:
            logger.warning("Traffic model not trained yet, returning default baseline.")
            return 45.0
            
    input_df = pd.DataFrame([{
        'event_cause': event_cause,
        'latitude': latitude,
        'longitude': longitude,
        'priority': priority,
        'requires_road_closure': 1 if requires_road_closure else 0
    }])
    
    return float(model.predict(input_df)[0])
