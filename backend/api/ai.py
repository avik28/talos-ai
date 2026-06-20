from fastapi import APIRouter
from backend.models.prediction import WhatIfRequest
from backend.services.ai_service import process_command_query

router = APIRouter(prefix="/api")

@router.post("/what-if")
async def post_what_if(req: WhatIfRequest):
    return process_command_query(req)
