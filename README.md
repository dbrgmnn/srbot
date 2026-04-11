# SRbot

Personal SRS Telegram Mini App. Python 3.11 + aiohttp/aiogram/aiosqlite backend, vanilla JS (ESM) frontend, SQLite.

## Structure

| Path | Purpose |
|------|---------|
| `main.py` | Entry point (Polling / Server / Scheduler) |
| `api/` | REST endpoints (words, practice, auth) |
| `core/` | Business logic (SM-2, Gemini AI, scheduling) |
| `db/` | SQLite models & repositories |
| `static/` | Frontend (ESM JS, CSS variables, HTML) |
| `tests/` | Unit / integration tests |

## Operations

- **Deploy:** `./update.sh` — git pull, pip install, systemd restart.
- **Test:** `./venv/bin/pre-commit run --all-files` (mandatory before commit).
- **CI/CD:** GitHub Actions + Tailscale.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
