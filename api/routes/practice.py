from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from core.srs import sm2


def setup_routes_practice(app: web.Application, db: aiosqlite.Connection):

    async def get_session(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        tz_offset = int(request.query.get("tz", 0))
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        settings = await user_repo.get_user_settings(telegram_id)
        
        # Calculate remaining limit with TZ
        stats = await word_repo.get_full_stats(user_id, 'de', tz_offset_minutes=tz_offset)
        today_done = stats.get("today_new", 0)
        daily_limit = settings.get("daily_limit", 20)
        remaining = max(0, daily_limit - today_done)
        
        words = await word_repo.get_session_words(user_id, 'de', new_limit=remaining)
        return web.json_response({"words": words})

    async def grade_word(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        body = await request.json()
        word_id = body.get("word_id")
        quality = body.get("quality")
        word_data = body.get("word")
        if word_id is None or quality is None or not word_data:
            return web.json_response({"error": "missing fields"}, status=400)

        try:
            result = sm2(
                quality=int(quality),
                repetitions=int(word_data["repetitions"]),
                easiness=float(word_data["easiness"]),
                interval=int(word_data["interval"]),
            )
        except (KeyError, TypeError, ValueError):
            return web.json_response({"error": "invalid word data"}, status=400)

        word_repo = WordRepo(db)
        await word_repo.update_word_after_review(
            word_id=word_id,
            repetitions=result.repetitions,
            easiness=result.easiness,
            interval=result.interval,
            next_review=result.next_review,
        )
        return web.json_response({"ok": True, "next_review": result.next_review.isoformat()})

    app.router.add_get("/api/session", get_session)
    app.router.add_post("/api/grade", grade_word)
