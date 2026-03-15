#!/bin/bash
cd /home/pi/srbot
git pull origin main
source venv/bin/activate
pip install -r requirements.txt --quiet
sudo systemctl restart srbot
sudo journalctl -u srbot -n 20 --no-pager
