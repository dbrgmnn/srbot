# SRbot — Telegram SRS Mini App

A minimalist Telegram Mini App for learning foreign vocabulary using Spaced Repetition (SM-2 algorithm). Designed for personal use on a Raspberry Pi Zero 2W, accessed via Tailscale Funnel.

### Native Telegram Integration
- **SettingsButton:** Native Telegram entry point for app configuration.
- **Haptic Patterns:** Advanced tactical feedback (Success/Error/Warning/Selection) for a premium feel.
- **Native UI:** Telegram-style SnackBars (Pill design) and native Popups for session results.
- **Visual Rewards:** Lightweight Canvas confetti effect upon session completion.
- **Skeleton Screens:** Smooth loading experience using pulsing CSS placeholders.

### Performance & Interaction
- **Reactive State:** Modern observable state management using JS Proxies for instant UI updates.
- **Optimized Taps:** Buttons use `touch-action: manipulation` and stable hit areas for instant response.
- **Swipe Gestures:** SM-2 grading via intuitive swipes (Right: Good, Left: Again, Up: Hard).
- **Zero-Build:** Pure ESM and CSS variables — refresh the page to see changes immediately.

## 📁 Project Structure

```text
srbot/
├── main.py              # Entry point: bot polling, scheduler, API server
├── config.py            # Configuration loaded from .env
├── pyproject.toml       # Ruff linter and formatter configuration
├── .pre-commit-config.yaml # Pre-commit hooks for automated checks
├── api/
│   ├── server.py        # aiohttp server, auth middleware, static serving
│   ├── auth.py          # HMAC-SHA256 initData verification, Bearer token auth
│   └── routes/          # API routes
│       ├── init.py      # User session initialization
│       ├── practice.py  # Practice sessions and grading
│       ├── settings.py  # User settings management
│       └── words.py     # Word dictionary operations
├── core/
│   ├── bot_handlers.py  # /start command and WebApp entry point
│   ├── languages.py     # Supported languages (EN, DE) with flags and TTS codes
│   ├── logger.py        # Custom ANSI color logger
│   ├── scheduler.py     # APScheduler notification job
│   ├── scheduler_utils.py# Quiet hours and notification text utilities
│   ├── srs.py           # SM-2 spaced repetition algorithm
│   └── translator.py    # Gemini API interaction for translations
├── db/
│   ├── models.py        # SQLite schema (users, user_settings, words, daily_stats)
│   └── repository.py    # All DB queries (UserRepo, WordRepo)
├── static/
│   ├── index.html       # Single-page app shell
│   ├── css/style.css    # Unified design system, Glass-morphism, Skeletons
│   └── js/
│       ├── api.js       # HTTP client, auth headers, shared state access
│       ├── app.js       # Entry point, theme detection, global haptics
│       ├── dictionary.js# Word management (search, edit, delete)
│       ├── practice.js  # SRS Session logic, Swipe engine, Confetti
│       ├── settings.js  # Universal picker, CSV import/export, auto-save
│       ├── state.js     # Observable state management (Proxy-based)
│       ├── toast.js     # Native-style Pill notifications
│       └── ui.js        # Reactive screen management and statistics rendering
├── tests/
│   ├── test_scheduler.py   # Tests for scheduler utilities (quiet hours)
│   ├── test_srs.py         # Automated tests for the SRS algorithm
│   └── test_ui_integrity.py# Tests for HTML/JS references and structure
└── update.sh            # Secure deploy script with pre-deployment testing
```

## 🚀 Quick Start

1. Create `.env` from `.env.example` and fill in `BOT_TOKEN`, `ALLOWED_USERS`, `GEMINI_API_KEY`, and `GEMINI_MODEL`.
2. Install dependencies: `pip install -r requirements.txt`
3. Run: `python main.py`

## 🛠 Development & Quality

The project uses a modern automated linting and testing pipeline to ensure code consistency and reliability.

### Setup Quality Tools
1. Install development dependencies: `pip install -r requirements-dev.txt`
2. Install git hooks: `pre-commit install`

### Automated Checks
The following tools run automatically on every `git commit`:
- **Ruff:** Ultra-fast Python linter and formatter (replaces flake8, isort, black).
- **Prettier:** Standard formatter for `static/` (JS, CSS, HTML).
- **Pytest:** Local test suite for core logic.
- **Sanity Checks:** Trailing whitespace, end-of-file consistency, and YAML validation.

## 🚀 Deployment & CI/CD
- **CI/CD:** Automated via GitHub Actions + Tailscale.
- **Workflow:** Every push to `main` triggers an automated `pytest` suite. Upon success, the code is deployed to the Raspberry Pi via an encrypted SSH tunnel.
- **Production:** Uses standard `systemd` with `SIGTERM` support for safe database shutdown during updates.

## 🏛 Architecture Standards
- **App Keys:** Always use `AppKey` from `api/app_keys.py` for `aiohttp.web.Application` access (e.g., `app[CONFIG_KEY]`).
- **Data Layer:** SQLite with `aiosqlite`. Use `db/models.py` for schema initialization.

## 🛠 User Guide

### Word Management
- **Search tab:** Instant search with highlighting. Tap to edit, tap ✕ to delete.
- **Import:** Move to Settings → Import CSV. Supports `word,translation,example,level`.

### Practice Session
- **Swipe right** — Good ✅ (remembered well)
- **Swipe left** — Again ❌ (forgotten)
- **Swipe up** — Hard 🟡 (recalled with effort)
- **🔊 button** — speaks the word (front) or example sentence (back)
- **Undo button** — reverts last grade
- **Completion:** Statistics shown as colored numbers in a Pill toast + Confetti.

### Settings (Accessible via Native Telegram Menu)
- **Active Dictionary** — switch between supported languages (DE/EN)
- **Practice Mode** — Word→Translation or Translation→Word
- **New words limit** — daily cap for new cards
- **Frequency** — notification interval
- **API Token** — generate or revoke a Bearer token for adding words via the `/api/external/words` external API.
- **Import / Export** — CSV management and dictionary backup.

## ⚙️ Tech Stack
- **Backend:** Python 3.11+, aiohttp, aiosqlite, aiogram 3.x, pytest
- **Frontend:** Vanilla JS (Reactive State), CSS Variables, Telegram WebApp SDK
- **AI / NLP:** Google Gemini API (translation, CEFR level, example generation)
- **Auth:** HMAC-SHA256 Telegram initData verification
- **Deployment:** Raspberry Pi Zero 2W, Tailscale Funnel, automated test validation
