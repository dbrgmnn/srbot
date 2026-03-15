from pathlib import Path
from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from api.auth import get_language, verify_bearer_token


def setup_routes_words(app: web.Application, db: aiosqlite.Connection):

    async def add_external_words(request: web.Request) -> web.Response:
        user_id = await verify_bearer_token(request, db)
        if not user_id:
            return web.json_response({
                "ok": False, 
                "error": "unauthorized", 
                "msg": "❌ Invalid API Token"
            }, status=401)
        
        body = await request.json()
        raw_words = body.get("words")
        
        # Normalize to list
        if not raw_words:
            # try single word format
            word = (body.get("word") or "").strip()
            translation = (body.get("translation") or "").strip()
            if word and translation:
                raw_words = [{
                    "word": word, 
                    "translation": translation, 
                    "example": body.get("example"),
                    "level": body.get("level")
                }]
        
        if not raw_words or not isinstance(raw_words, list):
            return web.json_response({
                "ok": False, 
                "error": "no words", 
                "msg": "⚠️ No word or translation provided"
            }, status=400)

        # Clean and validate data
        words_data = []
        for w in raw_words:
            word = (w.get("word") or "").strip()
            trans = (w.get("translation") or "").strip()
            if word and trans:
                words_data.append({
                    "word": word,
                    "translation": trans,
                    "example": (w.get("example") or "").strip() or None,
                    "level": (w.get("level") or "").strip() or None
                })
        
        if not words_data:
            return web.json_response({
                "ok": False, 
                "error": "invalid data", 
                "msg": "⚠️ Provided data is empty after cleaning"
            }, status=400)
            
        lang = body.get("language", "de").lower()
        word_repo = WordRepo(db)
        added_count = await word_repo.add_words_batch(user_id, lang, words_data)
        
        # Build response
        if len(words_data) == 1:
            single_word = words_data[0]["word"]
            if added_count > 0:
                return web.json_response({
                    "ok": True, 
                    "status": "added", 
                    "msg": f"✅ Added: {single_word}",
                    "word": single_word
                })
            else:
                return web.json_response({
                    "ok": True, 
                    "status": "exists", 
                    "msg": f"ℹ️ Already exists: {single_word}",
                    "word": single_word
                })
        
        return web.json_response({
            "ok": True, 
            "status": "batch_completed", 
            "msg": f"📥 Processed {len(words_data)} valid words, added {added_count}",
            "added": added_count
        })

    async def list_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = get_language(request)
        word_repo = WordRepo(db)
        words = await word_repo.search_words(user_id, lang, "")
        return web.json_response({"words": words})

    async def add_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = get_language(request)
        body = await request.json()
        raw_words = body.get("words", [])
        
        # Clean and validate data
        words_data = []
        for w in raw_words:
            word = (w.get("word") or "").strip()
            trans = (w.get("translation") or "").strip()
            if word and trans:
                words_data.append({
                    "word": word,
                    "translation": trans,
                    "example": (w.get("example") or "").strip() or None,
                    "level": (w.get("level") or "").strip() or None
                })

        if not words_data:
            return web.json_response({"error": "no valid words provided"}, status=400)
            
        word_repo = WordRepo(db)
        added_count = await word_repo.add_words_batch(user_id, lang, words_data)
        return web.json_response({"added": added_count})

    async def patch_word(request: web.Request) -> web.Response:
        user_id = request["user_id"]
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
        word_repo = WordRepo(db)
        try:
            await word_repo.update_word_text(word_id, user_id, word, translation, example, level)
        except Exception:
            return web.json_response({"error": "duplicate"}, status=409)
        return web.json_response({"ok": True})

    async def delete_all_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = get_language(request)
        word_repo = WordRepo(db)
        await word_repo.delete_all_words(user_id, lang)
        return web.json_response({"ok": True})

    async def delete_word(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"error": "invalid word_id"}, status=400)
        word_repo = WordRepo(db)
        await word_repo.delete_word(word_id, user_id)
        return web.json_response({"ok": True})

    async def search_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = get_language(request)
        query = request.query.get("q", "")
        word_repo = WordRepo(db)
        words = await word_repo.search_words(user_id, lang, query)
        return web.json_response({"words": words})

    async def export_words(request: web.Request) -> web.Response:
        import csv
        import io
        user_id = request["user_id"]
        lang = get_language(request)
        word_repo = WordRepo(db)
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
        user_id = request["user_id"]
        lang = get_language(request)
        word_repo = WordRepo(db)
        
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
    app.router.add_post("/api/external/words", add_external_words)
    app.router.add_post("/api/words/preload", preload_words)
    app.router.add_get("/api/words/search", search_words)
    app.router.add_patch("/api/words/{word_id}", patch_word)
    app.router.add_delete("/api/words/all", delete_all_words)
    app.router.add_delete("/api/words/{word_id}", delete_word)
    app.router.add_get("/api/words/export", export_words)
