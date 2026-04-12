import logging
import secrets
from datetime import UTC, datetime
from typing import Any

import aiosqlite

from config import Config
from db.utils import safe_zoneinfo, today_start_utc

logger = logging.getLogger(__name__)

_ALLOWED_SETTINGS_FIELDS = frozenset(
    {
        "timezone",
        "daily_limit",
        "notification_interval_minutes",
        "practice_mode",
        "quiet_start",
        "quiet_end",
    }
)


def _default_limit_and_interval(config: Config | None) -> tuple[int, int]:
    default_limit = config.max_daily_limit // 2 if config else 20
    default_interval = config.max_notify_interval // 2 if config else 240
    return default_limit, default_interval


def _default_settings(language: str, config: Config | None) -> dict:
    default_limit, default_interval = _default_limit_and_interval(config)
    return {
        "quiet_start": "23:00",
        "quiet_end": "08:00",
        "daily_limit": default_limit,
        "notification_interval_minutes": default_interval,
        "language": language,
        "practice_mode": "word_to_translation",
        "timezone": "UTC",
    }


class UserRepo:
    """Repository for managing user-related data and settings."""

    def __init__(self, db: aiosqlite.Connection):
        """Initialize the UserRepo with a database connection."""
        self.db = db

    async def get_or_create(self, telegram_id: int, language: str, tz_name: str, config: Config | None = None) -> int:
        """Get an existing user's ID or create a new user record with default settings."""
        await self.db.execute(
            "INSERT INTO users (telegram_id) VALUES (?) ON CONFLICT(telegram_id) DO NOTHING",
            (telegram_id,),
        )

        cursor = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await cursor.fetchone()
        if not row:
            raise RuntimeError(f"Failed to create or fetch user for telegram_id={telegram_id}")
        user_id = row["id"]

        # Initialize settings
        await self._create_settings(user_id, language, tz_name, config)
        await self.db.commit()
        logger.info("User %d (telegram: %d) created/verified in %s", user_id, telegram_id, language)
        return user_id

    async def _create_settings(self, user_id: int, language: str, tz_name: str, config: Config | None = None) -> None:
        """Create default settings for a user and language if they don't exist."""
        limit, interval = _default_limit_and_interval(config)

        cursor = await self.db.execute(
            """INSERT OR IGNORE INTO user_settings
               (user_id, language, timezone, daily_limit, notification_interval_minutes)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, language, tz_name, limit, interval),
        )
        if cursor.rowcount > 0:
            logger.info("Created settings for user %d in %s", user_id, language)

    async def set_last_notified_at(self, telegram_id: int, language: str) -> None:
        """Update the timestamp of the last notification sent to the user."""
        now = datetime.now(tz=UTC).isoformat()
        await self.db.execute(
            """UPDATE user_settings SET last_notified_at = ?
               WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
               AND language = ?""",
            (now, telegram_id, language),
        )
        await self.db.commit()
        logger.debug("Updated last_notified_at for user %d in %s", telegram_id, language)

    async def get_user_settings(self, telegram_id: int, language: str, config: Config | None = None) -> dict:
        """Retrieve user settings for a specific language, with defaults if not found."""
        cursor = await self.db.execute(
            """SELECT s.* FROM user_settings s
                JOIN users u ON s.user_id = u.id
                WHERE u.telegram_id = ? AND s.language = ?""",
            (telegram_id, language),
        )
        row = await cursor.fetchone()

        defaults = _default_settings(language, config)

        if row:
            data = dict(row)
            return {**defaults, **{k: v for k, v in data.items() if v is not None}}

        return defaults

    async def _update_setting(self, field: str, value: Any, telegram_id: int, language: str) -> None:
        """Generic method to update a single user setting field."""
        if field not in _ALLOWED_SETTINGS_FIELDS:
            raise ValueError(f"Invalid settings field: {field!r}")
        await self.db.execute(
            f"""INSERT INTO user_settings (user_id, language, {field})
               VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?)
               ON CONFLICT(user_id, language) DO UPDATE SET {field} = excluded.{field}""",
            (telegram_id, language, value),
        )
        await self.db.commit()
        logger.info("Updated setting '%s' to '%s' for telegram_id %d in %s", field, value, telegram_id, language)

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
        self, telegram_id: int, language: str, quiet_start: str | None = None, quiet_end: str | None = None
    ) -> None:
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
        logger.info(
            "Updated quiet hours for user %d in %s: start=%s, end=%s", telegram_id, language, quiet_start, quiet_end
        )

    async def update_practice_mode(self, telegram_id: int, mode: str, language: str):
        """Update the practice mode for a specific language."""
        await self._update_setting("practice_mode", mode, telegram_id, language)

    async def update_language(self, telegram_id: int, new_language: str, config: Config | None = None) -> None:
        """Initialize settings for a new language for the user."""
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row:
            return
        await self._create_settings(row["id"], new_language, "UTC", config)
        await self.db.commit()

    async def get_min_notification_interval(self, config: Config | None = None) -> float:
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
        logger.info("Generated new API token for user %d", telegram_id)
        return new_token

    async def get_user_by_token(self, token: str) -> tuple[int, int] | None:
        """Find a user by their API token."""
        cursor = await self.db.execute("SELECT id, telegram_id FROM users WHERE api_token = ?", (token,))
        row = await cursor.fetchone()
        return (row["id"], row["telegram_id"]) if row else None

    async def get_words_count_per_language(self, user_id: int) -> dict[str, int]:
        """Get the number of words learned by a user per language."""
        cursor = await self.db.execute(
            "SELECT language, COUNT(*) as cnt FROM words WHERE user_id = ? GROUP BY language",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return {row["language"]: row["cnt"] for row in rows}

    async def get_today_new_count(self, user_id: int, language: str, tz_name: str = "UTC") -> int:
        """Count how many new words the user has started learning today."""
        start = today_start_utc(tz_name)
        cursor = await self.db.execute(
            "SELECT COUNT(*) as cnt FROM words WHERE user_id = ? AND language = ? AND started_at >= ?",
            (user_id, language, start.isoformat()),
        )
        row = await cursor.fetchone()
        return int(row["cnt"]) if row else 0

    async def get_users_with_due_words(self, default_tz: str = "UTC") -> list[dict]:
        """Find users who have words due for review or new words available, with aggregated stats."""
        now = datetime.now(tz=UTC)
        now_iso = now.isoformat()

        cursor = await self.db.execute(
            """SELECT u.id as user_id, u.telegram_id,
                        s.language,
                        s.quiet_start, s.quiet_end, s.daily_limit, s.timezone,
                        s.notification_interval_minutes, s.last_notified_at,
                        COUNT(CASE WHEN w.started_at IS NOT NULL AND w.next_review <= ? THEN 1 END) as due_count,
                        COUNT(CASE WHEN w.started_at IS NULL THEN 1 END) as new_count
                FROM users u
                JOIN user_settings s ON s.user_id = u.id
                JOIN words w ON w.user_id = u.id AND w.language = s.language
                GROUP BY u.id, s.language
                HAVING due_count > 0 OR new_count > 0""",
            (now_iso,),
        )
        rows = await cursor.fetchall()
        candidates = [dict(row) for row in rows]

        if not candidates:
            return []

        tz_groups = {}
        for c in candidates:
            tz_name = c.get("timezone") or default_tz
            tz_groups.setdefault(tz_name, []).append(c)

        for tz_name, group in tz_groups.items():
            tz_info = safe_zoneinfo(tz_name, default_tz)
            local_now = now.astimezone(tz_info)
            today_start_str = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC).isoformat()

            chunk_size = 400
            for i in range(0, len(group), chunk_size):
                chunk = group[i : i + chunk_size]
                conditions = " OR ".join(["(user_id = ? AND language = ?)"] * len(chunk))
                params = [today_start_str]
                for c in chunk:
                    params.extend([c["user_id"], c["language"]])

                query = f"""SELECT user_id, language, COUNT(*) as today_new
                            FROM words
                            WHERE started_at >= ? AND ({conditions})
                            GROUP BY user_id, language"""

                cur = await self.db.execute(query, params)
                today_counts = {(r["user_id"], r["language"]): r["today_new"] for r in await cur.fetchall()}

                for c in chunk:
                    c["today_new"] = today_counts.get((c["user_id"], c["language"]), 0)

        return candidates
