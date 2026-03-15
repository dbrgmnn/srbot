from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from api.auth import get_language


def setup_routes_init(app: web.Application, db: aiosqlite.Connection):

    async def init_user(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        user_id = request["user_id"]
        lang = get_language(request)

        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        
        settings = await user_repo.get_user_settings(telegram_id, lang)
        stats = await word_repo.get_full_stats(user_id, lang, tz_name=settings.get("timezone", "UTC"))

        return web.json_response({
            "user_id": user_id,
            "settings": settings,
            "stats": stats,
            "timezone": settings.get("timezone", "UTC"),
        })
    app.router.add_get("/api/init", init_user)
