import logging
from pathlib import Path
from aiohttp import web
import aiosqlite

from config import Config
from api.auth import get_user_id
from api.routes.init import setup_routes_init
from api.routes.words import setup_routes_words
from api.routes.practice import setup_routes_practice
from api.routes.settings import setup_routes_settings

logger = logging.getLogger(__name__)

WEBAPP_DIR = Path(__file__).parent.parent / "webapp"


async def create_app(config: Config, db: aiosqlite.Connection, scheduler=None) -> web.Application:
    # CORS for Telegram Mini App
    @web.middleware
    async def cors_middleware(request: web.Request, handler):
        if request.method == "OPTIONS":
            return web.Response(status=200, headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type, X-Init-Data",
                "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            })
        response = await handler(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Init-Data"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        return response

    @web.middleware
    async def auth_middleware(request: web.Request, handler):
        # skip auth for static files, root, and external api
        if not request.path.startswith("/api/") or request.path.startswith("/api/external/"):
            return await handler(request)
        
        telegram_id = get_user_id(request.headers.get("X-Init-Data", ""), config.bot_token)
        if not telegram_id or telegram_id not in config.allowed_users:
            return web.json_response({"error": "unauthorized"}, status=401)
        
        from db.repository import UserRepo
        user_repo = UserRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        
        request["telegram_id"] = telegram_id
        request["user_id"] = user_id
        return await handler(request)

    app = web.Application(middlewares=[cors_middleware, auth_middleware])
    app["db"] = db
    app["scheduler"] = scheduler

    # register all api routes
    setup_routes_init(app, db)
    setup_routes_words(app, db)
    setup_routes_practice(app, db)
    setup_routes_settings(app, db)

    # serve index.html for root
    async def index(request: web.Request) -> web.Response:
        response = web.FileResponse(WEBAPP_DIR / "index.html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    async def static_handler(request: web.Request) -> web.Response:
        # serve static files with no-cache so browser always gets fresh version
        rel = request.match_info["path"]
        file_path = WEBAPP_DIR / rel
        if not file_path.exists() or not file_path.is_file():
            raise web.HTTPNotFound()
        response = web.FileResponse(file_path)
        response.headers["Cache-Control"] = "no-cache"
        return response

    if WEBAPP_DIR.exists():
        app.router.add_get("/", index)
        app.router.add_get("/static/{path:.*}", static_handler)

    return app


async def start_api_server(config: Config, db: aiosqlite.Connection, scheduler=None) -> web.AppRunner:
    app = await create_app(config, db, scheduler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.api_port)
    await site.start()
    logger.info(f"API server started on port {config.api_port}")
    return runner
