#!/bin/bash
set -e
cd /home/pi/srbot

# 1. Stop service first to avoid lock/timeout
sudo systemctl stop srbot

# 2. Update code and requirements
git pull origin main
source venv/bin/activate
pip install -r requirements.txt --quiet

# 3. Start service back up
sudo systemctl start srbot
