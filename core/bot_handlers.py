import asyncio
import logging
import os

from aiogram import Dispatcher, filters, types

from db.utils import backup_db

logger = logging.getLogger(__name__)


async def cleanup_messages(messages: list[types.Message], delay: int = 30):
    """Wait and delete a list of messages."""
    await asyncio.sleep(delay)
    for msg in messages:
        try:
            await msg.delete()
        except Exception:
            pass


def setup_handlers(dp: Dispatcher, config):
    """Register all Telegram bot command handlers."""

    def is_admin(user_id: int) -> bool:
        return user_id == int(config.allowed_users[0])

    def is_authorized(user_id: int) -> bool:
        return user_id in config.allowed_users

    @dp.message(filters.Command("backup"))
    async def cmd_backup(message: types.Message):
        """Create and send a database backup."""
        user_id = message.from_user.id
        if not is_admin(user_id):
            logger.warning("Unauthorized backup attempt by user %d", user_id)
            return

        logger.info("Backup initiated by admin %d", user_id)
        backup_dir = os.path.join(os.path.dirname(os.path.abspath(config.db_path)), "backups")

        try:
            archive_path = await backup_db(config.db_path, backup_dir)
            await message.answer_document(types.FSInputFile(archive_path))
            logger.info("Backup sent to admin %d: %s", user_id, archive_path)
        except Exception as e:
            logger.error("Backup error for admin %d: %s", user_id, e)

    @dp.message(filters.Command("start"))
    async def cmd_start(message: types.Message):
        """Show WebApp start button."""
        user_id = message.from_user.id
        if not is_authorized(user_id):
            logger.warning("Unauthorized access attempt by user %d", user_id)
            return

        logger.info("Command /start received from user %d", user_id)
        kb = types.InlineKeyboardMarkup(
            inline_keyboard=[
                [types.InlineKeyboardButton(text="Open App", web_app=types.WebAppInfo(url=config.webapp_url))]
            ]
        )
        msg = await message.answer("SRbot", reply_markup=kb)
        asyncio.create_task(cleanup_messages([message, msg]))
