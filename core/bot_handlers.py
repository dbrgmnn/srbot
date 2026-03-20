import asyncio
from aiogram import Dispatcher, types, filters
from db.repository import UserRepo

def setup_handlers(dp: Dispatcher, user_repo: UserRepo, config):
    """Register all Telegram bot command handlers."""

    @dp.message(filters.Command("token"))
    async def cmd_token(message: types.Message):
        """Show existing API token and auto-delete it after 30 seconds."""
        if message.from_user.id not in config.allowed_users:
            return
        token = await user_repo.get_api_token(message.from_user.id)
        if not token:
            token = await user_repo.generate_api_token(message.from_user.id)
        
        msg = await message.answer(f"`{token}`", parse_mode="MarkdownV2")
        await asyncio.sleep(30)
        try:
            await msg.delete()
            await message.delete()
        except Exception:
            pass

    @dp.message(filters.Command("token_new"))
    async def cmd_token_new(message: types.Message):
        """Generate a new API token and auto-delete it after 30 seconds."""
        if message.from_user.id not in config.allowed_users:
            return
        token = await user_repo.generate_api_token(message.from_user.id)
        msg = await message.answer(f"`{token}`", parse_mode="MarkdownV2")
        await asyncio.sleep(30)
        try:
            await msg.delete()
            await message.delete()
        except Exception:
            pass
