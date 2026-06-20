from pydantic import BaseModel
from backend.models.traffic import Variables, ClosedRoad

class WhatIfRequest(BaseModel):
    query: str
    waypoints: list[list[float]]
    closedRoads: list[ClosedRoad]
    variables: Variables

class ForecastRequest(BaseModel):
    event_cause: str
    latitude: float
    longitude: float
    priority: str
    requires_road_closure: bool
    veh_type: str | None = None
    corridor: str | None = None
