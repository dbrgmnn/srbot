import asyncio
import logging

from aiogram import Bot

from config import load_config
from db.models import init_db
from core.scheduler import setup_scheduler
from api.server import start_api_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def main():
    config = load_config()

    db = await init_db(config.db_path)

    bot = Bot(token=config.bot_token)

    scheduler = await setup_scheduler(bot, config, db)
    scheduler.start()

    api_runner = await start_api_server(config, db, scheduler)
    logger.info(f"Scheduler started — timezone: {config.timezone}")

    logger.info("Starting...")
    try:
        await asyncio.Event().wait()
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        scheduler.shutdown()
        await api_runner.cleanup()
        await db.close()
        await bot.session.close()
        logger.info("Stopped.")


if __name__ == "__main__":
    asyncio.run(main())
