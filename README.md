# srbot

Personal Telegram Mini App for spaced repetition vocabulary learning (German).  
Stack: Python, aiohttp, aiosqlite, APScheduler, SM-2, Telegram WebApp.

---

## Project structure

```
srbot/
├── main.py              # entry point
├── config.py            # loads .env
├── api/                 # aiohttp REST API + auth
│   ├── auth.py          # Telegram WebApp initData verification
│   ├── server.py        # app factory, middleware
│   └── routes/          # init, words, practice, stats, settings
├── core/
│   ├── srs.py           # SM-2 algorithm
│   └── scheduler.py     # APScheduler — push notifications
├── db/
│   ├── models.py        # CREATE TABLE + migrations
│   └── repository.py    # UserRepo, WordRepo
└── webapp/              # Telegram Mini App (HTML/CSS/JS)
```

---

## Local setup (Mac)

```bash
git clone https://github.com/<you>/srbot.git
cd srbot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in BOT_TOKEN and ALLOWED_USERS in .env
python main.py
```

---

## Deploy to Raspberry Pi (first time)

```bash
# on Pi via SSH
sudo apt update && sudo apt install -y python3-venv git sqlite3

git clone https://github.com/<you>/srbot.git
cd srbot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env  # fill BOT_TOKEN, ALLOWED_USERS, TIMEZONE, API_PORT
```

### Systemd service

Create `/etc/systemd/system/srbot.service`:

```ini
[Unit]
Description=srbot
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/srbot
ExecStart=/home/pi/srbot/venv/bin/python main.py
Restart=always
RestartSec=5
EnvironmentFile=/home/pi/srbot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable srbot
sudo systemctl start srbot
```

---

## Deploy updates

### On Pi — create `~/srbot/update.sh`:

```bash
#!/bin/bash
cd /home/pi/srbot
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart srbot
echo "Deployed at $(date)"
```

```bash
chmod +x ~/srbot/update.sh
```

### On Mac — add to `~/.zshrc`:

```bash
alias srbot-deploy='ssh pi@<pi-ip> "bash ~/srbot/update.sh"'
alias srbot-logs='ssh pi@<pi-ip> "sudo journalctl -u srbot -f"'
alias srbot-getdb='scp pi@<pi-ip>:/home/pi/srbot/backups/$(ssh pi@<pi-ip> "ls -t ~/srbot/backups/*.db | head -1 | xargs basename") ~/Downloads/'
```

### Workflow

```
edit on Mac → git push → srbot-deploy
```

---

## Backup

### On Pi — create `~/srbot/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/pi/srbot/backups"
mkdir -p "$BACKUP_DIR"
sqlite3 /home/pi/srbot/srbot.db ".backup $BACKUP_DIR/srbot_$(date +%Y%m%d_%H%M%S).db"
ls -t "$BACKUP_DIR"/*.db | tail -n +4 | xargs -r rm
echo "Backup done at $(date)"
```

```bash
chmod +x ~/srbot/backup.sh
```

### Cron on Pi (every 12 hours):

```bash
crontab -e
# add:
0 */12 * * * bash /home/pi/srbot/backup.sh >> /home/pi/srbot/backups/backup.log 2>&1
```

Keeps the last 3 backups. Old ones are deleted automatically.

### Restore from backup:

```bash
sudo systemctl stop srbot
cp ~/srbot/backups/srbot_<date>.db ~/srbot/srbot.db
sudo systemctl start srbot
```

---

## Useful commands

| Action | Command |
|---|---|
| Deploy update | `srbot-deploy` |
| Watch logs | `srbot-logs` |
| Download latest DB | `srbot-getdb` |
| SSH to Pi | `ssh pi@<pi-ip>` |
| Check service status | `ssh pi 'systemctl status srbot'` |
| Restart bot | `ssh pi 'sudo systemctl restart srbot'` |
| List backups | `ssh pi 'ls -lh ~/srbot/backups/'` |

---

## .env reference

```
BOT_TOKEN=         # from @BotFather
ALLOWED_USERS=     # comma-separated Telegram user IDs
DB_PATH=srbot.db
TIMEZONE=Europe/Berlin
API_PORT=8081
```
