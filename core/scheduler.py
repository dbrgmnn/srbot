import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import aiosqlite

from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from db.models import apply_pragmas
from db.repository import UserRepo, WordRepo, _safe_zoneinfo
from core.scheduler_utils import build_notification_text, is_quiet_time

logger = logging.getLogger(__name__)
async def check_and_send_notifications(bot: Bot, db_path: str, config):
    """Periodic job to check for due words and send notifications."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        await apply_pragmas(db)

        now = datetime.now(tz=timezone.utc)
        user_repo = UserRepo(db)
        word_repo = WordRepo(db)
        candidates = await user_repo.get_users_with_due_words()
        logger.info(f"[scheduler] tick — candidates: {len(candidates)}")

        for row in candidates:
            telegram_id = row["telegram_id"]
            user_tz_name = row.get("timezone", config.default_timezone)
            user_tz = _safe_zoneinfo(user_tz_name, config.default_timezone)

            # Get real stats to know due count and remaining daily quota
            stats = await word_repo.get_full_stats(row["user_id"], row["language"], tz_name=user_tz_name, fallback_tz=config.default_timezone)

            due_count = stats["due"]
            daily_remaining = max(0, row["daily_limit"] - stats["today_new"])
            new_to_show = min(stats["new"], daily_remaining)

            # Skip if nothing due and daily quota already reached
            if due_count == 0 and new_to_show == 0:
                continue

            logger.info(f"[scheduler] checking {telegram_id} ({row['language']}) — due={due_count} new_left={new_to_show}")

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


async def reschedule(scheduler: AsyncIOScheduler, db: aiosqlite.Connection, config=None):
    """Read minimum interval across all users and reschedule the job."""
    user_repo = UserRepo(db)
    interval = await user_repo.get_min_notification_interval(config)
    scheduler.reschedule_job(JOB_ID, trigger=IntervalTrigger(minutes=interval))
    logger.info(f"Scheduler rescheduled — interval: {interval} min")


async def setup_scheduler(bot: Bot, db: aiosqlite.Connection, config) -> AsyncIOScheduler:
    """Initialize the APScheduler and add the notification job."""
    scheduler = AsyncIOScheduler(timezone=timezone.utc)
    user_repo = UserRepo(db)
    interval = await user_repo.get_min_notification_interval(config)
    scheduler.add_job(
        check_and_send_notifications,
        trigger=IntervalTrigger(minutes=interval),
        kwargs={"bot": bot, "db_path": config.db_path, "config": config},
        id=JOB_ID,
        replace_existing=True,
    )
    return scheduler
