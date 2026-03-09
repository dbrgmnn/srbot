#!/bin/bash
cd /home/pi/srbot
git pull origin main
sed -i "s/?v=[0-9]*/?v=$(date +%s)/g" webapp/index.html
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart srbot
echo "Deployed at $(date)"
