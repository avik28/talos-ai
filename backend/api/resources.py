from fastapi import APIRouter
from backend.services.resource_service import recommend_resources
from pydantic import BaseModel

router = APIRouter(prefix="/api/resources")

class ResourceRequest(BaseModel):
    planned: bool
    impact_score: float
    cross_streets: int
    distance_km: float
    attendees: int = 15000

@router.post("/recommend")
async def get_resource_recommendation(req: ResourceRequest):
    recommendation = recommend_resources(
        planned=req.planned,
        impact_score=req.impact_score,
        cross_streets=req.cross_streets,
        distance_km=req.distance_km,
        attendees=req.attendees
    )
    return recommendation
