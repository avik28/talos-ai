from pydantic import BaseModel

class Variables(BaseModel):
    rain: bool
    peakHour: bool
    deployedOfficers: int

class ClosedRoad(BaseModel):
    name: str
    lat: float | None = None
    lng: float | None = None

class RouteRequest(BaseModel):
    waypoints: list[list[float]]
    closedRoads: list[ClosedRoad] = []
    variables: Variables | None = None
