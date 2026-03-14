import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    bot_token: str
    allowed_users: list[int]
    db_path: str
    api_port: int


def load_config() -> Config:
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise ValueError("BOT_TOKEN environment variable is not set")

    allowed_raw = os.getenv("ALLOWED_USERS", "")
    # Keep the order from .env
    allowed_users = [int(uid.strip()) for uid in allowed_raw.split(",") if uid.strip().isdigit()]

    if not allowed_users:
        raise ValueError("ALLOWED_USERS is not set or empty")

    return Config(
        bot_token=token,
        allowed_users=allowed_users,
        db_path=os.getenv("DB_PATH", "srbot.db"),
        api_port=int(os.getenv("API_PORT", "8080")),
    )
