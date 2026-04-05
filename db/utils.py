import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import aiosqlite

logger = logging.getLogger(__name__)


def _safe_zoneinfo(tz_name: str, fallback: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        logger.warning(f"Invalid timezone '{tz_name}', falling back to '{fallback}'")
        return ZoneInfo(fallback)


async def backup_db(db_path: str, backup_path: str):
    """
    Create a consistent backup of the SQLite database using VACUUM INTO.
    This method is safe to call while the bot is running.
    """
    async with aiosqlite.connect(db_path) as db:
        await db.execute(f"VACUUM INTO '{backup_path}'")
        await db.commit()
