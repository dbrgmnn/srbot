"""
Main entry point for the SRBot application.
Initializes the database, Telegram bot, scheduler, and API server.
"""
import asyncio
import logging
import signal

from aiogram import Bot, Dispatcher

from config import load_config
from db.models import init_db
from db.repository import UserRepo
from core.scheduler import setup_scheduler
from core.bot_handlers import setup_handlers
from api.server import start_api_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
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

    api_runner = await start_api_server(config, db, scheduler)
    logger.info("Scheduler and API Server started")

    polling_task = asyncio.create_task(dp.start_polling(bot))
    logger.info("Starting...")

    stop_event = asyncio.Event()

    def handle_signal():
        """Set the stop event on signal reception."""
        stop_event.set()

    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, handle_signal)
    loop.add_signal_handler(signal.SIGINT, handle_signal)

    try:
        await stop_event.wait()
    finally:
        logger.info("Stopping...")
        polling_task.cancel()
        if scheduler:
            scheduler.shutdown(wait=False)
        try:
            await asyncio.wait_for(asyncio.gather(
                api_runner.cleanup(),
                db.close(),
                bot.session.close(),
                return_exceptions=True
            ), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("Cleanup timed out, forcing exit")
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")
        logger.info("Stopped.")

if __name__ == "__main__":
    asyncio.run(main())
