from pathlib import Path
from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from api.auth import get_language


def setup_routes_words(app: web.Application, db: aiosqlite.Connection):

    async def list_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        lang = get_language(request)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        words = await word_repo.search_words(user_id, lang, "")
        return web.json_response({"words": words})

    async def add_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        lang = get_language(request)
        body = await request.json()
        words = body.get("words", [])
        if not words:
            return web.json_response({"error": "no words"}, status=400)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        added_count = await word_repo.add_words_batch(user_id, lang, words)
        return web.json_response({"added": added_count})

    async def patch_word(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"error": "invalid word_id"}, status=400)
        body = await request.json()
        word = (body.get("word") or "").strip()
        translation = (body.get("translation") or "").strip()
        if not word or not translation:
            return web.json_response({"error": "word and translation required"}, status=400)
        example = (body.get("example") or "").strip() or None
        level = (body.get("level") or "").strip() or None
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        try:
            await word_repo.update_word_text(word_id, user_id, word, translation, example, level)
        except Exception:
            return web.json_response({"error": "duplicate"}, status=409)
        return web.json_response({"ok": True})

    async def delete_all_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        lang = get_language(request)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        await word_repo.delete_all_words(user_id, lang)
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
        lang = get_language(request)
        query = request.query.get("q", "")
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        words = await word_repo.search_words(user_id, lang, query)
        return web.json_response({"words": words})

    async def export_words(request: web.Request) -> web.Response:
        import csv
        import io
        telegram_id = request["telegram_id"]
        lang = get_language(request)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        words = await word_repo.get_all_words(user_id, lang)

        output = io.StringIO()
        writer = csv.writer(output)
        
        # Add headers for consistency with load_csv_words
        writer.writerow(['term', 'translation', 'example', 'level'])
        
        for w in words:
            writer.writerow([
                w['word'], 
                w['translation'], 
                w.get('example') or "", 
                w.get('level') or ""
            ])

        return web.Response(text=output.getvalue(), content_type="text/plain")

    async def preload_words(request: web.Request) -> web.Response:
        telegram_id = request["telegram_id"]
        lang = get_language(request)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        user_id = await user_repo.get_or_create(telegram_id)
        
        # Determine CSV path based on current language
        # Assuming data folder is in project root: srbot/data/
        # This file is in: srbot/api/routes/words.py
        csv_path = Path(__file__).parent.parent.parent / "data" / f"words_{lang}.csv"
        
        if not csv_path.exists():
            return web.json_response({"error": f"No words file for {lang}"}, status=404)
        
        words = word_repo.load_csv_words(csv_path)
        if not words:
            return web.json_response({"error": "Words file is empty or invalid"}, status=400)
            
        added_count = await word_repo.add_words_batch(user_id, lang, words)
        return web.json_response({"added": added_count})

    app.router.add_get("/api/words", list_words)
    app.router.add_post("/api/words", add_words)
    app.router.add_post("/api/words/preload", preload_words)
    app.router.add_get("/api/words/search", search_words)
    app.router.add_patch("/api/words/{word_id}", patch_word)
    app.router.add_delete("/api/words/all", delete_all_words)
    app.router.add_delete("/api/words/{word_id}", delete_word)
    app.router.add_get("/api/words/export", export_words)
