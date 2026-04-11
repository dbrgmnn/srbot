import asyncio
import logging
from datetime import UTC, datetime

import aiosqlite
from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from core.scheduler_utils import build_notification_text, is_quiet_time
from db import UserRepo
from db.models import apply_pragmas
from db.utils import safe_zoneinfo

logger = logging.getLogger(__name__)

JOB_ID = "check_notifications"


async def check_and_send_notifications(bot: Bot, db_path: str, config):
    """Periodic job to check for due words and send notifications."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        await apply_pragmas(db)

        now = datetime.now(tz=UTC)
        user_repo = UserRepo(db)
        candidates = await user_repo.get_users_with_due_words(default_tz=config.default_timezone)
        logger.info("[scheduler] tick — candidates: %d", len(candidates))

        sem = asyncio.Semaphore(20)

        async def _process_user(row):
            async with sem:
                telegram_id = row["telegram_id"]
                user_tz_name = row.get("timezone", config.default_timezone)
                user_tz = safe_zoneinfo(user_tz_name, config.default_timezone)

                due_count = row.get("due_count", 0)
                new_count = row.get("new_count", 0)
                today_new = row.get("today_new", 0)

                daily_remaining = max(0, row["daily_limit"] - today_new)
                new_to_show = min(new_count, daily_remaining)

                if due_count == 0 and new_to_show == 0:
                    return

                logger.info(
                    "[scheduler] checking %d (%s) — due=%d new_left=%d",
                    telegram_id,
                    row["language"],
                    due_count,
                    new_to_show,
                )

                if is_quiet_time(now, row["quiet_start"], row["quiet_end"], user_tz):
                    logger.info("[scheduler] %d — quiet time, skip", telegram_id)
                    return

                last_notified_raw = row["last_notified_at"]
                if last_notified_raw:
                    try:
                        last_notified = datetime.fromisoformat(last_notified_raw)
                        elapsed = (now - last_notified).total_seconds() / 60
                        if elapsed < row["notification_interval_minutes"] - 0.1:
                            return
                    except ValueError:
                        pass

                text = build_notification_text(due_count, new_to_show, row["language"])

                try:
                    await bot.send_message(chat_id=telegram_id, text=text)
                    await user_repo.set_last_notified_at(telegram_id, language=row["language"])
                    logger.info("[scheduler] Notified %d (%s): %r", telegram_id, row["language"], text)
                except Exception as e:
                    logger.warning("[scheduler] Notification failed for %d: %s", telegram_id, e)

        tasks = [_process_user(row) for row in candidates]
        if tasks:
            await asyncio.gather(*tasks)


async def reschedule(scheduler: AsyncIOScheduler, db: aiosqlite.Connection, config=None):
    """Reschedule the notification job with current minimum interval."""
    user_repo = UserRepo(db)
    interval = await user_repo.get_min_notification_interval(config)
    scheduler.reschedule_job(JOB_ID, trigger=IntervalTrigger(minutes=interval))
    logger.info("Scheduler rescheduled — interval: %s min", interval)


async def setup_scheduler(bot: Bot, db: aiosqlite.Connection, config) -> AsyncIOScheduler:
    """Initialize APScheduler and add notification job."""
    scheduler = AsyncIOScheduler(timezone=UTC)
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
