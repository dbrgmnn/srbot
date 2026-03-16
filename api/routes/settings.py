from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from core.scheduler import reschedule
from core.languages import LANGUAGES


def _is_valid_time(value: str) -> bool:
    try:
        parts = value.split(":")
        if len(parts) != 2:
            return False
        h, m = map(int, parts)
        return 0 <= h <= 23 and 0 <= m <= 59
    except (TypeError, ValueError):
        return False


def setup_routes_settings(app: web.Application, db: aiosqlite.Connection):

    async def get_languages_list(request: web.Request) -> web.Response:
        return web.json_response({"ok": True, "result": {"languages": LANGUAGES}})

    async def get_settings(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        lang = request['language']
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        settings = await user_repo.get_user_settings(telegram_id, lang)
        stats = await word_repo.get_full_stats(user_id, lang, tz_name=settings.get("timezone", "UTC"))
        
        config = request.app["config"]
        
        return web.json_response({
            "ok": True,
            "result": {
                **settings,
                "total_words": stats["total"],
                "limits": {
                    "min_daily_limit": config.min_daily_limit,
                    "max_daily_limit": config.max_daily_limit,
                    "min_notify_interval": config.min_notify_interval,
                    "max_notify_interval": config.max_notify_interval,
                }
            }
        })

    async def update_settings(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        lang = request['language']
        body = await request.json()
        user_repo = UserRepo(db)

        # 1. Update language first, so other settings apply to the correct one
        if "language" in body:
            new_lang = body["language"]
            if new_lang in LANGUAGES:
                await user_repo.update_language(telegram_id, new_lang)
                lang = new_lang  # use new lang for subsequent updates in this request
                # Invalidate user_cache so next request re-fetches user_id for new language
                request.app["user_cache"].pop((telegram_id, new_lang), None)

        # 2. Update other settings
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
            
            config = request.app["config"]
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
            
            config = request.app["config"]
            if config.min_notify_interval <= interval <= config.max_notify_interval:
                await user_repo.update_notification_interval(telegram_id, interval, lang)
                scheduler = request.app["scheduler"]
                if scheduler:
                    await reschedule(scheduler, db)
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

            await user_repo.update_quiet_hours(
                telegram_id,
                quiet_start=quiet_start,
                quiet_end=quiet_end,
                language=lang
            )

        settings = await user_repo.get_user_settings(telegram_id, lang)
        return web.json_response({"ok": True, "result": settings})

    app.router.add_get("/api/settings/languages", get_languages_list)
    app.router.add_get("/api/settings", get_settings)
    app.router.add_post("/api/settings", update_settings)
