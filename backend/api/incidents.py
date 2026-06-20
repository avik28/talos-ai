from fastapi import APIRouter
from backend.services.incident_service import calculate_incident_urgency
from pydantic import BaseModel

router = APIRouter(prefix="/api/incidents")

class UrgencyRequest(BaseModel):
    severity: str
    closure_probability: float

@router.post("/urgency")
async def get_incident_urgency(req: UrgencyRequest):
    score = calculate_incident_urgency(req.severity, req.closure_probability)
    return {"urgency_score": score}
