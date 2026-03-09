#!/bin/bash
cd /home/pi/srbot
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart srbot
echo "Deployed at $(date)"
