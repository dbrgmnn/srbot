# SRbot — Telegram SRS Mini App

A minimalist Telegram Mini App for learning foreign vocabulary using Spaced Repetition (SM-2 algorithm). Designed for personal use on a Raspberry Pi Zero 2W, accessed via Tailscale Funnel.

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
│   ├── css/style.css    # Glass-morphism UI, Telegram themeParams
│   └── js/
│       ├── app.js       # Entry point, window bindings, global haptics
│       ├── api.js       # fetch wrapper, shared state, language sync
│       ├── ui.js        # Screen switching, home screen, countdowns
│       ├── practice.js  # Session logic, swipe gestures, audio, undo
│       ├── dictionary.js# Add/edit/delete/search/CSV import/export
│       ├── settings.js  # Settings screen, universal bottom sheet picker
│       └── toast.js     # Toast notifications and message constants
└── update.sh            # Deploy script for Raspberry Pi
```

## 🚀 Quick Start

1. Create `.env` from `.env.example` and fill in `BOT_TOKEN`, `ALLOWED_USERS` and `GEMINI_API_KEY` (optional).
2. Install dependencies: `pip install -r requirements.txt`
3. Run: `python main.py`

Frontend changes in `webapp/` are served immediately — no build step needed.

## 🛠 User Guide

### Word Management
- **Add tab:** Enter word, translation, optional example and level (A1–C2). Or upload a CSV with headers `term,translation,example,level`.
- **Search tab:** Search from 2 characters with instant highlighting. Tap to edit, swipe/tap ✕ to delete.

### Practice Session
- **Tap card** — flip to see translation.
- **Swipe right** — Good ✅ (remembered well)
- **Swipe left** — Again ❌ (forgotten)
- **Swipe up** — Hard 🟡 (recalled with effort)
- **🔊 button** — speaks the word (front) or example sentence (back)
- **Undo button** — appears after first card, reverts last grade
- On session end: toast shows `❌ N · 🟡 N · ✅ N`
- Nav bar is hidden during practice to prevent accidental exits

### Settings
- **Timezone** — set your local timezone for accurate daily resets and notification scheduling.
- **Active Dictionary** — switch between supported languages (DE/EN)
- **Practice Mode** — Word→Translation or Translation→Word
- **New words limit** — daily cap for new words (from config)
- **Frequency** — notification interval
- **Quiet hours** — start/end time for suppressing notifications
- **Import default words** — load bundled vocabulary pack for current language
- **Export dictionary** — share as CSV

### Statistics (Home screen)
- **Activity Heatmap** — 91-day visual chart of learning progress (new words and reviews).
- **🔥 Review** — due for repetition today; countdown if none
- **🌱 New** — available new words today; countdown until reset if limit reached; "Empty" if no words
- **Queue / Learning / Known / Mastered** — SM-2 progression buckets

### Bot Commands
- `/token` — show your API token (auto-deletes after 30s)
- `/token_new` — revoke and regenerate API token

### External API
Add words from iOS Shortcuts, browser extensions, etc.:
```bash
# Option 1: Full manual data
POST /api/external/words
Authorization: Bearer <token>
{"word": "Apfel", "translation": "apple", "example": "Der Apple ist rot.", "language": "de"}

# Option 2: AI Enrichment (requires GEMINI_API_KEY)
# Detects language, adds noun articles (e.g. "der Hund"), 
# provides B1+ examples, and checks for duplicates.
POST /api/external/words
Authorization: Bearer <token>
{"word": "Haus"}
```

## ⚙️ Tech Stack
- **Backend:** Python 3.11+, aiohttp, aiosqlite, APScheduler, aiogram 3.x
- **Frontend:** Vanilla JS (ES modules), CSS custom properties, Telegram WebApp SDK
- **Database:** SQLite with WAL mode
- **Auth:** HMAC-SHA256 Telegram initData + ALLOWED_USERS whitelist + Bearer token for external API
- **Deployment:** Raspberry Pi Zero 2W, systemd service, Tailscale Funnel for HTTPS
