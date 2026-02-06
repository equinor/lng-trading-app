from fastapi import APIRouter

from app.api.routes import news, utils
from app.core.config import settings

api_router = APIRouter()
# api_router.include_router(login.router)
# api_router.include_router(users.router)
api_router.include_router(news.router, prefix="/news", tags=["news"])
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])
# api_router.include_router(items.router)


# if settings.ENVIRONMENT == "local":
#     api_router.include_router(private.router)
