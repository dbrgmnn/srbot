#!/bin/bash
set -e
cd /home/pi/srbot

echo "[1/3] Updating code..."
git pull origin main

echo "[2/3] Updating dependencies..."
source venv/bin/activate
pip install -r requirements.txt

echo "[3/3] Restarting srbot service..."
sudo systemctl restart srbot

echo "Done! Deployment finished successfully."
