"""Main entry point for the SRBot application."""

import asyncio
import logging

from aiogram import Bot, Dispatcher

from api.server import start_api_server
from config import load_config
from core.bot_handlers import setup_handlers
from core.logger import setup_logging
from core.scheduler import setup_scheduler
from db import UserRepo
from db.models import init_db

setup_logging()
logger = logging.getLogger(__name__)


async def main():
    """Initialize and start all system components."""
    config = load_config()

    db = await init_db(config.db_path)
    bot = Bot(token=config.bot_token)
    dp = Dispatcher()

    user_repo = UserRepo(db)
    setup_handlers(dp, user_repo, config)

    logger.info("Initializing system...")
    scheduler = await setup_scheduler(bot, db, config)
    scheduler.start()
    api_runner = await start_api_server(config, db, scheduler)
    logger.info("System ready.")

    try:
        await dp.start_polling(bot)
    except Exception as e:
        logger.error("Bot polling error: %s", e)
    finally:
        logger.info("Shutting down...")
        if api_runner:
            await api_runner.cleanup()
        if scheduler:
            scheduler.shutdown(wait=False)

        await db.close()
        await bot.session.close()

        pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        logger.info("Shutdown complete.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
