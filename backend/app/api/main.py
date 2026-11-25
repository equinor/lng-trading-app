from fastapi import APIRouter

from app.api.routes import utils
from app.core.config import settings
from app.features.news.router import router as news_router
from app.features.pipeline.router import router as pipeline_router
from app.features.pipeline_nominations.router import router as pipeline_nominations_router
from app.features.lng_balance.router import router as lng_balance_router
from app.features.flare_monitor.router import router as flare_monitor_router
from app.features.mid_term_curves.router import router as mid_term_curves_router

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
api_router.include_router(lng_balance_router, prefix="/lng-balance", tags=["lng-balance"])
api_router.include_router(flare_monitor_router, prefix="/flare-monitor", tags=["flare-monitor"])
api_router.include_router(
    mid_term_curves_router,
    prefix="/mid-term-curves",
    tags=["mid-term-curves"],
)
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])
# api_router.include_router(items.router)


# if settings.ENVIRONMENT == "local":
#     api_router.include_router(private.router)
