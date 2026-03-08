import asyncio
import logging
import signal

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


async def notify_all(bot: Bot, allowed_users: set, text: str):
    for uid in allowed_users:
        try:
            await bot.send_message(chat_id=uid, text=text)
        except Exception as e:
            logger.warning(f"Failed to notify {uid}: {e}")


async def main():
    config = load_config()

    db = await init_db(config.db_path)

    bot = Bot(token=config.bot_token)

    scheduler = await setup_scheduler(bot, config, db)
    scheduler.start()

    api_runner = await start_api_server(config, db, scheduler)
    logger.info(f"Scheduler started — timezone: {config.timezone}")

    await notify_all(bot, config.allowed_users, "🟢 srbot started")
    logger.info("Starting...")

    stop_event = asyncio.Event()

    def handle_signal():
        stop_event.set()

    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, handle_signal)
    loop.add_signal_handler(signal.SIGINT, handle_signal)

    try:
        await stop_event.wait()
    finally:
        await notify_all(bot, config.allowed_users, "🔴 srbot stopped")
        scheduler.shutdown()
        await api_runner.cleanup()
        await db.close()
        await bot.session.close()
        logger.info("Stopped.")


if __name__ == "__main__":
    asyncio.run(main())
