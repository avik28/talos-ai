import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.utils.constants import GRAPH_PATH
from backend.utils.helpers import load_graph
from backend.api.routes import api_router
from backend.utils.logger import get_logger

logger = get_logger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Perform startup check for GraphML file
    if not os.path.exists(GRAPH_PATH):
        logger.info(f"Graph file not found at {GRAPH_PATH}. Bootstrapping graph...")
        try:
            from backend.graph.bootstrap_graph import bootstrap
            bootstrap()
        except Exception as e:
            logger.error(f"Error bootstrapping graph: {e}")
            
    # Load graph into memory
    load_graph()
    yield

app = FastAPI(title="GridMind AI Routing Engine Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register main API router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
