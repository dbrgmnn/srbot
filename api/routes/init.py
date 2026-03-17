from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from core.languages import LANGUAGES


def setup_routes_init(app: web.Application, db: aiosqlite.Connection):

    async def init_user(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        user_id = request["user_id"]
        lang = request['language']

        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        
        config = request.app["config"]
        settings = await user_repo.get_user_settings(telegram_id, lang, config)
        stats = await word_repo.get_full_stats(user_id, lang, tz_name=settings.get("timezone", "UTC"))

        lang_meta = LANGUAGES.get(lang, {})
        tts_code = lang_meta.get("tts", "en-US")

        return web.json_response({
            "ok": True,
            "result": {
                "user_id": user_id,
                "settings": settings,
                "stats": stats,
                "tts_code": tts_code,
                "lang_flag": lang_meta.get("flag", ""),
                "lang_name": lang_meta.get("name", lang.upper()),
                "limits": {
                    "min_daily_limit": config.min_daily_limit,
                    "max_daily_limit": config.max_daily_limit,
                    "min_notify_interval": config.min_notify_interval,
                    "max_notify_interval": config.max_notify_interval,
                },
            }
        })
    app.router.add_get("/api/init", init_user)
