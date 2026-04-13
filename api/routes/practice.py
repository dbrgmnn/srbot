import logging

from aiohttp import web

from api.app_keys import CONFIG_KEY
from core.srs import sm2

logger = logging.getLogger(__name__)


def setup_routes_practice(app: web.Application) -> None:
    """Register practice-related routes."""

    async def get_session(request: web.Request) -> web.Response:
        """Return a session of words for practice, respecting user limits."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        lang = request["language"]

        user_repo = request["user_repo"]
        word_repo = request["word_repo"]
        config = request.app[CONFIG_KEY]

        settings = await user_repo.get_user_settings(telegram_id, lang, config)

        tz_name = settings.get("timezone", config.default_timezone)
        today_done = await user_repo.get_today_new_count(user_id, lang, tz_name)
        daily_limit = settings.get("daily_limit", config.max_daily_limit // 2)
        remaining = max(0, daily_limit - today_done)

        words = await word_repo.get_session_words(user_id, lang, new_limit=remaining)
        logger.info("User %s started practice session: %d words (lang: %s)", telegram_id, len(words), lang)
        return web.json_response({"ok": True, "result": {"words": words}})

    async def grade_word(request: web.Request) -> web.Response:
        """Process word grading using the SM-2 algorithm."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)
        word_id = body.get("word_id")
        quality = body.get("quality")

        if word_id is None or quality is None:
            return web.json_response({"ok": False, "error": "missing_fields"}, status=400)

        word_repo = request["word_repo"]
        word = await word_repo.get_word(word_id, user_id)
        if not word:
            return web.json_response({"ok": False, "error": "not_found"}, status=404)

        try:
            result = sm2(
                quality=int(quality),
                repetitions=int(word["repetitions"]),
                easiness=float(word["easiness"]),
                interval=int(word["interval"]),
            )
        except (ValueError, TypeError):
            return web.json_response({"ok": False, "error": "invalid_grade"}, status=400)

        await word_repo.update_word_after_review(
            user_id=user_id,
            word_id=word_id,
            repetitions=result.repetitions,
            easiness=result.easiness,
            interval=result.interval,
            next_review=result.next_review,
        )
        logger.info("User %s graded word %d with quality %s", telegram_id, word_id, quality)
        return web.json_response({"ok": True, "result": {"next_review": result.next_review.isoformat()}})

    async def undo_grade(request: web.Request) -> web.Response:
        """Revert the last grading action for a word."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)
        word_id = body.get("word_id")
        old_state = body.get("old_state")

        if word_id is None or old_state is None:
            return web.json_response({"ok": False, "error": "missing_fields"}, status=400)

        word_repo = request["word_repo"]
        if not await word_repo.get_word(word_id, user_id):
            return web.json_response({"ok": False, "error": "not_found"}, status=404)

        await word_repo.undo_word_review(
            user_id=user_id,
            word_id=word_id,
            repetitions=old_state.get("repetitions", 0),
            easiness=old_state.get("easiness", 2.5),
            interval=old_state.get("interval", 1),
            next_review=old_state.get("next_review"),
            last_reviewed_at=old_state.get("last_reviewed_at"),
            started_at=old_state.get("started_at"),
        )
        logger.info("User %s undid grading for word %d", telegram_id, word_id)
        return web.json_response({"ok": True})

    app.router.add_get("/api/session", get_session)
    app.router.add_post("/api/grade", grade_word)
    app.router.add_post("/api/undo", undo_grade)
