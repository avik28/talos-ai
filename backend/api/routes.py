from fastapi import APIRouter
from backend.api.traffic import router as traffic_router
from backend.api.incidents import router as incidents_router
from backend.api.resources import router as resources_router
from backend.api.forecasting import router as forecasting_router
from backend.api.ai import router as ai_router

api_router = APIRouter()

# Mount all endpoint routers
api_router.include_router(traffic_router)
api_router.include_router(incidents_router)
api_router.include_router(resources_router)
api_router.include_router(forecasting_router)
api_router.include_router(ai_router)
