import aiosqlite


async def apply_pragmas(db: aiosqlite.Connection):
    # WAL mode + NORMAL sync — must be applied to every new connection
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA synchronous=NORMAL")


async def init_db(db_path: str = "srbot.db") -> aiosqlite.Connection:
    # creates tables on first run and returns connection
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    await apply_pragmas(db)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id INTEGER UNIQUE NOT NULL,
            api_token TEXT,
            created_at TEXT DEFAULT (date('now'))
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER NOT NULL,
            language TEXT NOT NULL,
            quiet_start TEXT NOT NULL DEFAULT '23:00',
            quiet_end TEXT NOT NULL DEFAULT '08:00',
            daily_limit INTEGER NOT NULL,
            notification_interval_minutes INTEGER NOT NULL,
            last_notified_at TEXT DEFAULT NULL,
            practice_mode TEXT NOT NULL DEFAULT 'word_to_translation',
            timezone TEXT NOT NULL,
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
            language TEXT NOT NULL,
            example TEXT,
            level TEXT,
            repetitions INTEGER DEFAULT 0,
            easiness REAL DEFAULT 2.5,
            interval INTEGER DEFAULT 1,
            next_review TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_reviewed_at DATETIME,
            started_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, word, translation, language)
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS daily_stats (
            user_id INTEGER NOT NULL,
            language TEXT NOT NULL,
            day TEXT NOT NULL,
            new_count INTEGER DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, language, day),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # indexes for common queries
    await db.execute("CREATE INDEX IF NOT EXISTS idx_words_user_lang_review ON words (user_id, language, next_review)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_words_user_lang_rep ON words (user_id, language, repetitions)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_words_user_lang ON words (user_id, language)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_words_started_at ON words (user_id, started_at)")

    await db.commit()
    return db
