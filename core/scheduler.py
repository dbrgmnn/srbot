import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import aiosqlite

from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from db.repository import UserRepo

logger = logging.getLogger(__name__)

JOB_ID = "check_notifications"


# ── Notification texts ────────────────────────────────────────────────────

LANG_FLAGS = {
    'de': '🇩🇪',
    'en': '🇬🇧',
}

def build_notification_text(due: int, new: int, lang: str) -> str:
    parts = []
    if due > 0:
        parts.append(f"{due} to review")
    if new > 0:
        parts.append(f"{new} new words")
    
    flag = LANG_FLAGS.get(lang.lower(), "🌐")
    return f"{flag} " + " · ".join(parts)


# ── Quiet hours ───────────────────────────────────────────────────────────

def is_quiet_time(now: datetime, quiet_start: str, quiet_end: str, tz: ZoneInfo) -> bool:
    local = now.astimezone(tz)
    current = local.hour * 60 + local.minute

    sh, sm = map(int, quiet_start.split(":"))
    eh, em = map(int, quiet_end.split(":"))
    start = sh * 60 + sm
    end = eh * 60 + em

    if start > end:
        return current >= start or current < end
    return start <= current < end


# ── Main job ──────────────────────────────────────────────────────────────

async def check_and_send_notifications(bot: Bot, db: aiosqlite.Connection):
    now = datetime.now(tz=timezone.utc)
    user_repo = UserRepo(db)
    # We use UTC here as threshold, timezone logic is handled per candidate
    candidates = await user_repo.get_users_with_due_words(tz_name="UTC")
    logger.info(f"[scheduler] tick — candidates: {len(candidates)}")

    for row in candidates:
        telegram_id = row["telegram_id"]
        user_tz = ZoneInfo(row.get("timezone", "Europe/Berlin"))
        
        due_count = row["due_count"]
        # Calculate how many new words are actually left for today's goal
        daily_remaining = max(0, row["daily_limit"] - row["today_done"])
        new_to_show = min(row["new_count"], daily_remaining)

        # If nothing to review and goal is already reached, skip this user
        if due_count == 0 and new_to_show == 0:
            continue

        logger.info(f"[scheduler] checking {telegram_id} — due={due_count} new_left={new_to_show} interval={row['notification_interval_minutes']}")

        if is_quiet_time(now, row["quiet_start"], row["quiet_end"], user_tz):
            logger.info(f"[scheduler] {telegram_id} — quiet time, skip")
            continue

        last_notified_raw = row["last_notified_at"]
        if last_notified_raw:
            try:
                last_notified = datetime.fromisoformat(last_notified_raw)
                elapsed = (now - last_notified).total_seconds() / 60
                if elapsed < row["notification_interval_minutes"] - 0.1:
                    continue
            except ValueError:
                pass

        text = build_notification_text(due_count, new_to_show, row["language"])

        try:
            await bot.send_message(chat_id=telegram_id, text=text)
            await user_repo.set_last_notified_at(telegram_id, language=row["language"])
            logger.info(f"[scheduler] Notified {telegram_id} ({row['language']}): {text!r}")
        except Exception as e:
            logger.warning(f"[scheduler] Notification failed for {telegram_id}: {e}")


# ── Reschedule ────────────────────────────────────────────────────────────

async def reschedule(scheduler: AsyncIOScheduler, db: aiosqlite.Connection):
    # reads minimum interval across all users and reschedules the job
    user_repo = UserRepo(db)
    interval = await user_repo.get_min_notification_interval()
    scheduler.reschedule_job(JOB_ID, trigger=IntervalTrigger(minutes=interval))
    logger.info(f"Scheduler rescheduled — interval: {interval} min")


# ── Setup ─────────────────────────────────────────────────────────────────

async def setup_scheduler(bot: Bot, db: aiosqlite.Connection) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=timezone.utc)
    user_repo = UserRepo(db)
    interval = await user_repo.get_min_notification_interval()
    scheduler.add_job(
        check_and_send_notifications,
        trigger=IntervalTrigger(minutes=interval),
        kwargs={"bot": bot, "db": db},
        id=JOB_ID,
        replace_existing=True,
    )
    return scheduler
