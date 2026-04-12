from api.app_keys import DB_KEY
from db import UserRepo, WordRepo


def repository_middleware(handler):
    """Middleware to inject repositories into the request."""

    async def middleware(request, handler):
        db = request.app[DB_KEY]
        request["user_repo"] = UserRepo(db)
        request["word_repo"] = WordRepo(db)
        return await handler(request)

    return middleware
