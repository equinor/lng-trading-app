import asyncio
import logging

from app.features.flare_monitor.collector.settings import CollectorSettings

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

if __name__ == "__main__":
    if CollectorSettings().FLARE_SOURCE == "api":
        # The image links are signed, so keep the HTTP client from logging them.
        logging.getLogger("httpx").setLevel(logging.WARNING)
        from app.features.flare_monitor.collector.api_worker import run_api

        run_api()
    else:
        from app.features.flare_monitor.collector.worker import run

        asyncio.run(run())
