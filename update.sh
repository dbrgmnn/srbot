#!/bin/bash
set -e

# Path to the project
PROJECT_DIR="/home/pi/srbot"
cd "$PROJECT_DIR"

# 1. Fetch changes
echo "Fetching latest changes..."
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Already up to date."
    exit 0
fi

# 2. Update code
echo "Updating code..."
git reset --hard origin/main

# 3. Update dependencies only if requirements.txt changed
if [ requirements.txt -nt .requirements.timestamp ]; then
    echo "Updating dependencies..."
    ./venv/bin/pip install -q -r requirements.txt
    touch .requirements.timestamp
fi

# 4. Restart service
echo "Restarting service..."
sudo systemctl restart srbot
echo "Done!"
