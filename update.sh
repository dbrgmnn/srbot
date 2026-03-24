#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cd /home/pi/srbot

echo -e "${GREEN}[1/5] Updating code...${NC}"
PULL_OUTPUT=$(git pull origin main)
echo "$PULL_OUTPUT"
if [[ "$PULL_OUTPUT" == *"Already up to date"* ]]; then
    echo -e "${GREEN}No changes detected. Skipping update.${NC}"
    exit 0
fi

echo -e "${GREEN}[2/5] Updating dependencies...${NC}"
if [ -f "requirements.txt" ]; then
    ./venv/bin/pip install -q -r requirements.txt
fi

echo -e "${GREEN}[3/5] Running tests...${NC}"
if ./venv/bin/python -m pytest tests/; then
    echo -e "${GREEN}Tests passed!${NC}"
else
    echo -e "${RED}ERROR: Tests failed! Update aborted.${NC}"
    exit 1
fi

echo -e "${GREEN}[4/5] Restarting srbot service...${NC}"
sudo systemctl restart srbot

echo -e "${GREEN}[5/5] Waiting for srbot to start...${NC}"
for i in {1..15}; do
    sleep 2
    systemctl is-active --quiet srbot && echo -e "${GREEN}Done! srbot is running.${NC}" && exit 0
    echo -e "  attempt $i/15..."
done

echo -e "${RED}ERROR: srbot failed to start after 30s${NC}"
systemctl status srbot --no-pager -l
exit 1
