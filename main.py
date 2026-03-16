import asyncio
import logging
import signal
from pathlib import Path

from aiogram import Bot, Dispatcher

from config import load_config
from db.models import init_db
from db.repository import UserRepo, WordRepo
from core.scheduler import setup_scheduler
from core.bot_handlers import setup_handlers
from api.server import start_api_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def preload_words(db, config) -> None:
    csv_path = config.data_dir / f"words_{config.default_lang}.csv"
    word_repo = WordRepo(db)
    if not csv_path.exists():
        logger.info(f"No {csv_path} found, skipping preload")
        return
        
    words = word_repo.load_csv_words(csv_path)
    if not words:
        logger.info(f"{csv_path} is empty, skipping preload")
        return
    
    user_repo = UserRepo(db)
    for telegram_id in config.allowed_users:
        user_id = await user_repo.get_or_create(telegram_id, config.default_lang, config.default_timezone, config)
        added = await word_repo.add_words_batch(user_id, config.default_lang, words)
        logger.info(f"Preload: user {telegram_id} ({config.default_lang}) — added {added} new words")


async def main():
    config = load_config()

    db = await init_db(config.db_path)
    await preload_words(db, config)

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
        stop_event.set()

    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, handle_signal)
    loop.add_signal_handler(signal.SIGINT, handle_signal)

    try:
        await stop_event.wait()
    finally:
        polling_task.cancel()
        scheduler.shutdown()
        await api_runner.cleanup()
        await db.close()
        await bot.session.close()
        logger.info("Stopped.")

if __name__ == "__main__":
    asyncio.run(main())
