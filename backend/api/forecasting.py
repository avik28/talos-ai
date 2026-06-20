from fastapi import APIRouter
from backend.models.prediction import ForecastRequest
from backend.services.forecasting_service import forecast_clearance_time

router = APIRouter(prefix="/api/forecasting")

@router.post("/clearance")
async def get_clearance_forecast(req: ForecastRequest):
    clearance_min = forecast_clearance_time(
        event_cause=req.event_cause,
        latitude=req.latitude,
        longitude=req.longitude,
        priority=req.priority,
        requires_road_closure=req.requires_road_closure
    )
    return {
        "event_cause": req.event_cause,
        "predicted_clearance_min": clearance_min
    }
