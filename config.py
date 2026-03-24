"""
Configuration management for the SRBot application.
Handles environment variables and application-wide settings.
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    """Application configuration container."""

    bot_token: str
    webapp_url: str
    allowed_users: list[int]
    db_path: str
    api_port: int
    gemini_api_key: str | None = None
    gemini_model: str
    token_expiry: int = 3600
    min_daily_limit: int = 5
    max_daily_limit: int = 50
    min_notify_interval: int = 10
    max_notify_interval: int = 480
    default_lang: str = "en"
    default_timezone: str = "UTC"


def load_config() -> Config:
    """Load configuration from environment variables."""
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise ValueError("BOT_TOKEN environment variable is not set")

    allowed_raw = os.getenv("ALLOWED_USERS", "")
    allowed_users = [int(uid.strip()) for uid in allowed_raw.split(",") if uid.strip().isdigit()]

    if not allowed_users:
        raise ValueError("ALLOWED_USERS is not set or empty")

    return Config(
        bot_token=token,
        webapp_url=os.getenv("WEBAPP_URL", ""),
        allowed_users=allowed_users,
        db_path=os.getenv("DB_PATH", "srbot.db"),
        api_port=int(os.getenv("API_PORT", "8080")),
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        gemini_model=os.getenv("GEMINI_MODEL", ""),
        token_expiry=int(os.getenv("TOKEN_EXPIRY", "3600")),
        min_daily_limit=int(os.getenv("MIN_DAILY_LIMIT", "5")),
        max_daily_limit=int(os.getenv("MAX_DAILY_LIMIT", "50")),
        min_notify_interval=int(os.getenv("MIN_NOTIFY_INTERVAL", "10")),
        max_notify_interval=int(os.getenv("MAX_NOTIFY_INTERVAL", "480")),
        default_lang=os.getenv("DEFAULT_LANG", "en"),
        default_timezone=os.getenv("DEFAULT_TIMEZONE", "UTC"),
    )
