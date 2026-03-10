from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo


def setup_routes_stats(app: web.Application, db: aiosqlite.Connection):

    async def get_stats(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        
        # Safe TZ extraction from query
        try:
            tz_offset = int(request.query.get("tz", 0))
        except:
            tz_offset = 0

        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        stats = await word_repo.get_full_stats(user_id, 'de', tz_offset_minutes=tz_offset)
        return web.json_response(stats)

    app.router.add_get("/api/stats", get_stats)
