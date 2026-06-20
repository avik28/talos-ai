from pydantic import BaseModel
from datetime import datetime

class Incident(BaseModel):
    id: str
    kind: str
    severity: str
    location: str
    description: str | None = None
    reporter: str | None = None
    status: str
    createdAt: datetime
