"""
Main entry point for the SRBot application.
Initializes the database, Telegram bot, scheduler, and API server.
"""

import asyncio
import logging

from aiogram import Bot, Dispatcher

from api.server import start_api_server
from config import load_config
from core.bot_handlers import setup_handlers
from core.logger import setup_logging
from core.scheduler import setup_scheduler
from db.models import init_db
from db.repository import UserRepo

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

    scheduler = await setup_scheduler(bot, db, config)
    scheduler.start()

    # Start API server in the background
    api_runner = await start_api_server(config, db, scheduler)
    logger.info("Scheduler and API Server started")

    try:
        logger.info("Starting bot polling...")
        # Aiogram handles SIGTERM and SIGINT by default
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Error during execution: {e}")
    finally:
        logger.info("Shutting down gracefully...")

        # 1. Stop API server (no longer accepting new requests)
        if api_runner:
            logger.info("Stopping API server...")
            await api_runner.cleanup()

        # 2. Shutdown scheduler
        if scheduler:
            logger.info("Shutting down scheduler...")
            scheduler.shutdown(wait=False)

        # 3. Close resources
        logger.info("Closing database and bot sessions...")

        # Cancel all other pending tasks
        pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for task in pending:
            task.cancel()

        cleanup_tasks = [
            db.close(),
            bot.session.close(),
            asyncio.gather(*pending, return_exceptions=True),
        ]

        # Wait for all cleanup tasks with a reasonable timeout
        try:
            await asyncio.wait_for(asyncio.gather(*cleanup_tasks, return_exceptions=True), timeout=10.0)
        except TimeoutError:
            logger.warning("Cleanup timed out, some resources might not have closed properly")

        logger.info("Stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
