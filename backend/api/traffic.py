from fastapi import APIRouter, HTTPException
from backend.models.traffic import RouteRequest
from backend.services.traffic_service import calculate_route_points
from backend.utils.logger import get_logger

logger = get_logger("api_traffic")
router = APIRouter(prefix="/api")

@router.post("/route")
async def get_route(req: RouteRequest):
    logger.info(f"Received routing request. Waypoints: {len(req.waypoints)}")
    
    rain = req.variables.rain if req.variables else False
    peak_hour = req.variables.peakHour if req.variables else False
    deployed_officers = req.variables.deployedOfficers if req.variables else 0
    
    try:
        points = calculate_route_points(
            waypoints=req.waypoints,
            closed_roads=req.closedRoads,
            rain=rain,
            peak_hour=peak_hour,
            deployed_officers=deployed_officers
        )
        return {"points": points}
    except Exception as e:
        logger.error(f"Routing request failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate path.")
