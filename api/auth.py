import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def verify_init_data(init_data: str, bot_token: str, expires_in: int = 3600) -> dict | None:
    # verifies Telegram WebApp initData signature and expiration
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        return None

    # Check expiration (auth_date is in seconds)
    auth_date_raw = params.get("auth_date", "0")
    try:
        auth_date = int(auth_date_raw)
    except (TypeError, ValueError):
        return None
    if time.time() - auth_date > expires_in:
        return None

    # build data-check-string
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        return None

    return params


def get_user_id(init_data: str, bot_token: str) -> int | None:
    if not init_data:
        return None
    
    params = verify_init_data(init_data, bot_token)
    if not params:
        return None
        
    user_str = params.get("user")
    if not user_str:
        return None
        
    try:
        user = json.loads(user_str)
        return int(user["id"])
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
