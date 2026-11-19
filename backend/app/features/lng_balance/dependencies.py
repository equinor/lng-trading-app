from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.features.lng_balance.repository import LngBalanceRepository
from app.features.lng_balance.service import LngBalanceService


@lru_cache
def get_lng_balance_service() -> LngBalanceService:
    return LngBalanceService(LngBalanceRepository())


LngBalanceServiceDep = Annotated[LngBalanceService, Depends(get_lng_balance_service)]
