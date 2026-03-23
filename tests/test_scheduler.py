from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from core.scheduler_utils import build_notification_text, is_quiet_time


def test_build_notification_text_both():
    """Text should contain both review and new counts with flag."""
    text = build_notification_text(due=5, new=3, lang="de")
    assert "🇩🇪" in text
    assert "5 review" in text
    assert "3 new" in text
    assert "·" in text


def test_build_notification_text_only_due():
    text = build_notification_text(due=10, new=0, lang="en")
    assert "🇬🇧" in text
    assert "10 review" in text
    assert "new" not in text


def test_is_quiet_time_simple_range():
    """Test quiet hours that don't cross midnight."""
    tz = ZoneInfo("UTC")
    q_start = "14:00"
    q_end = "16:00"

    # 15:00 is inside
    dt_inside = datetime(2024, 1, 1, 15, 0, tzinfo=UTC)
    assert is_quiet_time(dt_inside, q_start, q_end, tz) is True

    # 13:00 is outside
    dt_outside = datetime(2024, 1, 1, 13, 0, tzinfo=UTC)
    assert is_quiet_time(dt_outside, q_start, q_end, tz) is False


def test_is_quiet_time_crossing_midnight():
    """Test quiet hours that cross midnight (typical case: 23:00-08:00)."""
    tz = ZoneInfo("UTC")
    q_start = "23:00"
    q_end = "08:00"

    # 01:00 is inside
    dt_inside = datetime(2024, 1, 1, 1, 0, tzinfo=UTC)
    assert is_quiet_time(dt_inside, q_start, q_end, tz) is True

    # 23:30 is inside
    dt_inside_late = datetime(2024, 1, 1, 23, 30, tzinfo=UTC)
    assert is_quiet_time(dt_inside_late, q_start, q_end, tz) is True

    # 12:00 is outside
    dt_outside = datetime(2024, 1, 1, 12, 0, tzinfo=UTC)
    assert is_quiet_time(dt_outside, q_start, q_end, tz) is False


def test_is_quiet_time_different_timezone():
    """Test that it correctly handles user's local time based on their timezone."""
    # User is in Tokyo (UTC+9)
    tz_tokyo = ZoneInfo("Asia/Tokyo")
    q_start = "23:00"
    q_end = "08:00"

    # Server time is 15:00 UTC
    # Tokyo time will be 00:00 (15 + 9) -> Should be QUIET
    dt_utc = datetime(2024, 1, 1, 15, 0, tzinfo=UTC)
    assert is_quiet_time(dt_utc, q_start, q_end, tz_tokyo) is True

    # Server time is 03:00 UTC
    # Tokyo time will be 12:00 (3 + 9) -> Should NOT be quiet
    dt_utc_day = datetime(2024, 1, 1, 3, 0, tzinfo=UTC)
    assert is_quiet_time(dt_utc_day, q_start, q_end, tz_tokyo) is False
