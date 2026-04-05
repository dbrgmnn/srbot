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

    @dp.message(filters.Command("backup"))
    async def cmd_backup(message: types.Message):
        """Create and send a database backup to the admin."""

        admin_id = int(config.allowed_users.split(",")[0].strip())
        if message.from_user.id != admin_id:
            return

        base_dir = os.path.dirname(config.db_path)
        backup_path = os.path.join(base_dir, "srbot_backup.sqlite")
        archive_path = os.path.join(base_dir, "srbot_backup.tar.gz")

        try:
            await backup_db(config.db_path, backup_path)
            with tarfile.open(archive_path, "w:gz") as tar:
                tar.add(backup_path, arcname="srbot.db")

            doc = types.FSInputFile(archive_path)
            await message.answer_document(doc, caption="Database backup")
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            await message.answer("❌ Backup failed.")
        finally:
            if os.path.exists(backup_path):
                os.remove(backup_path)
            if os.path.exists(archive_path):
                os.remove(archive_path)

    @dp.message(filters.Command("start"))
    async def cmd_start(message: types.Message):
        """Start the bot and show the WebApp button with auto-deletion."""
        if message.from_user.id not in config.allowed_users:
            logger.warning(f"Unauthorized access attempt by user {message.from_user.id}")
            return

        logger.info(f"User {message.from_user.id} requested /start")

        kb = types.InlineKeyboardMarkup(
            inline_keyboard=[
                [types.InlineKeyboardButton(text="🚀 Open App", web_app=types.WebAppInfo(url=config.webapp_url))]
            ]
        )

        msg = await message.answer("Ready to study?", reply_markup=kb)

        await asyncio.sleep(30)
        try:
            await msg.delete()
            await message.delete()
        except Exception:
            pass
