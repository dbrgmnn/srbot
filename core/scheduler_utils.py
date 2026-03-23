from datetime import datetime
from zoneinfo import ZoneInfo
from core.languages import LANGUAGES

def build_notification_text(due: int, new: int, lang: str) -> str:
    """Build the text for the notification message."""
    parts = []
    if due > 0:
        parts.append(f"{due} review")
    if new > 0:
        parts.append(f"{new} new")
    
    meta = LANGUAGES.get(lang.lower(), {})
    flag = meta.get("flag", "🌐")
    return f"{flag} " + " · ".join(parts)


def is_quiet_time(now: datetime, quiet_start: str, quiet_end: str, tz: ZoneInfo) -> bool:
    """Check if the current time falls within the user's quiet hours."""
    local = now.astimezone(tz)
    current = local.hour * 60 + local.minute

    sh, sm = map(int, quiet_start.split(":"))
    eh, em = map(int, quiet_end.split(":"))
    start = sh * 60 + sm
    end = eh * 60 + em

    if start > end:
        return current >= start or current < end
    return start <= current < end
