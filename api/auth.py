import hashlib
import hmac
import logging
import time
from urllib.parse import parse_qsl

from api.app_keys import CONFIG_KEY
from db import UserRepo

logger = logging.getLogger(__name__)


def verify_init_data(init_data: str, bot_token: str, expires_in: int) -> dict | None:
    """Verify HMAC signature and expiration of Telegram WebApp initData."""
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        logger.warning("No hash in init_data")
        return None

    # auth_date is a Unix timestamp in seconds
    auth_date_raw = params.get("auth_date", "0")
    try:
        auth_date = int(auth_date_raw)
    except (TypeError, ValueError):
        logger.warning("Invalid auth_date format")
        return None
    if time.time() - auth_date > expires_in:
        logger.warning(f"init_data expired: {time.time() - auth_date}s > {expires_in}s")
        return None

    # Build data-check-string per Telegram spec
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        logger.warning("HMAC signature mismatch")
        return None

    return params


async def verify_bearer_token(request, db) -> int | None:
    """Extract Bearer token and return user_id if valid and in allowed list."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ")[1]
    user_repo = UserRepo(db)
    result = await user_repo.get_user_by_token(token)
    if not result:
        return None

    user_id, telegram_id = result
    config = request.app[CONFIG_KEY]
    if telegram_id not in config.allowed_users:
        return None

    return user_id
