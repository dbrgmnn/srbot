import asyncio
import glob
import logging
import os
import sqlite3
import tarfile
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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


async def backup_db(db_path: str, backup_dir: str, max_backups: int = 3) -> str:
    """Create a consistent hot backup using sqlite3.backup() API. Returns archive path."""

    def _do_backup() -> str:
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now(tz=UTC).strftime("%Y%m%d_%H%M%S")
        sqlite_path = os.path.join(backup_dir, f"srbot_{timestamp}.sqlite")
        archive_path = os.path.join(backup_dir, f"srbot_{timestamp}.tar.gz")

        # sqlite3.backup() is the correct hot-backup API for WAL-mode databases
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(sqlite_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()

        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(sqlite_path, arcname="srbot.db")
        os.remove(sqlite_path)

        # Keep only the last max_backups archives
        archives = sorted(glob.glob(os.path.join(backup_dir, "srbot_*.tar.gz")))
        for old in archives[:-max_backups]:
            os.remove(old)
            logger.info("Rotated old backup: %s", old)

        return archive_path

    return await asyncio.to_thread(_do_backup)
