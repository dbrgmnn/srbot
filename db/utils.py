import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)


def _safe_zoneinfo(tz_name: str, fallback: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        logger.warning(f"Invalid timezone '{tz_name}', falling back to '{fallback}'")
        return ZoneInfo(fallback)
