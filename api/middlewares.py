from collections.abc import Awaitable, Callable

from aiohttp import web

from api.app_keys import DB_KEY
from db.user import UserRepo
from db.word import WordRepo


@web.middleware
async def repository_middleware(
    request: web.Request,
    handler: Callable[[web.Request], Awaitable[web.Response]],
) -> web.Response:
    """Middleware to inject repositories into the request."""
    db = request.app[DB_KEY]
    request["user_repo"] = UserRepo(db)
    request["word_repo"] = WordRepo(db)
    return await handler(request)
