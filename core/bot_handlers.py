import asyncio
from aiogram import Dispatcher, types, filters
from db.repository import UserRepo

def setup_handlers(dp: Dispatcher, user_repo: UserRepo, config):

    @dp.message(filters.Command("token"))
    async def cmd_token(message: types.Message):
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
