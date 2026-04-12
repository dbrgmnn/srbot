from config import Config


def build_limits_payload(config: Config) -> dict[str, int]:
    """Build shared limits payload for API responses."""
    return {
        "min_daily_limit": config.min_daily_limit,
        "max_daily_limit": config.max_daily_limit,
        "min_notify_interval": config.min_notify_interval,
        "max_notify_interval": config.max_notify_interval,
    }
