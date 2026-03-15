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
│   ├── languages.py     # Registry of 10 supported languages (EN, DE, RU, etc.)
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

### Multi-Language Support
- **10 Languages:** Supports English, German, Russian, Spanish, French, Italian, Chinese, Japanese, Korean, and Portuguese.
- **Dynamic Selection:** Switch your study language instantly in the Settings tab via a dropdown menu.
- **Auto-Updating UI:** The interface and notifications adapt to the selected language's flag and settings.

### Bot Commands
- `/token`: Generates or shows your unique API token for external integrations. The message auto-deletes after 30 seconds.
- `/token_new`: Revokes the old token and generates a new one.

### External API
Add words from outside (e.g., Browser Extensions, iOS Shortcuts):
- **Endpoint:** `POST /api/external/words`
- **Auth:** `Authorization: Bearer <YOUR_TOKEN>`
- **Payload:** `{"word": "...", "translation": "...", "example": "...", "language": "en"}`

### Internal Settings API
- **Endpoint:** `GET /api/settings/languages` — Returns the list of supported languages with their flags and TTS codes.

### Statistics
- **Home Header:** Displays the current active dictionary and the total number of words in an accent capsule (e.g., "DE 555").
- **New:** Words you haven't started learning yet. (If limit is reached, shows a countdown until reset).
- **Review:** Words due for repetition. (If none, shows a countdown until the next word becomes due).
- **Empty:** Shown when no more words are available in the current dictionary.

## ⚙️ Tech Stack
- **Backend:** Python, aiohttp, aiosqlite.
- **Frontend:** Vanilla JS, CSS Variables (Telegram Theme API).
- **Database:** SQLite.
