import logging

from aiohttp import web

from api.app_keys import CONFIG_KEY
from core.languages import LANGUAGES

logger = logging.getLogger(__name__)


def setup_routes_init(app: web.Application) -> None:
    """Register user initialization routes."""

    async def init_user(request: web.Request) -> web.Response:
        """Initialize user session, return settings, stats, and language metadata."""
        telegram_id = request["telegram_id"]
        user_id = request["user_id"]
        lang = request["language"]

        user_repo = request["user_repo"]
        word_repo = request["word_repo"]

        config = request.app[CONFIG_KEY]
        settings = await user_repo.get_user_settings(telegram_id, lang, config)
        tz = settings.get("timezone", "UTC")
        daily_limit = settings.get("daily_limit", config.max_daily_limit // 2)
        stats = await word_repo.get_full_stats(user_id, lang, daily_limit=daily_limit, tz_name=tz)

        lang_meta = LANGUAGES.get(lang, {})
        tts_code = lang_meta.get("tts", "en-US")

        languages = {code: {**meta} for code, meta in LANGUAGES.items()}

        logger.info("User %d initialized WebApp (lang: %s)", telegram_id, lang)

        return web.json_response(
            {
                "ok": True,
                "result": {
                    "user_id": user_id,
                    "settings": settings,
                    "stats": stats,
                    "tts_code": tts_code,
                    "lang_flag": lang_meta.get("flag", ""),
                    "lang_name": lang_meta.get("name", lang.upper()),
                    "limits": config.limits,
                    "languages": languages,
                },
            }
        )

    app.router.add_get("/api/init", init_user)
