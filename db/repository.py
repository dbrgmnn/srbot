import aiosqlite
from datetime import datetime, timezone, timedelta


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

    async def set_last_notified_at(self, telegram_id: int):
        now = datetime.now(tz=timezone.utc).isoformat()
        await self.db.execute(
            """UPDATE user_settings SET last_notified_at = ?
               WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
               AND language = 'de'""",
            (now, telegram_id),
        )
        await self.db.commit()

    async def get_user_settings(self, telegram_id: int) -> dict:
        cursor = await self.db.execute(
            """SELECT s.* FROM user_settings s
                JOIN users u ON s.user_id = u.id
                WHERE u.telegram_id = ? AND s.language = ?""",
            (telegram_id, 'de'),
        )
        row = await cursor.fetchone()
        if row:
            data = dict(row)
            if data.get("practice_mode") is None:
                data["practice_mode"] = "word_to_translation"
            return data

        return {
            "quiet_start": "23:00",
            "quiet_end": "08:00",
            "daily_limit": 20,
            "notification_interval_minutes": 240,
            "language": "de",
            "practice_mode": "word_to_translation",
        }

    async def update_daily_limit(self, telegram_id: int, limit: int):
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row: return
        user_id = row['id']
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, daily_limit)
               VALUES (?, 'de', ?)
               ON CONFLICT(user_id, language) DO UPDATE SET daily_limit = ?""",
            (user_id, limit, limit),
        )
        await self.db.commit()

    async def update_notification_interval(self, telegram_id: int, minutes: int):
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row: return
        user_id = row['id']
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, notification_interval_minutes)
               VALUES (?, 'de', ?)
               ON CONFLICT(user_id, language) DO UPDATE SET notification_interval_minutes = ?""",
            (user_id, minutes, minutes),
        )
        await self.db.commit()

    async def update_quiet_hours(self, telegram_id: int, quiet_start: str = None, quiet_end: str = None):
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row: return
        user_id = row['id']
        if quiet_start is not None:
            await self.db.execute(
                "UPDATE user_settings SET quiet_start = ? WHERE user_id = ? AND language = 'de'",
                (quiet_start, user_id),
            )
        if quiet_end is not None:
            await self.db.execute(
                "UPDATE user_settings SET quiet_end = ? WHERE user_id = ? AND language = 'de'",
                (quiet_end, user_id),
            )
        await self.db.commit()

    async def update_practice_mode(self, telegram_id: int, mode: str):
        user_id_cur = await self.db.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await user_id_cur.fetchone()
        if not row:
            return
        user_id = row['id']
        await self.db.execute(
            """INSERT INTO user_settings (user_id, language, practice_mode)
               VALUES (?, 'de', ?)
               ON CONFLICT(user_id, language) DO UPDATE SET practice_mode = ?""",
            (user_id, mode, mode),
        )
        await self.db.commit()

    async def get_min_notification_interval(self) -> float:
        cursor = await self.db.execute(
            "SELECT MIN(notification_interval_minutes) as min_interval FROM user_settings"
        )
        row = await cursor.fetchone()
        return float(row['min_interval']) if (row and row['min_interval']) else 240.0

    async def get_users_with_due_words(self) -> list[dict]:
        now = datetime.now(tz=timezone.utc).isoformat()
        cursor = await self.db.execute(
            """SELECT u.id as user_id, u.telegram_id,
                        w.language,
                        s.quiet_start, s.quiet_end, s.daily_limit, s.notification_interval_minutes, s.last_notified_at,
                        SUM(CASE WHEN w.repetitions > 0 AND w.next_review <= ? THEN 1 ELSE 0 END) as due_count,
                        SUM(CASE WHEN w.repetitions = 0 THEN 1 ELSE 0 END) as new_count
                FROM users u
                JOIN words w ON w.user_id = u.id
                JOIN user_settings s ON s.user_id = u.id AND s.language = w.language
                GROUP BY u.id, w.language
                HAVING due_count > 0 OR new_count > 0""",
            (now,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


class WordRepo:
    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def add_words_batch(self, user_id: int, language: str, words: list[dict]) -> int:
        now = datetime.now(tz=timezone.utc).isoformat()
        data = [
            (user_id, w["word"], w["translation"], language, w.get("example"), now, now)
            for w in words
        ]
        cursor = await self.db.executemany(
            """INSERT OR IGNORE INTO words
                (user_id, word, translation, language, example, next_review, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
            data,
        )
        await self.db.commit()
        return cursor.rowcount

    async def get_session_words(self, user_id: int, language: str, new_limit: int) -> list[dict]:
        now = datetime.now(tz=timezone.utc).isoformat()
        cursor = await self.db.execute(
            """SELECT * FROM words
                WHERE user_id = ? AND language = ? AND repetitions > 0 AND next_review <= ?
                ORDER BY next_review ASC""",
            (user_id, language, now),
        )
        due = [dict(row) for row in await cursor.fetchall()]

        new_words = []
        if new_limit > 0:
            cursor = await self.db.execute(
                """SELECT * FROM words
                    WHERE user_id = ? AND language = ? AND repetitions = 0
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

    async def get_word_count(self, user_id: int, language: str = None) -> int:
        query = "SELECT COUNT(*) as count FROM words WHERE user_id = ?"
        params = [user_id]
        if language:
            query += " AND language = ?"
            params.append(language)
        cursor = await self.db.execute(query, tuple(params))
        row = await cursor.fetchone()
        return row['count'] if row else 0

    async def get_full_stats(self, user_id: int, language: str, tz_offset_minutes: int = 0) -> dict:
        now_utc = datetime.now(tz=timezone.utc)
        today_start_local = (now_utc + timedelta(minutes=tz_offset_minutes)).replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = (today_start_local - timedelta(minutes=tz_offset_minutes)).isoformat()

        cursor = await self.db.execute(
            """SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN repetitions > 0 THEN 1 ELSE 0 END) as learned,
                    SUM(CASE WHEN repetitions = 0 THEN 1 ELSE 0 END) as new,
                    SUM(CASE WHEN repetitions > 0 AND next_review <= ? THEN 1 ELSE 0 END) as due,
                    COUNT(CASE WHEN started_at >= ? THEN 1 END) as today_new,
                    COUNT(CASE WHEN repetitions = 0 THEN 1 END) as g_seeds,
                    COUNT(CASE WHEN repetitions > 0 AND interval < 5 THEN 1 END) as g_sprouts,
                    COUNT(CASE WHEN interval >= 5 AND interval < 30 THEN 1 END) as g_trees,
                    COUNT(CASE WHEN interval >= 30 THEN 1 END) as g_diamonds
                FROM words WHERE user_id = ? AND language = ?""",
            (now_utc.isoformat(), today_start_utc, user_id, language),
        )
        row = await cursor.fetchone()
        
        defaults = {
            "total": 0, "learned": 0, "new": 0, "due": 0, "today_new": 0,
            "g_seeds": 0, "g_sprouts": 0, "g_trees": 0, "g_diamonds": 0
        }
        if row:
            res = dict(row)
            for k, v in res.items():
                if v is None: res[k] = 0
            return res
        return defaults

    async def update_word_text(self, word_id: int, user_id: int, word: str, translation: str, example: str | None):
        await self.db.execute(
            """UPDATE words SET word = ?, translation = ?, example = ?
               WHERE id = ? AND user_id = ?""",
            (word, translation, example or None, word_id, user_id),
        )
        await self.db.commit()

    async def delete_all_words(self, user_id: int):
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
            """SELECT * FROM words
                WHERE user_id = ? AND language = ? AND (word LIKE ? OR translation LIKE ?)
                ORDER BY word ASC LIMIT 100""",
            (user_id, language, q, q),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_all_words(self, user_id: int, language: str) -> list[dict]:
        cursor = await self.db.execute(
            """SELECT word, translation, example
               FROM words
               WHERE user_id = ? AND language = ?
               ORDER BY word ASC""",
            (user_id, language),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
