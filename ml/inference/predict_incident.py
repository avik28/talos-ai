import os
import joblib
import pandas as pd
from backend.utils.constants import INCIDENT_PREDICTOR_PATH
from backend.utils.logger import get_logger

logger = get_logger("predict_incident")

model = None
if os.path.exists(INCIDENT_PREDICTOR_PATH):
    model = joblib.load(INCIDENT_PREDICTOR_PATH)

def predict_road_closure(event_cause: str, latitude: float, longitude: float, priority: str) -> bool:
    global model
    if model is None:
        if os.path.exists(INCIDENT_PREDICTOR_PATH):
            model = joblib.load(INCIDENT_PREDICTOR_PATH)
        else:
            logger.warning("Incident classification model not trained yet, returning default.")
            return False
            
    input_df = pd.DataFrame([{
        'event_cause': event_cause,
        'latitude': latitude,
        'longitude': longitude,
        'priority': priority
    }])
    
    return bool(model.predict(input_df)[0] == 1)
