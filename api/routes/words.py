import csv
import io
import logging

import aiosqlite
from aiohttp import web

from api.app_keys import CONFIG_KEY, DB_KEY, TRANSLATOR_KEY
from api.auth import verify_bearer_token
from core.languages import LANGUAGES
from db.word import WordRepo

logger = logging.getLogger(__name__)


def _clean_words(raw: list[dict]) -> list[dict]:
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


def _duplicate_word_response(match: dict, lang: str) -> web.Response:
    """Build a shared successful duplicate response payload."""
    return web.json_response(
        {
            "ok": True,
            "result": {
                "added": 0,
                "status": "duplicate",
                "id": match.get("id"),
                "word": match["word"],
                "translation": match["translation"],
                "example": match.get("example"),
                "level": match.get("level"),
                "language": lang,
            },
        }
    )


def setup_routes_words(app: web.Application) -> None:
    """Register word management routes."""

    async def _process_add_ai_word(
        request: web.Request, user_id: int, lang: str, raw_word: str, telegram_id: int | str, word_repo: WordRepo
    ) -> web.Response:
        """Shared logic for AI-powered word translation, enrichment, and storage."""
        # 1. Quick duplicate check (raw input)
        match = await word_repo.get_word_by_text(user_id, lang, raw_word)
        if match:
            logger.info("AI Add: Word '%s' for user %s is a direct duplicate.", raw_word, telegram_id)
            return _duplicate_word_response(match, lang)

        # 2. Call Gemini
        translator = request.app.get(TRANSLATOR_KEY)
        if not translator:
            return web.json_response({"ok": False, "error": "ai_service_unavailable"}, status=503)

        try:
            ai_data = await translator.translate_and_enrich(raw_word, lang)
        except Exception as e:
            logger.error("AI translation failed: %s", e)
            return web.json_response({"ok": False, "error": "ai_service_unavailable"}, status=503)

        if (
            not ai_data
            or not ai_data.get("is_valid", True)
            or not ai_data.get("word")
            or not ai_data.get("translation")
        ):
            return web.json_response({"ok": False, "error": "word_not_recognized"}, status=422)

        word = ai_data["word"]
        trans = ai_data["translation"]
        example = ai_data["example"]
        level = ai_data["level"]

        # 3. Final duplicate check (after AI normalization)
        match = await word_repo.get_word_by_text(user_id, lang, word)
        if match:
            logger.info("AI Add: AI-normalized word '%s' for user %s is a duplicate.", word, telegram_id)
            return _duplicate_word_response(match, lang)

        # 4. Save
        new_id = await word_repo.add_single_word(user_id, lang, word, trans, example, level)
        if not new_id:
            # Already checked duplicate, but guard nonetheless
            return web.json_response({"ok": False, "error": "duplicate"}, status=409)

        logger.info("AI Add: User %s added '%s' (lang: %s)", telegram_id, word, lang)

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
        user_id = await verify_bearer_token(request, request.app[DB_KEY])
        if not user_id:
            return web.json_response({"ok": False, "error": "unauthorized"}, status=401)

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        if not isinstance(body.get("word"), str):
            return web.json_response({"ok": False, "error": "word_must_be_string"}, status=400)

        raw_word = body["word"].strip()
        lang = (body.get("language") or "").lower()

        if not lang or lang not in LANGUAGES:
            return web.json_response({"ok": False, "error": "invalid_language"}, status=400)
        if not raw_word:
            return web.json_response({"ok": False, "error": "word_missing"}, status=400)

        # External uses WordRepo(db) directly
        return await _process_add_ai_word(
            request, user_id, lang, raw_word, f"ext_{user_id}", WordRepo(request.app[DB_KEY])
        )

    async def add_word(request: web.Request) -> web.Response:
        """Internal App: Instant AI-powered word addition via session."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)
        raw_word = (body.get("word") or "").strip()
        if not raw_word:
            return web.json_response({"ok": False, "error": "word_missing"}, status=400)
        return await _process_add_ai_word(
            request,
            request["user_id"],
            request["language"],
            raw_word,
            request["telegram_id"],
            request["word_repo"],
        )

    async def add_words_batch(request: web.Request) -> web.Response:
        """Batch add words for the current user and language."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)
        words_data = _clean_words(body.get("words", []))
        if not words_data:
            return web.json_response({"ok": False, "error": "no_valid_words"}, status=400)

        added_count = await request["word_repo"].add_words_batch(request["user_id"], request["language"], words_data)
        logger.info("User %s batch added %d words (lang: %s)", request["telegram_id"], added_count, request["language"])
        return web.json_response({"ok": True, "result": {"added": added_count}})

    async def patch_word(request: web.Request) -> web.Response:
        """Update an existing word's text, translation, example, or level."""
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid_id"}, status=400)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)
        word = (body.get("word") or "").strip()
        translation = (body.get("translation") or "").strip()
        if not word or not translation:
            return web.json_response({"ok": False, "error": "missing_fields"}, status=400)

        try:
            success = await request["word_repo"].update_word_text(
                word_id,
                request["user_id"],
                word,
                translation,
                (body.get("example") or "").strip() or None,
                (body.get("level") or "").strip() or None,
            )
            if not success:
                return web.json_response({"ok": False, "error": "not_found"}, status=404)
            logger.info("User %s updated word %d: '%s'", request["telegram_id"], word_id, word)
        except aiosqlite.IntegrityError:
            return web.json_response({"ok": False, "error": "duplicate"}, status=409)
        return web.json_response({"ok": True})

    async def delete_word(request: web.Request) -> web.Response:
        """Delete a specific word by its ID."""
        try:
            word_id = int(request.match_info["word_id"])
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid_id"}, status=400)
        await request["word_repo"].delete_word(word_id, request["user_id"])
        logger.info("User %s deleted word %d", request["telegram_id"], word_id)
        return web.json_response({"ok": True})

    async def delete_words_batch(request: web.Request) -> web.Response:
        """Batch delete words for the current user."""
        try:
            ids = (await request.json()).get("ids", [])
        except Exception:
            return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

        if not ids:
            return web.json_response({"ok": True, "result": {"deleted": 0}})

        deleted = await request["word_repo"].delete_words_batch(request["user_id"], ids)
        logger.info("User %s batch deleted %d words.", request["telegram_id"], deleted)
        return web.json_response({"ok": True, "result": {"deleted": deleted}})

    async def search_words(request: web.Request) -> web.Response:
        """Search words by word or translation for the current user and language."""
        user_id = request["user_id"]
        lang = request["language"]
        filter_type = request.query.get("filter", "")
        word_repo = request["word_repo"]

        if filter_type in ("new", "learning", "known", "mastered"):
            words = await word_repo.get_words_by_status(user_id, lang, filter_type)
        elif filter_type in ("today", "reviewed"):
            config = request.app[CONFIG_KEY]
            settings = await request["user_repo"].get_user_settings(request["telegram_id"], lang, config)
            field = "created_at" if filter_type == "today" else "last_reviewed_at"
            words = await word_repo.get_today_words(user_id, lang, field=field, tz_name=settings.get("timezone", "UTC"))
        else:
            words = await word_repo.search_words(user_id, lang, request.query.get("q", ""))

        return web.json_response({"ok": True, "result": {"words": words}})

    async def export_words(request: web.Request) -> web.Response:
        """Export all words for the current user and language to a CSV file."""
        words = await request["word_repo"].get_all_words(request["user_id"], request["language"])
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["word", "translation", "example", "level"])
        for w in words:
            writer.writerow([w["word"], w["translation"], w.get("example") or "", w.get("level") or ""])

        response = web.Response(text=output.getvalue(), content_type="text/csv")
        response.headers["Content-Disposition"] = f'attachment; filename="words_{request["language"]}.csv"'
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
