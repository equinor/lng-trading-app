from __future__ import annotations

from app.core.cache import TTLCache
from app.features.mid_term_curves.repository import MidTermCurvesRepository
from app.features.mid_term_curves.schemas import CustomCurveMonthInput, CurvePrices

_CACHE_TTL = 900.0


class MidTermCurvesService:
    def __init__(self, repo: MidTermCurvesRepository) -> None:
        self._repo = repo
        self._prices: TTLCache[list[CurvePrices]] = TTLCache(_CACHE_TTL)

    def list_prices(self) -> list[CurvePrices]:
        return self._prices.get_or_load(
            lambda: [CurvePrices(**row) for row in self._repo.list_prices()]
        )

    def list_custom_curves(self) -> list[dict]:
        return self._repo.list_custom_curves()

    def save_custom_curve(
        self,
        curve_id: str | None,
        curve_name: str,
        months: list[CustomCurveMonthInput],
        created_by: str,
    ) -> str:
        return self._repo.save_custom_curve(
            curve_id,
            curve_name,
            [month.model_dump() for month in months],
            created_by,
        )

    def delete_custom_curve(self, curve_id: str) -> None:
        self._repo.delete_custom_curve(curve_id)