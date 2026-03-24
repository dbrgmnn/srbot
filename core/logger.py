import logging
import os
import sys


class ColorFormatter(logging.Formatter):
    """Custom formatter with ANSI color support for terminal output."""

    # ANSI escape sequences
    GREY = "\x1b[38;20m"
    BLUE = "\x1b[34;20m"
    YELLOW = "\x1b[33;20m"
    RED = "\x1b[31;20m"
    BOLD_RED = "\x1b[31;1m"
    RESET = "\x1b[0m"

    def __init__(self, use_color: bool = True, fmt: str = None):
        super().__init__()
        self.use_color = use_color

        if not fmt:
            fmt = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

        self.FORMATS = {
            logging.DEBUG: self.GREY + fmt + self.RESET if use_color else fmt,
            logging.INFO: self.BLUE + fmt + self.RESET if use_color else fmt,
            logging.WARNING: self.YELLOW + fmt + self.RESET if use_color else fmt,
            logging.ERROR: self.RED + fmt + self.RESET if use_color else fmt,
            logging.CRITICAL: self.BOLD_RED + fmt + self.RESET if use_color else fmt,
        }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


def setup_logging():
    """Configures global logging for the entire application."""

    # Determine if the application is running under systemd
    in_systemd = os.environ.get("INVOCATION_ID") is not None

    if in_systemd:
        # Minimal format: systemd already adds date, time, and host
        # Disable ANSI colors in systemd to avoid raw escape codes in journalctl
        base_fmt = "[%(levelname)s] %(name)s: %(message)s"
        use_color = False
    else:
        # Full format for local terminal execution
        base_fmt = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        # Check if the terminal supports colors
        use_color = sys.stdout.isatty()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColorFormatter(use_color=use_color, fmt=base_fmt))

    # Setup the root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Clear old handlers to prevent duplicate logs
    if root_logger.hasHandlers():
        root_logger.handlers.clear()

    root_logger.addHandler(handler)

    # Quiet noisy third-party libraries
    logging.getLogger("aiogram").setLevel(logging.WARNING)
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
