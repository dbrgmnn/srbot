import csv
import io
import logging

import aiosqlite
from aiohttp import web

from api.app_keys import TRANSLATOR_KEY
from api.auth import verify_bearer_token
from core.languages import LANGUAGES
from db import UserRepo, WordRepo

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

    async def _process_add_ai_word(
        request: web.Request, user_id: int, lang: str, raw_word: str, telegram_id: int | str
    ) -> web.Response:
        """Shared logic for AI-powered word translation, enrichment, and storage."""
        word_repo = WordRepo(db)

        # 1. Quick duplicate check (raw input)
        match = await word_repo.get_word_by_text(user_id, lang, raw_word)
        if match:
            logger.info(f"AI Add: Word '{raw_word}' for user {telegram_id} is a direct duplicate.")
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

        # 2. Call Gemini
        translator = request.app.get(TRANSLATOR_KEY)
        if not translator:
            return web.json_response({"ok": False, "error": "ai_service_unavailable"}, status=503)

        try:
            ai_data = await translator.translate_and_enrich(raw_word, lang)
        except Exception as e:
            logger.error(f"AI translation failed: {e}")
            return web.json_response({"ok": False, "error": "ai_service_unavailable"}, status=503)

        if not ai_data or not ai_data.get("is_valid", True):
            return web.json_response({"ok": False, "error": "word_not_recognized"}, status=422)

        word = ai_data["word"]
        trans = ai_data["translation"]
        example = ai_data["example"]
        level = ai_data["level"]

        # 3. Final duplicate check (after AI normalization)
        match = await word_repo.get_word_by_text(user_id, lang, word)
        if match:
            logger.info(f"AI Add: AI-normalized word '{word}' for user {telegram_id} is a duplicate.")
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

        # 4. Save
        new_id = await word_repo.add_single_word(user_id, lang, word, trans, example, level)
        if not new_id:
            # Already checked duplicate, but guard nonetheless
            return web.json_response({"ok": False, "error": "duplicate"}, status=409)

        logger.info(f"AI Add: User {telegram_id} added '{word}' (lang: {lang})")

        return web.json_response(
            {
                "ok": True,
                "result": {
                    "id": new_id,
                    "added": 1,
                    "word": word,
                    "language": lang,
                    "translation": trans,
                    "example": example,
                    "level": level,
                },
            }
        )

    async def add_word_external(request: web.Request) -> web.Response:
        """External API: AI-powered word addition via Bearer token."""
        user_id = await verify_bearer_token(request, db)
        if not user_id:
            return web.json_response({"ok": False, "error": "unauthorized"}, status=401)

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        raw_word = (body.get("word") or "").strip()
        lang = (body.get("language") or "").lower()

        if not lang or lang not in LANGUAGES:
            return web.json_response({"ok": False, "error": "invalid_language"}, status=400)
        if not raw_word:
            return web.json_response({"ok": False, "error": "word_missing"}, status=400)

        return await _process_add_ai_word(request, user_id, lang, raw_word, f"ext_{user_id}")

    async def add_word(request: web.Request) -> web.Response:
        """Internal App: Instant AI-powered word addition via session."""
        user_id = request["user_id"]
        lang = request["language"]
        telegram_id = request["telegram_id"]

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        raw_word = (body.get("word") or "").strip()
        if not raw_word:
            return web.json_response({"ok": False, "error": "word_missing"}, status=400)

        return await _process_add_ai_word(request, user_id, lang, raw_word, telegram_id)

    async def add_words_batch(request: web.Request) -> web.Response:
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
            success = await word_repo.update_word_text(word_id, user_id, word, translation, example, level)
            if not success:
                return web.json_response({"ok": False, "error": "not_found"}, status=404)
            logger.info(f"User {telegram_id} updated word {word_id}: '{word}'")
        except aiosqlite.IntegrityError:
            return web.json_response({"ok": False, "error": "duplicate"}, status=409)
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

    async def delete_words_batch(request: web.Request) -> web.Response:
        """Batch delete words for the current user."""
        user_id = request["user_id"]
        telegram_id = request["telegram_id"]
        try:
            body = await request.json()
            ids = body.get("ids", [])
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        if not ids:
            return web.json_response({"ok": True, "result": {"deleted": 0}})

        word_repo = WordRepo(db)
        await word_repo.delete_words_batch(user_id, ids)
        logger.info(f"User {telegram_id} batch deleted {len(ids)} words.")
        return web.json_response({"ok": True, "result": {"deleted": len(ids)}})

    async def search_words(request: web.Request) -> web.Response:
        """Search words by word or translation for the current user and language."""
        user_id = request["user_id"]
        lang = request["language"]
        query = request.query.get("q", "")
        filter_type = request.query.get("filter", "")

        word_repo = WordRepo(db)

        if filter_type in ("new", "learning", "known", "mastered"):
            words = await word_repo.get_words_by_status(user_id, lang, filter_type)
        elif filter_type == "today":
            # Need timezone from user_settings for correctness
            user_repo = UserRepo(db)
            settings = await user_repo.get_user_settings(request["telegram_id"], lang)
            tz_name = settings.get("timezone", "UTC")
            words = await word_repo.get_today_added_words(user_id, lang, tz_name)
        elif filter_type == "reviewed":
            user_repo = UserRepo(db)
            settings = await user_repo.get_user_settings(request["telegram_id"], lang)
            tz_name = settings.get("timezone", "UTC")
            words = await word_repo.get_today_reviewed_words(user_id, lang, tz_name)
        else:
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
    app.router.add_post("/api/words/batch", add_words_batch)
    app.router.add_post("/api/words", add_word)
    app.router.add_post("/api/external/words", add_word_external)
    app.router.add_get("/api/words/export", export_words)
    app.router.add_get("/api/words/search", search_words)
    app.router.add_patch("/api/words/{word_id}", patch_word)
    app.router.add_delete("/api/words/batch", delete_words_batch)
    app.router.add_delete("/api/words/{word_id}", delete_word)
