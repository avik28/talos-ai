import os
import joblib
import pandas as pd
from backend.utils.constants import TRAFFIC_FORECASTER_PATH, INCIDENT_PREDICTOR_PATH
from backend.utils.logger import get_logger

logger = get_logger("forecasting_service")

# Global variables for loaded models
traffic_model = None
incident_model = None

try:
    if os.path.exists(TRAFFIC_FORECASTER_PATH):
        traffic_model = joblib.load(TRAFFIC_FORECASTER_PATH)
        logger.info("Loaded ML traffic forecaster model.")
    if os.path.exists(INCIDENT_PREDICTOR_PATH):
        incident_model = joblib.load(INCIDENT_PREDICTOR_PATH)
        logger.info("Loaded ML incident predictor model.")
except Exception as e:
    logger.warning(f"Could not load ML models, running in fallback heuristic mode. Error: {e}")

def reload_models():
    global traffic_model, incident_model
    try:
        if os.path.exists(TRAFFIC_FORECASTER_PATH):
            traffic_model = joblib.load(TRAFFIC_FORECASTER_PATH)
            logger.info("Reloaded ML traffic forecaster model.")
        if os.path.exists(INCIDENT_PREDICTOR_PATH):
            incident_model = joblib.load(INCIDENT_PREDICTOR_PATH)
            logger.info("Reloaded ML incident predictor model.")
    except Exception as e:
        logger.error(f"Error reloading ML models: {e}")

def forecast_clearance_time(event_cause: str, latitude: float, longitude: float, priority: str, requires_road_closure: bool) -> float:
    """
    Forecasts incident clearance time in minutes.
    Uses ML model if loaded, otherwise falls back to a heuristic baseline.
    """
    global traffic_model
    if traffic_model is not None:
        try:
            # Construct a DataFrame matching the model training features
            input_df = pd.DataFrame([{
                'event_cause': event_cause,
                'latitude': latitude,
                'longitude': longitude,
                'priority': priority,
                'requires_road_closure': 1 if requires_road_closure else 0
            }])
            
            # Predict (using the pipeline or direct predictor)
            prediction = traffic_model.predict(input_df)[0]
            logger.info(f"ML Predicted clearance time: {prediction:.2f} mins")
            return float(prediction)
        except Exception as e:
            logger.warning(f"ML prediction failed: {e}. Falling back to heuristics.")
            
    # Heuristic Fallback
    base_clearance = 45.0
    if priority.lower() == "high":
        base_clearance = 60.0
    elif priority.lower() == "critical":
        base_clearance = 90.0
    elif priority.lower() == "low":
        base_clearance = 30.0
        
    if requires_road_closure:
        base_clearance += 25.0
        
    cause_multipliers = {
        "vehicle_breakdown": 1.1,
        "accident": 1.4,
        "water_logging": 1.6,
        "tree_fall": 1.2,
        "public_event": 1.5,
    }
    
    multiplier = cause_multipliers.get(event_cause.lower(), 1.0)
    return base_clearance * multiplier
