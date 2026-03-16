import hashlib
import hmac
import time
from urllib.parse import parse_qsl
from db.repository import UserRepo


def verify_init_data(init_data: str, bot_token: str, expires_in: int) -> dict | None:
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


async def verify_bearer_token(request, db) -> int | None:
    # Extracts Bearer token and returns user_id if valid
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.split(" ")[1]
    user_repo = UserRepo(db)
    user_id = await user_repo.get_user_id_by_token(token)
    return user_id
