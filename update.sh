#!/bin/bash
cd /home/pi/srbot
git pull origin main
rm -f srbot.db
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart srbot
echo "Deployed and database reset at $(date)"
