import aiosqlite


async def init_db(db_path: str = "srbot.db") -> aiosqlite.Connection:
    # creates tables on first run and returns connection
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    
    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id INTEGER UNIQUE NOT NULL,
            created_at TEXT DEFAULT (date('now'))
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER NOT NULL,
            language TEXT NOT NULL,
            quiet_start TEXT DEFAULT '23:00',
            quiet_end TEXT DEFAULT '08:00',
            daily_limit INTEGER DEFAULT 20,
            notification_interval_minutes INTEGER DEFAULT 240,
            last_notified_at TEXT DEFAULT NULL,
            practice_mode TEXT DEFAULT 'word_to_translation',
            PRIMARY KEY (user_id, language),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            word TEXT NOT NULL,
            translation TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'de',
            example TEXT,
            repetitions INTEGER DEFAULT 0,
            easiness REAL DEFAULT 2.5,
            interval INTEGER DEFAULT 1,
            next_review TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, word, translation, language)
        )
    """)

    # indexes for common queries
    await db.execute("CREATE INDEX IF NOT EXISTS idx_words_user_lang_review ON words (user_id, language, next_review)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_words_user_lang_rep ON words (user_id, language, repetitions)")

    await db.commit()
    return db
