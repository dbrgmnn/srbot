import asyncio
import logging
import os
import tarfile

from aiogram import Dispatcher, filters, types

from db import UserRepo
from db.utils import backup_db

logger = logging.getLogger(__name__)


def setup_handlers(dp: Dispatcher, user_repo: UserRepo, config):
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
        base_dir = os.path.dirname(config.db_path)
        backup_path = os.path.join(base_dir, "srbot_backup.sqlite")
        archive_path = os.path.join(base_dir, "srbot_backup.tar.gz")

        try:
            await backup_db(config.db_path, backup_path)
            with tarfile.open(archive_path, "w:gz") as tar:
                tar.add(backup_path, arcname="srbot.db")

            await message.answer_document(types.FSInputFile(archive_path))
            logger.info("Backup successfully sent to admin %d", user_id)
        except Exception as e:
            logger.error("Backup error for admin %d: %s", user_id, e)
        finally:
            if os.path.exists(backup_path):
                os.remove(backup_path)
            if os.path.exists(archive_path):
                os.remove(archive_path)

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

        await asyncio.sleep(30)
        try:
            await msg.delete()
            await message.delete()
        except Exception:
            pass
