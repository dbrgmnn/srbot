import logging
from datetime import UTC, datetime, timedelta

import aiosqlite

from .utils import today_start_utc

logger = logging.getLogger(__name__)


class WordRepo:
    """Repository for managing word-related data and statistics."""

    def __init__(self, db: aiosqlite.Connection):
        """Initialize the WordRepo with a database connection."""
        self.db = db

    async def add_words_batch(self, user_id: int, language: str, words: list[dict]) -> int:
        """Add a batch of words to the user's dictionary and return count of successfully added items."""
        now = datetime.now(tz=UTC).isoformat()
        data = [
            (
                user_id,
                w["word"],
                w["translation"],
                language,
                w.get("example"),
                w.get("level"),
                now,
                now,
            )
            for w in words
        ]
        cursor = await self.db.executemany(
            """INSERT OR IGNORE INTO words
                (user_id, word, translation, language, example, level, next_review, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            data,
        )
        await self.db.commit()
        logger.info("Added %d words for user %d in %s", cursor.rowcount, user_id, language)
        return cursor.rowcount

    async def add_single_word(
        self, user_id: int, language: str, word: str, translation: str, example: str = None, level: str = None
    ) -> int | None:
        """Add a single word and return its database ID."""
        now = datetime.now(tz=UTC).isoformat()
        cursor = await self.db.execute(
            """INSERT OR IGNORE INTO words
                (user_id, word, translation, language, example, level, next_review, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, word, translation, language, example, level, now, now),
        )
        await self.db.commit()
        word_id = cursor.lastrowid if cursor.rowcount > 0 else None
        if word_id:
            logger.info("Added word ID %d for user %d", word_id, user_id)
        return word_id

    async def get_session_words(self, user_id: int, language: str, new_limit: int) -> list[dict]:
        """Get words for a practice session, including due reviews and new words."""
        now = datetime.now(tz=UTC).isoformat()
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level, repetitions, started_at,
                      easiness, interval, next_review, last_reviewed_at
                FROM words
                WHERE user_id = ? AND language = ? AND started_at IS NOT NULL AND next_review <= ?
                ORDER BY next_review ASC""",
            (user_id, language, now),
        )
        due = [dict(row) for row in await cursor.fetchall()]

        new_words = []
        if new_limit > 0:
            cursor = await self.db.execute(
                """SELECT id, word, translation, example, level, repetitions, started_at,
                          easiness, interval, next_review, last_reviewed_at
                    FROM words
                    WHERE user_id = ? AND language = ? AND started_at IS NULL
                    ORDER BY RANDOM()
                    LIMIT ?""",
                (user_id, language, new_limit),
            )
            new_words = [dict(row) for row in await cursor.fetchall()]

        logger.debug("Fetched session for user %d: %d due, %d new", user_id, len(due), len(new_words))
        return due + new_words

    async def update_word_after_review(
        self,
        user_id: int,
        word_id: int,
        repetitions: int,
        easiness: float,
        interval: int,
        next_review: datetime,
    ):
        """Update word statistics after a review session."""
        now = datetime.now(tz=UTC).isoformat()
        await self.db.execute(
            """UPDATE words
                SET repetitions = ?, easiness = ?, interval = ?, next_review = ?,
                    last_reviewed_at = ?,
                    started_at = COALESCE(started_at, ?)
                WHERE id = ? AND user_id = ?""",
            (repetitions, easiness, interval, next_review.isoformat(), now, now, word_id, user_id),
        )
        await self.db.commit()
        logger.info(
            "Updated word ID %d for user %d: interval=%d, next_review=%s",
            word_id,
            user_id,
            interval,
            next_review.isoformat(),
        )

    async def undo_word_review(
        self,
        user_id: int,
        word_id: int,
        repetitions: int,
        easiness: float,
        interval: int,
        next_review: str,
        last_reviewed_at: str | None,
        started_at: str | None,
    ):
        """Revert word statistics to a previous state."""
        await self.db.execute(
            """UPDATE words
                SET repetitions = ?, easiness = ?, interval = ?, next_review = ?,
                    last_reviewed_at = ?, started_at = ?
                WHERE id = ? AND user_id = ?""",
            (repetitions, easiness, interval, next_review, last_reviewed_at, started_at, word_id, user_id),
        )
        await self.db.commit()
        logger.info("Undone review for word ID %d, user %d", word_id, user_id)

    async def get_full_stats(self, user_id: int, language: str, daily_limit: int = 20, tz_name: str = "UTC") -> dict:
        """Get comprehensive statistics about the user's learning progress."""
        now_utc = datetime.now(tz=UTC)
        today_start = today_start_utc(tz_name)
        next_day_start = today_start + timedelta(days=1)

        cursor = await self.db.execute(
            """SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN started_at IS NOT NULL THEN 1 ELSE 0 END) as learned,
                    SUM(CASE WHEN started_at IS NOT NULL AND next_review <= ? THEN 1 ELSE 0 END) as due,
                    COUNT(CASE WHEN started_at >= ? THEN 1 END) as today_new,
                    COUNT(CASE WHEN created_at >= ? THEN 1 END) as today_added,
                    COUNT(CASE WHEN last_reviewed_at >= ? THEN 1 END) as today_reviewed,
                    COUNT(CASE WHEN started_at IS NULL THEN 1 END) as st_new,
                    COUNT(CASE WHEN started_at IS NOT NULL AND interval < 5 THEN 1 END) as st_learning,
                    COUNT(CASE WHEN started_at IS NOT NULL AND interval >= 5 AND interval < 30 THEN 1 END) as st_known,
                    COUNT(CASE WHEN started_at IS NOT NULL AND interval >= 30 THEN 1 END) as st_mastered,
                    MIN(CASE WHEN started_at IS NOT NULL AND next_review > ? THEN next_review END) as next_due_at
                FROM words WHERE user_id = ? AND language = ?""",
            (
                now_utc.isoformat(),
                today_start.isoformat(),
                today_start.isoformat(),
                today_start.isoformat(),
                now_utc.isoformat(),
                user_id,
                language,
            ),
        )
        row = await cursor.fetchone()

        defaults = {
            "total": 0,
            "learned": 0,
            "due": 0,
            "today_new": 0,
            "today_added": 0,
            "today_reviewed": 0,
            "st_new": 0,
            "st_learning": 0,
            "st_known": 0,
            "st_mastered": 0,
            "next_due_at": None,
            "session_total": 0,
            "next_day_start_utc": next_day_start.isoformat(),
        }
        if row:
            data = dict(row)
            # Calculate session_total in Python for consistency with practice logic
            due_count = data.get("due") or 0
            new_count = data.get("st_new") or 0
            today_done = data.get("today_new") or 0
            limit = daily_limit or 20

            available_new = max(0, min(new_count, limit - today_done))
            data["session_total"] = due_count + available_new

            res = {**defaults, **{k: v for k, v in data.items() if v is not None}}
            res["next_day_start_utc"] = next_day_start.isoformat()
            return res
        return defaults

    async def update_word_text(
        self,
        word_id: int,
        user_id: int,
        word: str,
        translation: str,
        example: str | None,
        level: str | None,
    ) -> bool:
        """Update the text, translation, example, or level of a word. Returns True if successful."""
        cursor = await self.db.execute(
            """UPDATE words SET word = ?, translation = ?, example = ?, level = ?
               WHERE id = ? AND user_id = ?""",
            (word, translation, example, level, word_id, user_id),
        )
        await self.db.commit()
        if cursor.rowcount > 0:
            logger.info("Updated word ID %d for user %d", word_id, user_id)
        return cursor.rowcount > 0

    async def delete_word(self, word_id: int, user_id: int):
        """Delete a specific word for a user."""
        await self.db.execute(
            "DELETE FROM words WHERE id = ? AND user_id = ?",
            (word_id, user_id),
        )
        await self.db.commit()
        logger.info("Deleted word ID %d for user %d", word_id, user_id)

    async def delete_words_batch(self, user_id: int, word_ids: list[int]):
        """Delete multiple words for a user in one go."""
        if not word_ids:
            return
        placeholders = ",".join(["?"] * len(word_ids))
        await self.db.execute(
            f"DELETE FROM words WHERE id IN ({placeholders}) AND user_id = ?",
            (*word_ids, user_id),
        )
        await self.db.commit()
        logger.info("Deleted %d words for user %d", len(word_ids), user_id)

    async def search_words(self, user_id: int, language: str, query: str) -> list[dict]:
        """Search for words in the user's dictionary by word or translation."""
        q = f"%{query.lower()}%"
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level FROM words
                WHERE user_id = ? AND language = ?
                AND (LOWER(word) LIKE ? OR LOWER(translation) LIKE ?)
                ORDER BY word ASC LIMIT 100""",
            (user_id, language, q, q),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_words_by_status(self, user_id: int, language: str, status: str) -> list[dict]:
        """Get words filtered by learning status (new, learning, known, mastered)."""
        where_clause = ""
        if status == "new":
            where_clause = "AND started_at IS NULL"
        elif status == "learning":
            where_clause = "AND started_at IS NOT NULL AND interval < 5"
        elif status == "known":
            where_clause = "AND started_at IS NOT NULL AND interval >= 5 AND interval < 30"
        elif status == "mastered":
            where_clause = "AND started_at IS NOT NULL AND interval >= 30"
        else:
            return []

        cursor = await self.db.execute(
            f"""SELECT id, word, translation, example, level FROM words
                WHERE user_id = ? AND language = ? {where_clause}
                ORDER BY word ASC LIMIT 500""",
            (user_id, language),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_today_words(
        self, user_id: int, language: str, field: str = "created_at", tz_name: str = "UTC"
    ) -> list[dict]:
        """Get words filtered by date field (created_at or last_reviewed_at) for today in user's timezone."""
        _allowed = {"created_at", "last_reviewed_at"}
        if field not in _allowed:
            raise ValueError("Invalid date field: %s" % field)
        start = today_start_utc(tz_name)
        cursor = await self.db.execute(
            f"""SELECT id, word, translation, example, level FROM words
               WHERE user_id = ? AND language = ? AND {field} >= ?
               ORDER BY {field} DESC""",
            (user_id, language, start.isoformat()),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_all_words(self, user_id: int, language: str) -> list[dict]:
        """Get all words for a user in a specific language."""
        cursor = await self.db.execute(
            """SELECT word, translation, example, level
               FROM words
               WHERE user_id = ? AND language = ?
               ORDER BY word ASC""",
            (user_id, language),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_word(self, word_id: int, user_id: int) -> dict | None:
        """Retrieve a single word by its ID."""
        cursor = await self.db.execute(
            "SELECT * FROM words WHERE id = ? AND user_id = ?",
            (word_id, user_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def get_word_by_text(self, user_id: int, language: str, word: str) -> dict | None:
        """Retrieve a word by its term (case-insensitive)."""
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level FROM words
               WHERE user_id = ? AND language = ? AND LOWER(word) = LOWER(?)""",
            (user_id, language, word),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
