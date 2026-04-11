import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import aiosqlite

logger = logging.getLogger(__name__)


def safe_zoneinfo(tz_name: str, fallback: str) -> ZoneInfo:
    """Return a ZoneInfo for tz_name, falling back to fallback on invalid input."""
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        logger.warning("Invalid timezone '%s', falling back to '%s'", tz_name, fallback)
        return ZoneInfo(fallback)


def today_start_utc(tz_name: str, fallback: str = "UTC") -> datetime:
    """Return the start of today (00:00:00) in UTC, calculated from the given timezone."""
    tz = safe_zoneinfo(tz_name, fallback)
    local_now = datetime.now(tz=UTC).astimezone(tz)
    return local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)


async def backup_db(db_path: str, backup_path: str):
    """
    Create a consistent backup of the SQLite database using VACUUM INTO.
    This method is safe to call while the bot is running.
    """
    async with aiosqlite.connect(db_path) as db:
        await db.execute(f"VACUUM INTO '{backup_path}'")
        await db.commit()
