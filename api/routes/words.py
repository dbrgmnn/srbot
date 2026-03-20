import csv
import io
import logging
from aiohttp import web
import aiosqlite
from db.repository import UserRepo, WordRepo
from api.auth import verify_bearer_token
from core.languages import LANGUAGES
from core.translator import Translator

logger = logging.getLogger(__name__)


def _clean_words(raw: list) -> list:
    result = []
    for w in raw:
        word = (w.get("word") or "").strip()
        trans = (w.get("translation") or "").strip()
        if word and trans:
            result.append({
                "word": word,
                "translation": trans,
                "example": (w.get("example") or "").strip() or None,
                "level": (w.get("level") or "").strip() or None
            })
    return result


def setup_routes_words(app: web.Application, db: aiosqlite.Connection):

    async def add_external_words(request: web.Request) -> web.Response:
        user_id = await verify_bearer_token(request, db)
        if not user_id:
            return web.json_response({"ok": False, "error": "unauthorized"}, status=401)
        
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        # 1. Get raw input
        raw_word = (body.get("word") or "").strip()
        lang = (body.get("language") or "").lower()
        
        if not lang or lang not in LANGUAGES:
            return web.json_response({"ok": False, "error": "language_required_and_must_be_supported"}, status=400)

        if not raw_word:
            return web.json_response({"ok": False, "error": "word_is_missing"}, status=400)

        word_repo = WordRepo(db)
        config = request.app["config"]

        # 2. Check for duplicate before calling AI
        match = await word_repo.get_word_by_term(user_id, lang, raw_word)
        if match:
            return web.json_response({"ok": True, "result": {"added": 0, "status": "duplicate", "word": match["word"], "translation": match["translation"], "example": match.get("example"), "level": match.get("level"), "language": lang}})

        # 3. Call Gemini
        if not config.gemini_api_key:
            return web.json_response({"ok": False, "error": "no_gemini_api_key"}, status=400)
        
        translator = Translator(config.gemini_api_key)
        try:
            ai_data = await translator.translate_and_enrich(raw_word, lang)
        finally:
            await translator.close()
        
        if not ai_data:
            return web.json_response({"ok": False, "error": "ai_translation_failed"}, status=422)

        word = ai_data["word"]
        trans = ai_data["translation"]
        example = ai_data["example"]
        level = ai_data["level"]

        # 4. Check for duplicate again using normalized AI lemma
        match = await word_repo.get_word_by_term(user_id, lang, word)
        if match:
            return web.json_response({"ok": True, "result": {"added": 0, "status": "duplicate", "word": match["word"], "translation": match["translation"], "example": match.get("example"), "level": match.get("level"), "language": lang}})

        # 5. Save enriched word
        words_to_add = [{"word": word, "translation": trans, "example": example, "level": level}]
        added_count = await word_repo.add_words_batch(user_id, lang, words_to_add)
        
        return web.json_response({
            "ok": True,
            "result": {
                "added": added_count,
                "word": word,
                "language": lang,
                "translation": trans,
                "example": example,
                "level": level
            }
        })

    async def add_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = request['language']
        body = await request.json()
        words_data = _clean_words(body.get("words", []))
        if not words_data:
            return web.json_response({"ok": False, "error": "no_valid_words"}, status=400)
            
        word_repo = WordRepo(db)
        added_count = await word_repo.add_words_batch(user_id, lang, words_data)
        return web.json_response({"ok": True, "result": {"added": added_count}})

    async def patch_word(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid_id"}, status=400)
        body = await request.json()
        word = (body.get("word") or "").strip()
        translation = (body.get("translation") or "").strip()
        if not word or not translation:
            return web.json_response({"ok": False, "error": "missing_fields"}, status=400)
        example = (body.get("example") or "").strip() or None
        level = (body.get("level") or "").strip() or None
        word_repo = WordRepo(db)
        try:
            await word_repo.update_word_text(word_id, user_id, word, translation, example, level)
        except aiosqlite.IntegrityError:
            return web.json_response({"ok": False, "error": "duplicate"}, status=409)
        return web.json_response({"ok": True})

    async def delete_all_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = request['language']
        word_repo = WordRepo(db)
        await word_repo.delete_all_words(user_id, lang)
        return web.json_response({"ok": True})

    async def delete_word(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid_id"}, status=400)
        word_repo = WordRepo(db)
        await word_repo.delete_word(word_id, user_id)
        return web.json_response({"ok": True})

    async def search_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = request['language']
        query = request.query.get("q", "")
        word_repo = WordRepo(db)
        words = await word_repo.search_words(user_id, lang, query)
        return web.json_response({"ok": True, "result": {"words": words}})

    async def export_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = request['language']
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

        response = web.Response(text=output.getvalue(), content_type="text/csv")
        response.headers["Content-Disposition"] = f'attachment; filename="words_{lang}.csv"'
        return response

    async def get_hint(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        config = request.app["config"]

        if not config.gemini_api_key:
            return web.json_response({"ok": False, "error": "no_gemini_api_key"}, status=400)

        try:
            word_id = int(request.query.get("word_id", ""))
        except (ValueError, TypeError):
            return web.json_response({"ok": False, "error": "invalid_id"}, status=400)

        word_repo = WordRepo(db)
        word = await word_repo.get_word(word_id, user_id)
        if not word:
            return web.json_response({"ok": False, "error": "not_found"}, status=404)

        translator = Translator(config.gemini_api_key)
        try:
            hint = await translator.get_hint(
                word=word["word"],
                translation=word["translation"],
                lang=word["language"],
            )
        finally:
            await translator.close()

        if not hint:
            return web.json_response({"ok": False, "error": "hint_failed"}, status=422)

        return web.json_response({"ok": True, "result": hint})

    async def preload_words(request: web.Request) -> web.Response:
        user_id = request["user_id"]
        lang = request['language']
        word_repo = WordRepo(db)
        
        config = request.app["config"]
        csv_path = config.data_dir / f"words_{lang}.csv"
        
        if not csv_path.exists():
            return web.json_response({"ok": False, "error": "not_found"}, status=404)
        
        words = word_repo.load_csv_words(csv_path)
        if not words:
            return web.json_response({"ok": False, "error": "empty_file"}, status=400)
            
        added_count = await word_repo.add_words_batch(user_id, lang, words)
        return web.json_response({"ok": True, "result": {"added": added_count}})


    # Static/specific routes MUST be registered before parameterized routes
    app.router.add_post("/api/words", add_words)
    app.router.add_post("/api/external/words", add_external_words)
    app.router.add_post("/api/words/preload", preload_words)
    app.router.add_get("/api/words/export", export_words)
    app.router.add_get("/api/words/search", search_words)
    app.router.add_get("/api/hint", get_hint)
    app.router.add_delete("/api/words/all", delete_all_words)
    app.router.add_patch("/api/words/{word_id}", patch_word)
    app.router.add_delete("/api/words/{word_id}", delete_word)
