# SRbot: Telegram SRS Mini App

Personal SRS tool for Raspberry Pi Zero 2W. Clean architecture, zero-build frontend, vanilla JS.

## 📂 Core Structure
- `main.py`: Entry point (Polling/Server/Scheduler).
- `api/`: REST endpoints (words, practice, auth).
- `core/`: Business logic (SM-2, Gemini AI, scheduling).
- `db/`: SQLite models & repositories.
- `static/`: Frontend (ESM JS, CSS variables, HTML).
- `tests/`: Unit/Integration testing suite.

## ⚙️ Tech Highlights
- **Backend:** Python 3.11, aiohttp, aiogram, aiosqlite.
- **Frontend:** Vanilla JS, Proxy-state, CSS variables, WebApp SDK.
- **AI:** Google Gemini (translation/example/CEFR level).
- **Quality:** Ruff, Prettier, Pytest, pre-commit hooks.

## 🚀 Operations
- **Deploy:** `./update.sh` (git pull -> pip -> systemd).
- **Dev/Test:** `./venv/bin/pre-commit run --all-files` (Mandatory).
- **Deployment:** GitHub Actions + Tailscale.

## 🏛 Standards
- **Haptic Feedback:** All interactions MUST use `tg.HapticFeedback` (Success/Error/Warning/Selection).
- **Code:** Concise English comments in Python; clean architecture.
- **API:** Always verify `initData` HMAC-SHA256.
- **Performance:** Keep minimal dependencies, avoid build steps.
