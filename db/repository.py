import csv
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import aiosqlite


class UserRepo:
    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def get_or_create(self, telegram_id: int) -> int:
        cursor = await self.db.execute(
            "SELECT id FROM users WHERE telegram_id = ?", (telegram_id,)
        )
        row = await cursor.fetchone()
        if row:
            return row['id']

        await self.db.execute(
            "INSERT OR IGNORE INTO users (telegram_id) VALUES (?)", (telegram_id,)
        )
        cursor = await self.db.execute(
            "SELECT id FROM users WHERE telegram_id = ?", (telegram_id,)
        )
        row = await cursor.fetchone()
        user_id = row['id']

        await self.db.execute(
            "INSERT OR IGNORE INTO user_settings (user_id, language) VALUES (?, ?)",
            (user_id, 'de')
        )

        await self.db.commit()
        return user_id

    async def set_last_notified_at(self, telegram_id: int, language: str = 'de'):
        now = datetime.now(tz=timezone.utc).isoformat()
        await self.db.execute(
            """UPDATE user_settings SET last_notified_at = ?
               WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
               AND language = ?""",
            (now, telegram_id, language),
        )
        await self.db.commit()

    async def get_user_settings(self, telegram_id: int, language: str = 'de') -> dict:
        cursor = await self.db.execute(
            """SELECT s.* FROM user_settings s
                JOIN users u ON s.user_id = u.id
                WHERE u.telegram_id = ? AND s.language = ?""",
            (telegram_id, language),
        )
        row = await cursor.fetchone()
        
        defaults = {
            "quiet_start": "23:00",
            "quiet_end": "08:00",
            "daily_limit": 20,
            "notification_interval_minutes": 30,
            "language": language,
            "practice_mode": "word_to_translation",
            "timezone": "Europe/Berlin",
        }

        if row:
            data = dict(row)
            for k, v in defaults.items():
                if data.get(k) is None:
                    data[k] = v
            return data

        return defaults

    async def update_timezone(self, telegram_id: int, tz_name: str, language: str = 'de'):
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, timezone)
               VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?)
               ON CONFLICT(user_id, language) DO UPDATE SET timezone = ?""",
            (telegram_id, language, tz_name, tz_name),
        )
        await self.db.commit()

    async def update_daily_limit(self, telegram_id: int, limit: int, language: str = 'de'):
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, daily_limit)
               VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?)
               ON CONFLICT(user_id, language) DO UPDATE SET daily_limit = ?""",
            (telegram_id, language, limit, limit),
        )
        await self.db.commit()

    async def update_notification_interval(self, telegram_id: int, minutes: int, language: str = 'de'):
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, notification_interval_minutes)
               VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?)
               ON CONFLICT(user_id, language) DO UPDATE SET notification_interval_minutes = ?""",
            (telegram_id, language, minutes, minutes),
        )
        await self.db.commit()

    async def update_quiet_hours(self, telegram_id: int, quiet_start: str = None, quiet_end: str = None, language: str = 'de'):
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row: return
        user_id = row['id']
        if quiet_start is not None:
            await self.db.execute(
                "UPDATE user_settings SET quiet_start = ? WHERE user_id = ? AND language = ?",
                (quiet_start, user_id, language),
            )
        if quiet_end is not None:
            await self.db.execute(
                "UPDATE user_settings SET quiet_end = ? WHERE user_id = ? AND language = ?",
                (quiet_end, user_id, language),
            )
        await self.db.commit()

    async def update_practice_mode(self, telegram_id: int, mode: str, language: str = 'de'):
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, practice_mode)
               VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?)
               ON CONFLICT(user_id, language) DO UPDATE SET practice_mode = ?""",
            (telegram_id, language, mode, mode),
        )
        await self.db.commit()

    async def update_language(self, telegram_id: int, new_language: str):
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row: return
        user_id = row['id']
        await self.db.execute(
            "INSERT OR IGNORE INTO user_settings (user_id, language) VALUES (?, ?)",
            (user_id, new_language)
        )
        await self.db.commit()

    async def get_min_notification_interval(self) -> float:
        cursor = await self.db.execute(
            "SELECT MIN(notification_interval_minutes) as min_interval FROM user_settings"
        )
        row = await cursor.fetchone()
        return float(row['min_interval']) if (row and row['min_interval']) else 30.0

    async def get_api_token(self, telegram_id: int) -> str | None:
        cursor = await self.db.execute(
            "SELECT api_token FROM users WHERE telegram_id = ?", (telegram_id,)
        )
        row = await cursor.fetchone()
        return row['api_token'] if row else None

    async def generate_api_token(self, telegram_id: int) -> str:
        new_token = secrets.token_hex(16)
        await self.db.execute(
            "UPDATE users SET api_token = ? WHERE telegram_id = ?",
            (new_token, telegram_id)
        )
        await self.db.commit()
        return new_token

    async def get_user_id_by_token(self, token: str) -> int | None:
        cursor = await self.db.execute(
            "SELECT id FROM users WHERE api_token = ?", (token,)
        )
        row = await cursor.fetchone()
        return row['id'] if row else None

    async def get_users_with_due_words(self) -> list[dict]:
        now_utc = datetime.now(tz=timezone.utc).isoformat()

        cursor = await self.db.execute(
            """SELECT u.id as user_id, u.telegram_id,
                        w.language,
                        s.quiet_start, s.quiet_end, s.daily_limit, s.notification_interval_minutes, s.last_notified_at, s.timezone,
                        SUM(CASE WHEN w.started_at IS NOT NULL AND w.next_review <= ? THEN 1 ELSE 0 END) as due_count,
                        SUM(CASE WHEN w.started_at IS NULL THEN 1 ELSE 0 END) as new_count
                FROM users u
                JOIN words w ON w.user_id = u.id
                JOIN user_settings s ON s.user_id = u.id AND s.language = w.language
                GROUP BY u.id, w.language
                HAVING due_count > 0 OR new_count > 0""",
            (now_utc,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


class WordRepo:
    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    @staticmethod
    def load_csv_words(path: Path) -> list[dict]:
        words = []
        if not path.exists():
            return []
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                word = (row.get("term") or "").strip()
                translation = (row.get("translation") or "").strip()
                if not word or not translation:
                    continue
                words.append({
                    "word": word,
                    "translation": translation,
                    "example": (row.get("example") or "").strip() or None,
                    "level": (row.get("level") or "").strip() or None,
                })
        return words

    async def add_words_batch(self, user_id: int, language: str, words: list[dict]) -> int:
        now = datetime.now(tz=timezone.utc).isoformat()
        data = [
            (user_id, w["word"], w["translation"], language, w.get("example"), w.get("level"), now, now)
            for w in words
        ]
        cursor = await self.db.executemany(
            """INSERT OR IGNORE INTO words
                (user_id, word, translation, language, example, level, next_review, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            data,
        )
        await self.db.commit()
        return cursor.rowcount

    async def get_session_words(self, user_id: int, language: str, new_limit: int) -> list[dict]:
        now = datetime.now(tz=timezone.utc).isoformat()
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level, repetitions FROM words
                WHERE user_id = ? AND language = ? AND started_at IS NOT NULL AND next_review <= ?
                ORDER BY next_review ASC""",
            (user_id, language, now),
        )
        due = [dict(row) for row in await cursor.fetchall()]

        new_words = []
        if new_limit > 0:
            cursor = await self.db.execute(
                """SELECT id, word, translation, example, level, repetitions FROM words
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
        now = datetime.now(tz=timezone.utc).isoformat()
        await self.db.execute(
            """UPDATE words
                SET repetitions = ?, easiness = ?, interval = ?, next_review = ?, 
                    last_reviewed_at = ?,
                    started_at = COALESCE(started_at, ?)
                WHERE id = ?""",
            (repetitions, easiness, interval, next_review.isoformat(), now, now, word_id),
        )
        await self.db.commit()

    async def get_full_stats(self, user_id: int, language: str, tz_name: str = "UTC") -> dict:
        now_utc = datetime.now(tz=timezone.utc)
        tz = ZoneInfo(tz_name)
        local_now = now_utc.astimezone(tz)
        today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_start_local.astimezone(timezone.utc)
        next_day_start_utc = (today_start_local + timedelta(days=1)).astimezone(timezone.utc)

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
            (now_utc.isoformat(), today_start_utc.isoformat(), now_utc.isoformat(), user_id, language),
        )
        row = await cursor.fetchone()
        
        defaults = {
            "total": 0, "learned": 0, "new": 0, "due": 0, "today_new": 0,
            "st_new": 0, "st_learning": 0, "st_known": 0, "st_mastered": 0,
            "next_due_at": None, "next_day_start_utc": next_day_start_utc.isoformat()
        }
        if row:
            res = dict(row)
            for k, v in res.items():
                if v is None and k in defaults: res[k] = defaults[k]
            res["next_day_start_utc"] = next_day_start_utc.isoformat()
            return res
        return defaults

    async def update_word_text(self, word_id: int, user_id: int, word: str, translation: str, example: str | None, level: str | None):
        await self.db.execute(
            """UPDATE words SET word = ?, translation = ?, example = ?, level = ?
               WHERE id = ? AND user_id = ?""",
            (word, translation, example or None, level or None, word_id, user_id),
        )
        await self.db.commit()

    async def delete_all_words(self, user_id: int, language: str = None):
        if language:
            await self.db.execute(
                "DELETE FROM words WHERE user_id = ? AND language = ?",
                (user_id, language),
            )
        else:
            await self.db.execute("DELETE FROM words WHERE user_id = ?", (user_id,))
        await self.db.commit()

    async def delete_word(self, word_id: int, user_id: int):
        await self.db.execute(
            "DELETE FROM words WHERE id = ? AND user_id = ?",
            (word_id, user_id),
        )
        await self.db.commit()

    async def search_words(self, user_id: int, language: str, query: str) -> list[dict]:
        q = f"%{query}%"
        cursor = await self.db.execute(
            """SELECT id, word, translation, example, level FROM words
                WHERE user_id = ? AND language = ? AND (word LIKE ? OR translation LIKE ?)
                ORDER BY word ASC LIMIT 100""",
            (user_id, language, q, q),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_all_words(self, user_id: int, language: str) -> list[dict]:
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
        cursor = await self.db.execute(
            "SELECT * FROM words WHERE id = ? AND user_id = ?",
            (word_id, user_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
