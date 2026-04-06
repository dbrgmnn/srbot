import logging
import os
import sys


class ColorFormatter(logging.Formatter):
    """Custom formatter with ANSI color support for terminal output."""

    # Custom formatter with ANSI color support for terminal output.
    COLORS = {
        logging.DEBUG: "\x1b[38;20m",
        logging.INFO: "\x1b[34;20m",
        logging.WARNING: "\x1b[33;20m",
        logging.ERROR: "\x1b[31;20m",
        logging.CRITICAL: "\x1b[31;1m",
    }
    RESET = "\x1b[0m"

    def __init__(self, use_color: bool = True, fmt: str = None):
        super().__init__()
        self.use_color = use_color
        self.fmt = fmt or "[%(asctime)s] [%(levelname)s] [%(name)s] [%(funcName)s:%(lineno)d] - %(message)s"

    def format(self, record):
        log_fmt = self.fmt
        if self.use_color:
            color = self.COLORS.get(record.levelno, self.RESET)
            log_fmt = f"{color}{log_fmt}{self.RESET}"
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


def setup_logging():
    """Configures global logging for the entire application."""

    in_systemd = os.environ.get("INVOCATION_ID") is not None
    use_color = not in_systemd and sys.stdout.isatty()

    # Standard format for all cases
    fmt = "[%(asctime)s] [%(levelname)s] [%(name)s] [%(funcName)s:%(lineno)d] - %(message)s"

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColorFormatter(use_color=use_color, fmt=fmt))

    root_logger = logging.getLogger()
    # Support DEBUG level if environment variable is set
    root_logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

    if root_logger.hasHandlers():
        root_logger.handlers.clear()

    root_logger.addHandler(handler)

    # Quiet noisy third-party libraries
    for logger_name in ["aiogram", "aiohttp.access", "apscheduler"]:
        logging.getLogger(logger_name).setLevel(logging.WARNING)
