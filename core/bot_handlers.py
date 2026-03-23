import asyncio
from aiogram import Dispatcher, types, filters
from db.repository import UserRepo

def setup_handlers(dp: Dispatcher, user_repo: UserRepo, config):
    """Register all Telegram bot command handlers."""

    @dp.message(filters.Command("start"))
    async def cmd_start(message: types.Message):
        """Start the bot and show the WebApp button with auto-deletion."""
        if message.from_user.id not in config.allowed_users:
            return

        kb = types.InlineKeyboardMarkup(inline_keyboard=[[
            types.InlineKeyboardButton(
                text="🚀 Open App",
                web_app=types.WebAppInfo(url=config.webapp_url)
            )
        ]])

        msg = await message.answer("Ready to study?", reply_markup=kb)
        
        await asyncio.sleep(30)
        try:
            await msg.delete()
            await message.delete()
        except Exception:
            pass

