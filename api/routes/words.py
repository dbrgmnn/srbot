from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo


def setup_routes_words(app: web.Application, db: aiosqlite.Connection):

    async def list_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        words = await word_repo.search_words(user_id, 'de', "")
        return web.json_response({"words": words})

    async def add_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        body = await request.json()
        words = body.get("words", [])
        if not words:
            return web.json_response({"error": "no words"}, status=400)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        added_count = await word_repo.add_words_batch(user_id, 'de', words)
        return web.json_response({"added": added_count})

    async def delete_all_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        await word_repo.delete_all_words(user_id)
        return web.json_response({"ok": True})

    async def delete_word(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"error": "invalid word_id"}, status=400)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        await word_repo.delete_word(word_id, user_id)
        return web.json_response({"ok": True})

    async def search_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        query = request.query.get("q", "")
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        words = await word_repo.search_words(user_id, 'de', query)
        return web.json_response({"words": words})

    async def export_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        words = await word_repo.get_all_words(user_id, 'de')

        lines = []
        for w in words:
            ex = (w.get("example") or "").strip()
            if ex:
                lines.append(f"{w['word']} — {w['translation']} ({ex})")
            else:
                lines.append(f"{w['word']} — {w['translation']}")
        text = "\n".join(lines)
        return web.Response(text=text, content_type="text/plain")

    app.router.add_get("/api/words", list_words)
    app.router.add_post("/api/words", add_words)
    app.router.add_get("/api/words/search", search_words)
    app.router.add_delete("/api/words/all", delete_all_words)
    app.router.add_delete("/api/words/{word_id}", delete_word)
    app.router.add_get("/api/words/export", export_words)
