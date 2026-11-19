from __future__ import annotations

import logging

from app.core.cache import TTLCache
from app.features.mid_term_curves.curves import derive_prices
from app.features.mid_term_curves.repository import MidTermCurvesRepository
from app.features.mid_term_curves.schemas import CustomCurveMonthInput, CurvePrices

logger = logging.getLogger(__name__)

# The source prices change a few times a day, so every request shares one snapshot.
_PRICES_TTL = 900.0


class MidTermCurvesService:
    def __init__(self, repo: MidTermCurvesRepository) -> None:
        self._repo = repo
        self._prices: TTLCache[list[CurvePrices]] = TTLCache(_PRICES_TTL)

    def list_prices(self, refresh: bool = False) -> list[CurvePrices]:
        """Every curve for every month. `refresh` reloads the source prices instead of using the snapshot."""
        if refresh:
            self._prices.invalidate()

        def load() -> list[CurvePrices]:
            prices = [derive_prices(row) for row in self._repo.list_prices()]
            logger.info("Loaded %d months of curve prices", len(prices))
            return prices

        return self._prices.get_or_load(load)

    def list_custom_curves(self) -> list[dict]:
        # Saved curves are written by several users, so they are always read fresh.
        return self._repo.list_custom_curves()

    def save_custom_curve(
        self,
        curve_id: str | None,
        curve_name: str,
        months: list[CustomCurveMonthInput],
        created_by: str,
    ) -> str:
        saved_id = self._repo.save_custom_curve(
            curve_id,
            curve_name,
            [month.model_dump() for month in months],
            created_by,
        )
        logger.info(
            "%s custom curve %s (%d months) by %s",
            "Updated" if curve_id else "Created",
            saved_id,
            len(months),
            created_by,
        )
        return saved_id

    def delete_custom_curve(self, curve_id: str) -> None:
        self._repo.delete_custom_curve(curve_id)
        logger.info("Deleted custom curve %s", curve_id)