from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from core.srs import sm2


# --- Routes ---

def setup_routes_practice(app: web.Application, db: aiosqlite.Connection):
    """Register practice-related routes."""

    async def get_session(request: web.Request) -> web.Response:
        """Return a session of words for practice, respecting user limits."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        lang = request['language']

        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        config = request.app["config"]
        settings = await user_repo.get_user_settings(telegram_id, lang, config)

        # Remaining new words for today in user's timezone
        tz_name = settings.get("timezone", config.default_timezone)
        today_done = await user_repo.get_today_new_count(user_id, lang, tz_name)
        daily_limit = settings.get("daily_limit", config.max_daily_limit // 2)
        remaining = max(0, daily_limit - today_done)
        
        words = await word_repo.get_session_words(user_id, lang, new_limit=remaining)
        return web.json_response({"ok": True, "result": {"words": words}})

    async def grade_word(request: web.Request) -> web.Response:
        """Process word grading using SM-2 algorithm."""
        user_id = request["user_id"]
        body = await request.json()
        word_id = body.get("word_id")
        quality = body.get("quality")
        
        if word_id is None or quality is None:
            return web.json_response({"ok": False, "error": "missing_fields"}, status=400)

        word_repo = WordRepo(db)
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

        # Record activity in user's timezone
        is_new = word["started_at"] is None
        config = request.app["config"]
        telegram_id = request["telegram_id"]
        user_repo = UserRepo(db)
        settings = await user_repo.get_user_settings(telegram_id, word["language"], config)
        tz_name = settings.get("timezone", config.default_timezone)
        
        await word_repo.increment_daily_stat(user_id, word["language"], is_new, tz_name)

        await word_repo.update_word_after_review(
            word_id=word_id,
            repetitions=result.repetitions,
            easiness=result.easiness,
            interval=result.interval,
            next_review=result.next_review,
        )
        return web.json_response({"ok": True, "result": {"next_review": result.next_review.isoformat()}})

    async def undo_grade(request: web.Request) -> web.Response:
        """Revert the last grading action for a word."""
        user_id = request["user_id"]
        body = await request.json()
        word_id = body.get("word_id")
        old_state = body.get("old_state")
        
        if word_id is None or old_state is None:
            return web.json_response({"ok": False, "error": "missing_fields"}, status=400)

        word_repo = WordRepo(db)

        # Fetch current state to determine language and is_new flag
        word = await word_repo.get_word(word_id, user_id)
        if word:
            is_new = int(old_state.get("repetitions", 0)) == 0
            config = request.app["config"]
            telegram_id = request["telegram_id"]
            user_repo = UserRepo(db)
            settings = await user_repo.get_user_settings(telegram_id, word["language"], config)
            tz_name = settings.get("timezone", config.default_timezone)
            await word_repo.decrement_daily_stat(user_id, word["language"], is_new, tz_name)

        await word_repo.undo_word_review(
            word_id=word_id,
            repetitions=old_state.get("repetitions", 0),
            easiness=old_state.get("easiness", 2.5),
            interval=old_state.get("interval", 1),
            next_review=old_state.get("next_review"),
            last_reviewed_at=old_state.get("last_reviewed_at"),
            started_at=old_state.get("started_at"),
        )
        return web.json_response({"ok": True})

    app.router.add_get("/api/session", get_session)
    app.router.add_post("/api/grade", grade_word)
    app.router.add_post("/api/undo", undo_grade)
