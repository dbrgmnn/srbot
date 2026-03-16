#!/bin/bash
set -e
cd /home/pi/srbot

echo "🚀 [1/4] Pulling latest code from GitHub..."
git pull origin main

echo "📦 [2/4] Checking dependencies..."
# Check if requirements.txt has changed since the last pull
if [ -f requirements.txt ]; then
    # We use a simple hash check to see if we need to run pip install
    md5sum requirements.txt > .req.tmp
    if ! diff -q .req.tmp .req.md5 >/dev/null 2>&1; then
        echo "   -> Requirements changed, installing..."
        source venv/bin/activate
        pip install -r requirements.txt --quiet
        mv .req.tmp .req.md5
    else
        echo "   -> No changes in requirements.txt, skipping pip."
        rm .req.tmp
    fi
fi

echo "⏹️ [3/4] Fast-killing old process..."
# Force kill to avoid waiting for systemd graceful shutdown timeout
sudo pkill -9 -f "python3 main.py" || true

echo "🔄 [4/4] Restarting srbot service..."
sudo systemctl restart srbot

echo "✅ Done! Deployment finished successfully."
