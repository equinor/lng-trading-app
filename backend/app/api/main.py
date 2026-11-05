from fastapi import APIRouter

from app.api.routes import utils
from app.core.config import settings
from app.features.news.router import router as news_router
from app.features.pipeline.router import router as pipeline_router
from app.features.pipeline_nominations.router import router as pipeline_nominations_router

api_router = APIRouter()
# api_router.include_router(login.router)
# api_router.include_router(users.router)
api_router.include_router(news_router, prefix="/news", tags=["news"])
api_router.include_router(pipeline_router, prefix="/news/pipeline", tags=["pipeline"])
api_router.include_router(
    pipeline_nominations_router,
    prefix="/pipeline-nominations",
    tags=["pipeline-nominations"],
)
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])
# api_router.include_router(items.router)


# if settings.ENVIRONMENT == "local":
#     api_router.include_router(private.router)
