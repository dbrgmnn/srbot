# SRbot — Telegram SRS Mini App

A minimalist Telegram Mini App for learning foreign vocabulary using Spaced Repetition Systems (SM-2 algorithm).

## 📁 Project Structure

```text
srbot/
├── main.py              # Telegram bot entry point (notifications)
├── api/
│   ├── server.py        # aiohttp server for the Mini App
│   └── routes/          # API routes (words, stats, settings)
├── core/
│   ├── srs.py           # SM-2 algorithm logic
│   └── scheduler.py     # Notification scheduler
├── db/
│   ├── models.py        # Database schema (SQLite)
│   └── repository.py    # Data persistence (SQL queries)
├── webapp/              # Frontend (Mini App)
│   ├── index.html       # Application structure
│   ├── css/style.css    # Styles (Telegram Theme Integration)
│   └── js/app.js        # Logic, gestures (swipes), API client
└── config.py            # Configuration and environment
```

## 🚀 Quick Start

1. **Environment:**
   - Clone the repository and create a `.env` file based on `.env.example`.
   - Install dependencies: `pip install -r requirements.txt`.

2. **Run:**
   - Execute `./update.sh` (if configured) or start manually:
   - `python main.py`

3. **Frontend Development:**
   - Static files are served by the aiohttp server. Any changes in `webapp/` will be applied upon refreshing the app in Telegram.

## 🛠 User Guide

### Word Management
- **Adding:** Use the "Add" tab. 
  - **Single Entry:** Enter word, translation, example sentence, and select a level (Optional, A1-C2) into the fields.
  - **CSV Upload:** Upload a CSV file with headers: `term,translation,example,level`.
- **Search:** Use the "Search" tab. Search starts from 2 characters with instant highlighting. Tap a word to edit (including its level) or delete it.

### Practice Session
- **Flip:** Tap the card to flip it and see the translation.
- **Swipe Right:** Mark as **"Good"** (Retained well).
- **Swipe Left:** Mark as **"Again"** (Forgotten, review soon).
- **Swipe Up:** Mark as **"Hard"** (Recalled with difficulty).
*Tactile haptic feedback is triggered on every successful swipe.*

### Statistics
- **Home Header:** Displays the current active dictionary and the total number of words (e.g., "Dictionary DE 555").
- **New:** Words you haven't started learning yet.
- **Learning:** In progress (interval < 5 days).
- **Known:** Stable knowledge (interval 5-30 days).
- **Mastered:** Crystallized in long-term memory (interval > 30 days).

## ⚙️ Tech Stack
- **Backend:** Python, aiohttp, aiosqlite.
- **Frontend:** Vanilla JS, CSS Variables (Telegram Theme API).
- **Database:** SQLite.
