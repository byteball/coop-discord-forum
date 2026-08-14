#!/bin/bash

PROCESS_NAME="node dist/index.js coop-forum"
EMAIL_SUBJECT="$PROCESS_NAME is not running"
EMAIL_BODY="The process $PROCESS_NAME is not running on $(hostname) at $(date)."
LOG_FILE="./process_monitor.log"

# -----------------------
# Check if the process is running
# -----------------------
if ! /usr/bin/pgrep -u "$(id -u)" -f "$PROCESS_NAME" > /dev/null; then
    echo -e "Subject:$EMAIL_SUBJECT\n\n$EMAIL_BODY" | msmtp $EMAIL_TO

    # Log the event
    echo "$(date): $PROCESS_NAME not running, notification sent to $EMAIL_TO" >> "$LOG_FILE"
fi
