#!/bin/bash
cd /home/pi/srbot
git pull origin main
sed -i "s/\.css?v=[0-9]*/.css?v=$(date +%s)/g;s/\.js?v=[0-9]*/.js?v=$(date +%s)/g" webapp/index.html
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart srbot
echo "Deployed at $(date)"
