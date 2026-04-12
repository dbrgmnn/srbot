"""Integration tests for API routes.

Uses an in-memory SQLite database and a real aiohttp TestClient.
No mocking required: valid Telegram initData is generated from the test bot
token, so the auth middleware accepts it normally.
"""

import hashlib
import hmac
import json
import time
from collections.abc import AsyncGenerator
from typing import Any
from urllib.parse import urlencode

import pytest
import pytest_asyncio
from aiohttp.test_utils import TestClient, TestServer
from aiohttp.web_app import Application
from aiohttp.web_request import Request

from api.server import create_app
from config import Config
from db.models import init_db

TEST_BOT_TOKEN = "1234567890:ABCDEfghijklmnopqrstuvwxyz-testtoken"
TEST_TELEGRAM_ID = 12345678
FORBIDDEN_TELEGRAM_ID = 99999999


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_init_data(telegram_id: int) -> str:
    """Generate a valid Telegram WebApp initData string for the given user."""
    user_json = json.dumps({"id": telegram_id}, separators=(",", ":"))
    params = {
        "auth_date": str(int(time.time())),
        "user": user_json,
    }
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret_key = hmac.new(b"WebAppData", TEST_BOT_TOKEN.encode(), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


def _headers(telegram_id: int = TEST_TELEGRAM_ID, lang: str = "en") -> dict:
    return {
        "X-Init-Data": _make_init_data(telegram_id),
        "X-Language": lang,
        "X-Timezone": "UTC",
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_config() -> Config:
    return Config(
        bot_token=TEST_BOT_TOKEN,
        webapp_url="http://localhost",
        allowed_users=[TEST_TELEGRAM_ID],
        db_path=":memory:",
        api_port=8081,
        gemini_api_key=None,
        gemini_model="gemini-test",
        token_expiry=3600,
        min_daily_limit=5,
        max_daily_limit=50,
        min_notify_interval=10,
        max_notify_interval=480,
        default_lang="en",
        default_timezone="UTC",
    )


@pytest_asyncio.fixture
async def client(test_config: Config) -> AsyncGenerator[TestClient[Request, Application], Any]:
    db = await init_db(":memory:")
    app = await create_app(test_config, db)
    async with TestClient(TestServer(app)) as c:
        yield c
    await db.close()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_endpoint(client: TestClient):
    """/health must return 200 without auth."""
    resp = await client.get("/health")
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    assert data["status"] == "healthy"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auth_missing_header(client: TestClient):
    """Request without X-Init-Data must return 401."""
    resp = await client.get("/api/init")
    assert resp.status == 401
    assert (await resp.json())["ok"] is False


@pytest.mark.asyncio
async def test_auth_forbidden_user(client: TestClient):
    """Telegram user absent from allowed_users must receive 403."""
    resp = await client.get("/api/init", headers=_headers(telegram_id=FORBIDDEN_TELEGRAM_ID))
    assert resp.status == 403
    assert (await resp.json())["ok"] is False


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_init_returns_user_data(client: TestClient):
    """/api/init must return user_id, settings, stats, and language metadata."""
    resp = await client.get("/api/init", headers=_headers())
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    result = data["result"]
    assert "user_id" in result
    assert "settings" in result
    assert "stats" in result
    assert "en" in result["languages"]
    assert "limits" in result


# ---------------------------------------------------------------------------
# Word management
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_add_words(client: TestClient):
    """POST /api/words/batch must return the count of inserted words."""
    words = [
        {"word": "apple", "translation": "яблоко", "example": "An apple a day.", "level": "A1"},
        {"word": "banana", "translation": "банан"},
    ]
    resp = await client.post("/api/words/batch", json={"words": words}, headers=_headers())
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    assert data["result"]["added"] == 2


@pytest.mark.asyncio
async def test_search_finds_added_word(client: TestClient):
    """Word added via batch must be retrievable by search."""
    await client.post(
        "/api/words/batch",
        json={"words": [{"word": "cat", "translation": "кот"}]},
        headers=_headers(),
    )
    resp = await client.get("/api/words/search?q=cat", headers=_headers())
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    assert any(w["word"] == "cat" for w in data["result"]["words"])


@pytest.mark.asyncio
async def test_update_word(client: TestClient):
    """PATCH /api/words/{id} must update the word's translation."""
    await client.post(
        "/api/words/batch",
        json={"words": [{"word": "dog", "translation": "собака"}]},
        headers=_headers(),
    )
    words = (await (await client.get("/api/words/search?q=dog", headers=_headers())).json())["result"]["words"]
    word_id = words[0]["id"]

    resp = await client.patch(f"/api/words/{word_id}", json={"word": "dog", "translation": "пёс"}, headers=_headers())
    assert resp.status == 200

    updated = (await (await client.get("/api/words/search?q=dog", headers=_headers())).json())["result"]["words"][0]
    assert updated["translation"] == "пёс"


@pytest.mark.asyncio
async def test_delete_word(client: TestClient):
    """DELETE /api/words/{id} must remove the word from search results."""
    await client.post(
        "/api/words/batch",
        json={"words": [{"word": "fish", "translation": "рыба"}]},
        headers=_headers(),
    )
    words = (await (await client.get("/api/words/search?q=fish", headers=_headers())).json())["result"]["words"]
    word_id = words[0]["id"]

    resp = await client.delete(f"/api/words/{word_id}", headers=_headers())
    assert resp.status == 200

    remaining = (await (await client.get("/api/words/search?q=fish", headers=_headers())).json())["result"]["words"]
    assert remaining == []


@pytest.mark.asyncio
async def test_add_word_ai_unavailable(client: TestClient):
    """POST /api/words must return 503 when Gemini translator is not configured."""
    resp = await client.post("/api/words", json={"word": "tree"}, headers=_headers())
    assert resp.status == 503
    assert (await resp.json())["error"] == "ai_service_unavailable"


# ---------------------------------------------------------------------------
# Practice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_returns_new_words(client: TestClient):
    """Words added via batch must appear in the practice session as new words."""
    await client.post(
        "/api/words/batch",
        json={"words": [{"word": "sun", "translation": "солнце"}, {"word": "moon", "translation": "луна"}]},
        headers=_headers(),
    )
    resp = await client.get("/api/session", headers=_headers())
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    assert len(data["result"]["words"]) == 2


@pytest.mark.asyncio
async def test_grade_updates_srs_state(client: TestClient):
    """Grading a word with quality=5 must set repetitions=1 and mark it as started."""
    await client.post(
        "/api/words/batch",
        json={"words": [{"word": "star", "translation": "звезда"}]},
        headers=_headers(),
    )
    session_words = (await (await client.get("/api/session", headers=_headers())).json())["result"]["words"]
    word_id = session_words[0]["id"]

    resp = await client.post("/api/grade", json={"word_id": word_id, "quality": 5}, headers=_headers())
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    assert "next_review" in data["result"]

    # After grading, word moves from st_new → st_learning in stats
    stats = (await (await client.get("/api/init", headers=_headers())).json())["result"]["stats"]
    assert stats["st_new"] == 0
    assert stats["st_learning"] == 1
    assert stats["today_reviewed"] == 1


@pytest.mark.asyncio
async def test_undo_restores_state(client: TestClient):
    """POST /api/undo must restore the word to its pre-grade state."""
    await client.post(
        "/api/words/batch",
        json={"words": [{"word": "sky", "translation": "небо"}]},
        headers=_headers(),
    )
    session_words = (await (await client.get("/api/session", headers=_headers())).json())["result"]["words"]
    word = session_words[0]
    word_id = word["id"]

    old_state = {
        "repetitions": word["repetitions"],
        "easiness": word["easiness"],
        "interval": word["interval"],
        "next_review": word["next_review"],
        "last_reviewed_at": word.get("last_reviewed_at"),
        "started_at": word.get("started_at"),
    }

    await client.post("/api/grade", json={"word_id": word_id, "quality": 5}, headers=_headers())

    resp = await client.post("/api/undo", json={"word_id": word_id, "old_state": old_state}, headers=_headers())
    assert resp.status == 200
    assert (await resp.json())["ok"] is True

    # After undo, word must reappear as new in session (started_at restored to NULL)
    session_after = (await (await client.get("/api/session", headers=_headers())).json())["result"]["words"]
    assert any(w["id"] == word_id for w in session_after)
    restored = next(w for w in session_after if w["id"] == word_id)
    assert restored["repetitions"] == old_state["repetitions"]
    assert restored["started_at"] == old_state["started_at"]  # both None
