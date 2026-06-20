from pydantic import BaseModel

class ResourceRecommendation(BaseModel):
    barricades: int
    officers: int
    towTrucks: int
    ambulances: int
