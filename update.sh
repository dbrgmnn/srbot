#!/bin/bash
set -e

PROJECT_DIR="/home/pi/srbot"
cd "$PROJECT_DIR"

echo "[INFO] Fetching latest changes..."
git fetch origin main

if git diff --quiet HEAD origin/main; then
    echo "[INFO] Already up to date."
    exit 0
fi

echo "[INFO] Updating code..."
git reset --hard origin/main
git clean -fd

TIMESTAMP=".requirements.timestamp"

if [ requirements.txt -nt "$TIMESTAMP" ]; then
    echo "[INFO] Updating dependencies..."
    ./venv/bin/python -m pip install -q -r requirements.txt
    touch "$TIMESTAMP"
fi

echo "[INFO] Restarting service..."
sudo systemctl restart srbot

echo "[INFO] Done!"
