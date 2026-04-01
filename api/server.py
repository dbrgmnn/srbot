"""
API server setup and lifecycle management.
Uses aiohttp to serve the web application and API endpoints.
"""

import json
import logging
from collections import OrderedDict
from pathlib import Path

import aiohttp
import aiosqlite
from aiohttp import web

from api.app_keys import (
    CONFIG_KEY,
    DB_KEY,
    HTTP_SESSION_KEY,
    SCHEDULER_KEY,
    TRANSLATOR_KEY,
    USER_CACHE_KEY,
)
from api.auth import verify_init_data
from api.routes.init import setup_routes_init
from api.routes.practice import setup_routes_practice
from api.routes.settings import setup_routes_settings
from api.routes.words import setup_routes_words
from config import Config
from core.languages import LANGUAGES
from core.translator import Translator
from db.repository import UserRepo

logger = logging.getLogger(__name__)

WEBAPP_DIR = Path(__file__).parent.parent / "static"


async def create_app(config: Config, db: aiosqlite.Connection, scheduler=None) -> web.Application:
    """Create and configure the aiohttp web application."""

    @web.middleware
    async def cors_middleware(request: web.Request, handler):
        cors_headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, X-Init-Data, X-Language, X-Timezone, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
        }

        if request.method == "OPTIONS":
            return web.Response(status=200, headers=cors_headers)

        response = await handler(request)
        for k, v in cors_headers.items():
            response.headers[k] = v
        return response

    @web.middleware
    async def auth_middleware(request: web.Request, handler):
        # Skip auth for static files, root, and external api endpoints
        if not request.path.startswith("/api/") or request.path.startswith("/api/external/"):
            return await handler(request)

        params = verify_init_data(request.headers.get("X-Init-Data", ""), config.bot_token, config.token_expiry)
        if not params:
            return web.json_response({"ok": False, "error": "unauthorized"}, status=401)

        try:
            user = json.loads(params.get("user", "{}"))
            telegram_id = int(user["id"])
        except (json.JSONDecodeError, KeyError, TypeError):
            return web.json_response({"ok": False, "error": "invalid_user"}, status=401)

        if telegram_id not in config.allowed_users:
            return web.json_response({"ok": False, "error": "forbidden"}, status=403)

        # Get language from header, fall back to default if unsupported
        lang = request.headers.get("X-Language", config.default_lang).lower()
        if lang not in LANGUAGES:
            lang = config.default_lang

        # Check cache first to avoid DB hit on every request
        cache_key = (telegram_id, lang)
        if cache_key in request.app[USER_CACHE_KEY]:
            user_id = request.app[USER_CACHE_KEY][cache_key]
            # Move to end to mark as recently used
            request.app[USER_CACHE_KEY].move_to_end(cache_key)
        else:
            tz = request.headers.get("X-Timezone", config.default_timezone)
            user_repo = UserRepo(db)
            user_id = await user_repo.get_or_create(telegram_id, lang, tz, config)
            request.app[USER_CACHE_KEY][cache_key] = user_id

            # Simple LRU logic to prevent memory leaks
            if len(request.app[USER_CACHE_KEY]) > 1000:
                request.app[USER_CACHE_KEY].popitem(last=False)

        request["telegram_id"] = telegram_id
        request["user_id"] = user_id
        request["language"] = lang
        return await handler(request)

    app = web.Application(middlewares=[cors_middleware, auth_middleware])
    app[CONFIG_KEY] = config
    app[DB_KEY] = db
    app[SCHEDULER_KEY] = scheduler
    app[USER_CACHE_KEY] = OrderedDict()  # (telegram_id, lang) -> user_id

    app[HTTP_SESSION_KEY] = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15))

    if config.gemini_api_key:
        app[TRANSLATOR_KEY] = Translator(config.gemini_api_key, config.gemini_model, app[HTTP_SESSION_KEY])

    async def on_shutdown(app: web.Application):
        if HTTP_SESSION_KEY in app:
            await app[HTTP_SESSION_KEY].close()

    app.on_shutdown.append(on_shutdown)

    setup_routes_init(app, db)
    setup_routes_words(app, db)
    setup_routes_practice(app, db)
    setup_routes_settings(app, db)

    # --- Static files ---

    async def index(request: web.Request) -> web.Response:
        """Serve the main index page."""
        response = web.FileResponse(WEBAPP_DIR / "index.html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    async def static_handler(request: web.Request) -> web.Response:
        """Serve static files with no-cache headers."""
        # No-cache so browser always fetches fresh version after deploy
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
    """Initialize and start the API server."""
    app = await create_app(config, db, scheduler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.api_port)
    await site.start()
    logger.info(f"API server started on port {config.api_port}")
    return runner
