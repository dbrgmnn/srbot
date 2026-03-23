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
├── api/
│   ├── server.py        # aiohttp server, auth middleware, static serving
│   ├── auth.py          # HMAC-SHA256 initData verification, Bearer token auth
│   └── routes/          # API routes: init, words, practice, settings
├── core/
│   ├── languages.py     # Supported languages (EN, DE) with flags and TTS codes
│   ├── srs.py           # SM-2 spaced repetition algorithm
│   ├── scheduler.py     # APScheduler notification job
│   └── bot_handlers.py  # /token, /token_new commands
├── db/
│   ├── models.py        # SQLite schema (users, user_settings, words, daily_stats)
│   └── repository.py    # All DB queries (UserRepo, WordRepo)
├── webapp/
│   ├── index.html       # Single-page app shell
│   ├── css/style.css    # Unified design system, Glass-morphism, Skeletons
│   └── js/
│       ├── app.js       # Entry point, theme detection, global haptics
│       ├── state.js     # Observable state management (Proxy-based)
│       ├── api.js       # HTTP client, auth headers, shared state access
│       ├── ui.js        # Reactive screen management and statistics rendering
│       ├── practice.js  # SRS Session logic, Swipe engine, Confetti
│       ├── dictionary.js# Word management (search, edit, delete)
│       ├── settings.js  # Universal picker, CSV import/export, auto-save
│       └── toast.js     # Native-style Pill notifications
├── tests/
│   └── test_srs.py      # Automated tests for the SRS algorithm
└── update.sh            # Secure deploy script with pre-deployment testing
```

## 🚀 Quick Start

1. Create `.env` from `.env.example` and fill in `BOT_TOKEN`, `ALLOWED_USERS`.
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
- **Prettier:** Standard formatter for `webapp/` (JS, CSS, HTML).
- **Pytest:** Local test suite for core logic.
- **Sanity Checks:** Trailing whitespace, end-of-file consistency, and YAML validation.

### Manual Usage
You can run all checks manually on all files without committing:
```bash
# Run all hooks
pre-commit run --all-files

# Run only Python ruff
pre-commit run ruff --all-files
```

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
- **Import / Export** — CSV management and dictionary backup.

## ⚙️ Tech Stack
- **Backend:** Python 3.11+, aiohttp, aiosqlite, aiogram 3.x, pytest
- **Frontend:** Vanilla JS (Reactive State), CSS Variables, Telegram WebApp SDK
- **Auth:** HMAC-SHA256 Telegram initData verification
- **Deployment:** Raspberry Pi Zero 2W, Tailscale Funnel, automated test validation
