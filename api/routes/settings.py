import logging

import aiosqlite
from aiohttp import web

from api.app_keys import CONFIG_KEY, SCHEDULER_KEY
from core.languages import LANGUAGES
from core.scheduler import reschedule
from db import UserRepo, WordRepo

logger = logging.getLogger(__name__)


def _is_valid_time(value: str) -> bool:
    """Validate time format (HH:MM)."""
    try:
        parts = value.split(":")
        if len(parts) != 2:
            return False
        h, m = map(int, parts)
        return 0 <= h <= 23 and 0 <= m <= 59
    except (TypeError, ValueError):
        return False


def setup_routes_settings(app: web.Application, db: aiosqlite.Connection):
    """Register user settings routes."""

    async def get_languages_list(request: web.Request) -> web.Response:
        """Return a list of supported languages with word counts for the user."""
        user_id = request["user_id"]
        user_repo = UserRepo(db)
        counts = await user_repo.get_words_count_per_language(user_id)
        languages = {code: {**meta, "word_count": counts.get(code, 0)} for code, meta in LANGUAGES.items()}
        return web.json_response({"ok": True, "result": {"languages": languages}})

    async def get_settings(request: web.Request) -> web.Response:
        """Return user settings for the current language."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        lang = request["language"]
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        config = request.app[CONFIG_KEY]
        settings = await user_repo.get_user_settings(telegram_id, lang, config)
        stats = await word_repo.get_full_stats(
            user_id,
            lang,
            daily_limit=settings.get("daily_limit", 20),
            tz_name=settings.get("timezone", "UTC"),
        )

        return web.json_response(
            {
                "ok": True,
                "result": {
                    **settings,
                    "total_words": stats["total"],
                    "limits": {
                        "min_daily_limit": config.min_daily_limit,
                        "max_daily_limit": config.max_daily_limit,
                        "min_notify_interval": config.min_notify_interval,
                        "max_notify_interval": config.max_notify_interval,
                    },
                },
            }
        )

    async def update_settings(request: web.Request) -> web.Response:
        """Update user settings (language, timezone, daily limit, etc.)."""
        telegram_id = request["telegram_id"]
        lang = request["language"]
        body = await request.json()
        config = request.app[CONFIG_KEY]
        user_repo = UserRepo(db)

        # Update language first so subsequent settings target the correct row
        if "language" in body:
            new_lang = body["language"]
            if new_lang in LANGUAGES:
                await user_repo.update_language(telegram_id, new_lang, config)
                lang = new_lang  # Use new lang for subsequent updates in this request

        if "timezone" in body:
            await user_repo.update_timezone(telegram_id, body["timezone"], lang)

        if "daily_limit" in body:
            try:
                limit = int(body["daily_limit"])
            except (TypeError, ValueError):
                return web.json_response(
                    {"ok": False, "error": "invalid_number"},
                    status=400,
                )

            if config.min_daily_limit <= limit <= config.max_daily_limit:
                await user_repo.update_daily_limit(telegram_id, limit, lang)
            else:
                return web.json_response({"ok": False, "error": "limit_out_of_range"}, status=400)

        if "notification_interval_minutes" in body:
            try:
                interval = int(body["notification_interval_minutes"])
            except (TypeError, ValueError):
                return web.json_response(
                    {"ok": False, "error": "invalid_number"},
                    status=400,
                )

            if config.min_notify_interval <= interval <= config.max_notify_interval:
                await user_repo.update_notification_interval(telegram_id, interval, lang)
                scheduler = request.app[SCHEDULER_KEY]
                if scheduler:
                    await reschedule(scheduler, db, config)
            else:
                return web.json_response({"ok": False, "error": "interval_out_of_range"}, status=400)

        if "practice_mode" in body:
            mode = body.get("practice_mode")
            allowed = {"word_to_translation", "translation_to_word"}
            if mode not in allowed:
                return web.json_response(
                    {"ok": False, "error": "invalid_mode"},
                    status=400,
                )
            await user_repo.update_practice_mode(telegram_id, mode, lang)

        if "quiet_start" in body or "quiet_end" in body:
            quiet_start = body.get("quiet_start")
            quiet_end = body.get("quiet_end")

            if quiet_start is not None and not _is_valid_time(quiet_start):
                return web.json_response(
                    {"ok": False, "error": "invalid_time_format"},
                    status=400,
                )
            if quiet_end is not None and not _is_valid_time(quiet_end):
                return web.json_response(
                    {"ok": False, "error": "invalid_time_format"},
                    status=400,
                )

            await user_repo.update_quiet_hours(telegram_id, lang, quiet_start=quiet_start, quiet_end=quiet_end)

        settings = await user_repo.get_user_settings(telegram_id, lang, config)
        logger.info("User %d updated settings for language '%s'", telegram_id, lang)
        return web.json_response({"ok": True, "result": settings})

    async def get_api_token(request: web.Request) -> web.Response:
        """Return the user's current API token."""
        telegram_id = request["telegram_id"]
        user_repo = UserRepo(db)
        token = await user_repo.get_api_token(telegram_id)
        if not token:
            token = await user_repo.generate_api_token(telegram_id)
            logger.info("User %d generated initial API token", telegram_id)
        return web.json_response({"ok": True, "result": {"token": token}})

    async def revoke_api_token(request: web.Request) -> web.Response:
        """Revoke old token and generate a new one."""
        telegram_id = request["telegram_id"]
        user_repo = UserRepo(db)
        token = await user_repo.generate_api_token(telegram_id)
        logger.info("User %d revoked and regenerated API token", telegram_id)
        return web.json_response({"ok": True, "result": {"token": token}})

    app.router.add_get("/api/settings/languages", get_languages_list)
    app.router.add_get("/api/settings", get_settings)
    app.router.add_get("/api/settings/token", get_api_token)
    app.router.add_post("/api/settings", update_settings)
    app.router.add_post("/api/settings/token/revoke", revoke_api_token)
