import logging
import secrets
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import aiosqlite

logger = logging.getLogger(__name__)


def _safe_zoneinfo(tz_name: str, fallback: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        logger.warning(f"Invalid timezone '{tz_name}', falling back to '{fallback}'")
        return ZoneInfo(fallback)


class UserRepo:
    """Repository for managing user-related data and settings."""

    def __init__(self, db: aiosqlite.Connection):
        """Initialize the UserRepo with a database connection."""
        self.db = db

    async def get_or_create(self, telegram_id: int, language: str, tz_name: str, config=None) -> int:
        """Get an existing user's ID or create a new user record with default settings."""
        # Use ON CONFLICT to ensure atomic creation or ignore if exists
        await self.db.execute(
            "INSERT INTO users (telegram_id) VALUES (?) ON CONFLICT(telegram_id) DO NOTHING",
            (telegram_id,),
        )

        cursor = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await cursor.fetchone()
        user_id = row["id"]

        # Initialize settings for this language if not already present
        await self._create_settings(user_id, language, tz_name, config)
        await self.db.commit()
        return user_id

    async def _create_settings(self, user_id: int, language: str, tz_name: str, config=None):
        """Create default settings for a user and language if they don't exist."""
        limit = config.max_daily_limit // 2 if config else 20
        interval = config.max_notify_interval // 2 if config else 240

        await self.db.execute(
            """INSERT OR IGNORE INTO user_settings
               (user_id, language, timezone, daily_limit, notification_interval_minutes)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, language, tz_name, limit, interval),
        )

    async def set_last_notified_at(self, telegram_id: int, language: str):
        """Update the timestamp of the last notification sent to the user."""
        now = datetime.now(tz=UTC).isoformat()
        await self.db.execute(
            """UPDATE user_settings SET last_notified_at = ?
               WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
               AND language = ?""",
            (now, telegram_id, language),
        )
        await self.db.commit()

    async def get_user_settings(self, telegram_id: int, language: str, config=None) -> dict:
        """Retrieve user settings for a specific language, with defaults if not found."""
        cursor = await self.db.execute(
            """SELECT s.* FROM user_settings s
                JOIN users u ON s.user_id = u.id
                WHERE u.telegram_id = ? AND s.language = ?""",
            (telegram_id, language),
        )
        row = await cursor.fetchone()

        default_limit = config.max_daily_limit // 2 if config else 20
        default_interval = config.max_notify_interval // 2 if config else 240
        defaults = {
            "quiet_start": "23:00",
            "quiet_end": "08:00",
            "daily_limit": default_limit,
            "notification_interval_minutes": default_interval,
            "language": language,
            "practice_mode": "word_to_translation",
            "timezone": "UTC",
        }

        if row:
            data = dict(row)
            # Replace any None values from DB with defaults
            for k, v in defaults.items():
                if data.get(k) is None:
                    data[k] = v
            return data

        return defaults

    async def _update_setting(self, field: str, value, telegram_id: int, language: str):
        """Generic method to update a single user setting field."""
        await self.db.execute(
            f"""INSERT INTO user_settings (user_id, language, {field})
               VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?)
               ON CONFLICT(user_id, language) DO UPDATE SET {field} = excluded.{field}""",
            (telegram_id, language, value),
        )
        await self.db.commit()

    async def update_timezone(self, telegram_id: int, tz_name: str, language: str):
        """Update the user's timezone for a specific language."""
        await self._update_setting("timezone", tz_name, telegram_id, language)

    async def update_daily_limit(self, telegram_id: int, limit: int, language: str):
        """Update the daily limit for new words for a specific language."""
        await self._update_setting("daily_limit", limit, telegram_id, language)

    async def update_notification_interval(self, telegram_id: int, minutes: int, language: str):
        """Update the notification interval for a specific language."""
        await self._update_setting("notification_interval_minutes", minutes, telegram_id, language)

    async def update_quiet_hours(
        self, telegram_id: int, quiet_start: str = None, quiet_end: str = None, language: str = None
    ):
        """Update the quiet hours during which notifications are suppressed."""
        fields = {}
        if quiet_start is not None:
            fields["quiet_start"] = quiet_start
        if quiet_end is not None:
            fields["quiet_end"] = quiet_end
        if not fields:
            return
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        await self.db.execute(
            f"""UPDATE user_settings SET {set_clause}
                WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
                AND language = ?""",
            (*fields.values(), telegram_id, language),
        )
        await self.db.commit()

    async def update_practice_mode(self, telegram_id: int, mode: str, language: str):
        """Update the practice mode for a specific language."""
        await self._update_setting("practice_mode", mode, telegram_id, language)

    async def update_language(self, telegram_id: int, new_language: str, config=None):
        """Initialize settings for a new language for the user."""
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row:
            return
        # Create settings row for the new language if it doesn't exist yet
        await self._create_settings(row["id"], new_language, "UTC", config)
        await self.db.commit()

    async def get_min_notification_interval(self, config=None) -> float:
        """Get the minimum notification interval across all users."""
        cursor = await self.db.execute("SELECT MIN(notification_interval_minutes) as min_interval FROM user_settings")
        row = await cursor.fetchone()
        default = float(config.max_notify_interval // 2) if config else 240.0
        return float(row["min_interval"]) if (row and row["min_interval"]) else default

    async def get_api_token(self, telegram_id: int) -> str | None:
        """Retrieve the API token for a user."""
        cursor = await self.db.execute("SELECT api_token FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await cursor.fetchone()
        return row["api_token"] if row else None

    async def generate_api_token(self, telegram_id: int) -> str:
        """Generate and save a new API token for a user."""
        new_token = secrets.token_hex(16)
        await self.db.execute("UPDATE users SET api_token = ? WHERE telegram_id = ?", (new_token, telegram_id))
        await self.db.commit()
        return new_token

    async def get_user_by_token(self, token: str) -> tuple[int, int] | None:
        """Find a user by their API token."""
        cursor = await self.db.execute("SELECT id, telegram_id FROM users WHERE api_token = ?", (token,))
        row = await cursor.fetchone()
        return (row["id"], row["telegram_id"]) if row else None

    async def get_words_count_per_language(self, user_id: int) -> dict:
        """Get the number of words learned by a user per language."""
        cursor = await self.db.execute(
            "SELECT language, COUNT(*) as cnt FROM words WHERE user_id = ? GROUP BY language",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return {row["language"]: row["cnt"] for row in rows}

    async def get_today_new_count(
        self, user_id: int, language: str, tz_name: str = "UTC", fallback_tz: str = "UTC"
    ) -> int:
        """Count how many new words the user has started learning today."""
        tz = _safe_zoneinfo(tz_name, fallback_tz)
        now_utc = datetime.now(tz=UTC)
        local_now = now_utc.astimezone(tz)
        today_start_utc = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
        cursor = await self.db.execute(
            "SELECT COUNT(*) as cnt FROM words WHERE user_id = ? AND language = ? AND started_at >= ?",
            (user_id, language, today_start_utc.isoformat()),
        )
        row = await cursor.fetchone()
        return int(row["cnt"]) if row else 0

    async def get_users_with_due_words(self) -> list[dict]:
        """Find users who have words due for review or new words available."""
        now_utc = datetime.now(tz=UTC).isoformat()

        cursor = await self.db.execute(
            """SELECT u.id as user_id, u.telegram_id,
                        w.language,
                        s.quiet_start, s.quiet_end, s.daily_limit, s.timezone,
                        s.notification_interval_minutes, s.last_notified_at
                FROM users u
                JOIN words w ON w.user_id = u.id
                JOIN user_settings s ON s.user_id = u.id AND s.language = w.language
                GROUP BY u.id, w.language
                HAVING
                    SUM(CASE WHEN w.started_at IS NOT NULL AND w.next_review <= ? THEN 1 ELSE 0 END) > 0
                    OR SUM(CASE WHEN w.started_at IS NULL THEN 1 ELSE 0 END) > 0""",
            (now_utc,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


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
        await self.db.executemany(
            """INSERT OR IGNORE INTO words
                (user_id, word, translation, language, example, level, next_review, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            data,
        )
        row = await (await self.db.execute("SELECT changes()")).fetchone()
        await self.db.commit()
        return int(row[0]) if row else 0

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

        return due + new_words

    async def update_word_after_review(
        self,
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
                WHERE id = ?""",
            (repetitions, easiness, interval, next_review.isoformat(), now, now, word_id),
        )
        await self.db.commit()

    async def undo_word_review(
        self,
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
                WHERE id = ?""",
            (repetitions, easiness, interval, next_review, last_reviewed_at, started_at, word_id),
        )
        await self.db.commit()

    async def get_full_stats(self, user_id: int, language: str, tz_name: str = "UTC", fallback_tz: str = "UTC") -> dict:
        """Get comprehensive statistics about the user's learning progress."""
        now_utc = datetime.now(tz=UTC)
        tz = _safe_zoneinfo(tz_name, fallback_tz)
        local_now = now_utc.astimezone(tz)
        today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_start_local.astimezone(UTC)
        next_day_start_utc = (today_start_local + timedelta(days=1)).astimezone(UTC)

        cursor = await self.db.execute(
            """SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN started_at IS NOT NULL THEN 1 ELSE 0 END) as learned,
                    SUM(CASE WHEN started_at IS NULL THEN 1 ELSE 0 END) as new,
                    SUM(CASE WHEN started_at IS NOT NULL AND next_review <= ? THEN 1 ELSE 0 END) as due,
                    COUNT(CASE WHEN started_at >= ? THEN 1 END) as today_new,
                    COUNT(CASE WHEN started_at IS NULL THEN 1 END) as st_new,
                    COUNT(CASE WHEN started_at IS NOT NULL AND interval < 5 THEN 1 END) as st_learning,
                    COUNT(CASE WHEN interval >= 5 AND interval < 30 THEN 1 END) as st_known,
                    COUNT(CASE WHEN interval >= 30 THEN 1 END) as st_mastered,
                    MIN(CASE WHEN started_at IS NOT NULL AND next_review > ? THEN next_review END) as next_due_at
                FROM words WHERE user_id = ? AND language = ?""",
            (
                now_utc.isoformat(),
                today_start_utc.isoformat(),
                now_utc.isoformat(),
                user_id,
                language,
            ),
        )
        row = await cursor.fetchone()

        defaults = {
            "total": 0,
            "learned": 0,
            "new": 0,
            "due": 0,
            "today_new": 0,
            "st_new": 0,
            "st_learning": 0,
            "st_known": 0,
            "st_mastered": 0,
            "next_due_at": None,
            "next_day_start_utc": next_day_start_utc.isoformat(),
        }
        if row:
            res = dict(row)
            for k, v in res.items():
                if v is None and k in defaults:
                    res[k] = defaults[k]
            res["next_day_start_utc"] = next_day_start_utc.isoformat()
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
    ):
        """Update the text, translation, example, or level of a word."""
        await self.db.execute(
            """UPDATE words SET word = ?, translation = ?, example = ?, level = ?
               WHERE id = ? AND user_id = ?""",
            (word, translation, example, level, word_id, user_id),
        )
        await self.db.commit()

    async def delete_all_words(self, user_id: int, language: str = None):
        """Delete all words for a user, optionally filtered by language."""
        if language:
            await self.db.execute(
                "DELETE FROM words WHERE user_id = ? AND language = ?",
                (user_id, language),
            )
        else:
            await self.db.execute("DELETE FROM words WHERE user_id = ?", (user_id,))
        await self.db.commit()

    async def delete_word(self, word_id: int, user_id: int):
        """Delete a specific word for a user."""
        await self.db.execute(
            "DELETE FROM words WHERE id = ? AND user_id = ?",
            (word_id, user_id),
        )
        await self.db.commit()

    async def search_words(self, user_id: int, language: str, query: str) -> list[dict]:
        """Search for words in the user's dictionary by word or translation."""
        q = f"%{query}%"
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level FROM words
                WHERE user_id = ? AND language = ?
                AND (word LIKE ? OR translation LIKE ?)
                ORDER BY word ASC LIMIT 100""",
            (user_id, language, q, q),
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

    async def decrement_daily_stat(self, user_id: int, language: str, is_new: bool, tz_name: str = "UTC"):
        """Decrement the daily learning/review count for a user."""
        tz = _safe_zoneinfo(tz_name, "UTC")
        local_now = datetime.now(tz=UTC).astimezone(tz)
        day_str = local_now.strftime("%Y-%m-%d")
        col = "new_count" if is_new else "review_count"
        await self.db.execute(
            f"""UPDATE daily_stats SET {col} = MAX(0, {col} - 1)
                WHERE user_id = ? AND language = ? AND day = ?""",
            (user_id, language, day_str),
        )
        await self.db.commit()

    async def increment_daily_stat(self, user_id: int, language: str, is_new: bool, tz_name: str = "UTC"):
        """Increment the daily learning/review count for a user."""
        tz = _safe_zoneinfo(tz_name, "UTC")
        local_now = datetime.now(tz=UTC).astimezone(tz)
        day_str = local_now.strftime("%Y-%m-%d")

        col = "new_count" if is_new else "review_count"
        await self.db.execute(
            f"""INSERT INTO daily_stats (user_id, language, day, {col})
                VALUES (?, ?, ?, 1)
                ON CONFLICT(user_id, language, day)
                DO UPDATE SET {col} = {col} + 1""",
            (user_id, language, day_str),
        )
        await self.db.commit()

    async def get_activity_heatmap(
        self, user_id: int, language: str, days: int = 91, tz_name: str = "UTC"
    ) -> list[dict]:
        """Get activity data for a heatmap visualization."""
        tz = _safe_zoneinfo(tz_name, "UTC")
        local_now = datetime.now(tz=UTC).astimezone(tz)
        cutoff_local = local_now - timedelta(days=days)
        cutoff_day = cutoff_local.strftime("%Y-%m-%d")

        cursor = await self.db.execute(
            """
            SELECT day, (new_count + review_count) as count
            FROM daily_stats
            WHERE user_id = ? AND language = ?
              AND day >= ?
            ORDER BY day ASC
            """,
            (user_id, language, cutoff_day),
        )
        rows = await cursor.fetchall()
        return [{"date": row["day"], "count": row["count"]} for row in rows]

    async def get_word_by_text(self, user_id: int, language: str, word: str) -> dict | None:
        """Retrieve a word by its term (case-insensitive)."""
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level FROM words
               WHERE user_id = ? AND language = ? AND LOWER(word) = LOWER(?)""",
            (user_id, language, word),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
