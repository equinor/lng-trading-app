import asyncio
import logging

from app.features.flare_monitor.collector.worker import run

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

if __name__ == "__main__":
    asyncio.run(run())
