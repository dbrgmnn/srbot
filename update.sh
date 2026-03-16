#!/bin/bash
set -e
cd /home/pi/srbot

echo "[1/3] Updating code..."
git pull origin main --quiet

echo "[2/3] Checking dependencies..."
if [ -f requirements.txt ]; then
    # Use md5sum to check if requirements.txt changed
    md5sum requirements.txt > .req.tmp
    if ! diff -q .req.tmp .req.md5 >/dev/null 2>&1; then
        echo "-> Changes detected, installing..."
        ./venv/bin/pip install -r requirements.txt --quiet
        mv .req.tmp .req.md5
    else
        echo "-> No changes in requirements.txt, skipping pip."
        rm .req.tmp
    fi
fi

echo "[3/3] Fast-restarting srbot..."
# Kill immediately and restart via systemd
sudo pkill -9 -f "python main.py" 2>/dev/null || true
sudo systemctl restart srbot

echo "Done! Service is up."
