from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo


def setup_routes_init(app: web.Application, db: aiosqlite.Connection):

    async def init_user(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        
        # Safe TZ extraction
        tz_offset = 0
        try:
            body = await request.json()
            tz_offset = int(body.get("tz", 0))
        except:
            pass

        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        settings = await user_repo.get_user_settings(telegram_id)
        stats = await word_repo.get_full_stats(user_id, 'de', tz_offset_minutes=tz_offset)
        
        config = request.app["config"]
        return web.json_response({
            "user_id": user_id,
            "settings": settings,
            "stats": stats,
            "timezone": config.timezone,
        })

    app.router.add_post("/api/init", init_user)
