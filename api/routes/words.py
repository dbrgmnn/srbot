import csv
import io
import logging

import aiosqlite
from aiohttp import web

from api.app_keys import TRANSLATOR_KEY
from api.auth import verify_bearer_token
from core.languages import LANGUAGES
from db.repository import WordRepo

logger = logging.getLogger(__name__)


# --- Helpers ---


def _clean_words(raw: list) -> list:
    """Clean and validate a list of raw word dictionaries."""
    result = []
    for w in raw:
        word = (w.get("word") or "").strip()
        trans = (w.get("translation") or "").strip()
        if word and trans:
            result.append(
                {
                    "word": word,
                    "translation": trans,
                    "example": (w.get("example") or "").strip() or None,
                    "level": (w.get("level") or "").strip() or None,
                }
            )
    return result


# --- Routes ---


def setup_routes_words(app: web.Application, db: aiosqlite.Connection):
    """Register word management routes."""

    async def add_external_words(request: web.Request) -> web.Response:
        """Process a single word from external source: translate, enrich via AI, and save."""
        user_id = await verify_bearer_token(request, db)
        if not user_id:
            return web.json_response({"ok": False, "error": "unauthorized"}, status=401)

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        # Get and validate raw input
        raw_word = (body.get("word") or "").strip()
        lang = (body.get("language") or "").lower()

        if not lang or lang not in LANGUAGES:
            return web.json_response({"ok": False, "error": "language_required_and_must_be_supported"}, status=400)

        if not raw_word:
            return web.json_response({"ok": False, "error": "word_is_missing"}, status=400)

        word_repo = WordRepo(db)

        # Check for duplicate before calling AI
        match = await word_repo.get_word_by_text(user_id, lang, raw_word)
        if match:
            return web.json_response(
                {
                    "ok": True,
                    "result": {
                        "added": 0,
                        "status": "duplicate",
                        "word": match["word"],
                        "translation": match["translation"],
                        "example": match.get("example"),
                        "level": match.get("level"),
                        "language": lang,
                    },
                }
            )

        # Call Gemini for translation and enrichment
        translator = request.app.get(TRANSLATOR_KEY)
        if not translator:
            return web.json_response({"ok": False, "error": "no_gemini_api_key_or_translator"}, status=400)

        try:
            ai_data = await translator.translate_and_enrich(raw_word, lang)
        except Exception as e:
            logger.error(f"AI translation failed: {e}")
            return web.json_response({"ok": False, "error": "ai_service_unavailable"}, status=503)

        if not ai_data:
            return web.json_response({"ok": False, "error": "ai_service_unavailable"}, status=503)

        if not ai_data.get("is_valid", True):
            return web.json_response({"ok": False, "error": "word_not_recognized"}, status=422)

        word = ai_data["word"]
        trans = ai_data["translation"]
        example = ai_data["example"]
        level = ai_data["level"]

        # Check again using AI-normalized lemma
        match = await word_repo.get_word_by_text(user_id, lang, word)
        if match:
            return web.json_response(
                {
                    "ok": True,
                    "result": {
                        "added": 0,
                        "status": "duplicate",
                        "word": match["word"],
                        "translation": match["translation"],
                        "example": match.get("example"),
                        "level": match.get("level"),
                        "language": lang,
                    },
                }
            )

        # Save enriched word
        words_to_add = [{"word": word, "translation": trans, "example": example, "level": level}]
        added_count = await word_repo.add_words_batch(user_id, lang, words_to_add)

        logger.info(f"External API: User {user_id} added enriched word '{word}' (lang: {lang})")

        return web.json_response(
            {
                "ok": True,
                "result": {
                    "added": added_count,
                    "word": word,
                    "language": lang,
                    "translation": trans,
                    "example": example,
                    "level": level,
                },
            }
        )

    async def add_words(request: web.Request) -> web.Response:
        """Batch add words for the current user and language."""
        user_id = request["user_id"]
        lang = request["language"]
        body = await request.json()
        words_data = _clean_words(body.get("words", []))
        if not words_data:
            return web.json_response({"ok": False, "error": "no_valid_words"}, status=400)

        word_repo = WordRepo(db)
        added_count = await word_repo.add_words_batch(user_id, lang, words_data)
        logger.info(f"User {request['telegram_id']} batch added {added_count} words (lang: {lang})")
        return web.json_response({"ok": True, "result": {"added": added_count}})

    async def patch_word(request: web.Request) -> web.Response:
        """Update an existing word's text, translation, example, or level."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
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
            logger.info(f"User {telegram_id} updated word {word_id}: '{word}'")
        except aiosqlite.IntegrityError:
            return web.json_response({"ok": False, "error": "duplicate"}, status=409)
        return web.json_response({"ok": True})

    async def delete_all_words(request: web.Request) -> web.Response:
        """Delete all words for the user's current language."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        lang = request["language"]
        word_repo = WordRepo(db)
        await word_repo.delete_all_words(user_id, lang)
        logger.info(f"User {telegram_id} deleted ALL words for language '{lang}'")
        return web.json_response({"ok": True})

    async def delete_word(request: web.Request) -> web.Response:
        """Delete a specific word by its ID."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid_id"}, status=400)
        word_repo = WordRepo(db)
        await word_repo.delete_word(word_id, user_id)
        logger.info(f"User {telegram_id} deleted word {word_id}")
        return web.json_response({"ok": True})

    async def search_words(request: web.Request) -> web.Response:
        """Search words by word or translation for the current user and language."""
        user_id = request["user_id"]
        lang = request["language"]
        query = request.query.get("q", "")
        word_repo = WordRepo(db)
        words = await word_repo.search_words(user_id, lang, query)
        return web.json_response({"ok": True, "result": {"words": words}})

    async def export_words(request: web.Request) -> web.Response:
        """Export all words for the current user and language to a CSV file."""
        user_id = request["user_id"]
        lang = request["language"]
        word_repo = WordRepo(db)
        words = await word_repo.get_all_words(user_id, lang)

        output = io.StringIO()
        writer = csv.writer(output)

        # Headers match load_csv_words expected format
        writer.writerow(["word", "translation", "example", "level"])

        for w in words:
            writer.writerow([w["word"], w["translation"], w.get("example") or "", w.get("level") or ""])

        response = web.Response(text=output.getvalue(), content_type="text/csv")
        response.headers["Content-Disposition"] = f'attachment; filename="words_{lang}.csv"'
        return response

    # specific routes must be registered before parameterized ones
    app.router.add_post("/api/words", add_words)
    app.router.add_post("/api/external/words", add_external_words)
    app.router.add_get("/api/words/export", export_words)
    app.router.add_get("/api/words/search", search_words)
    app.router.add_delete("/api/words/all", delete_all_words)
    app.router.add_patch("/api/words/{word_id}", patch_word)
    app.router.add_delete("/api/words/{word_id}", delete_word)
