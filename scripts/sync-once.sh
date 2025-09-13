#!/usr/bin/env bash
set -euo pipefail

# Run from repo root (this script lives in scripts/)
cd "$(dirname "$0")/.."

LOCK_DIR=".sync.lock"
LOG_DIR="logs"
TIMESTAMP="$(date +"%Y-%m-%dT%H-%M-%S")"
LOG_FILE="$LOG_DIR/sync-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

# Simple lock to avoid overlapping runs
if mkdir "$LOCK_DIR" 2>/dev/null; then
  trap 'rmdir "$LOCK_DIR"' EXIT INT TERM
else
  echo "Another sync appears to be running (lock: $LOCK_DIR). Exiting." >&2
  exit 1
fi

echo "Starting one-off sync at $TIMESTAMP..."
# Pipe output to a timestamped log file while preserving exit code
# You can prepend env like LOG_LEVEL=info if desired.
# LOG_LEVEL=info npm run once | tee "$LOG_FILE"

npm run once | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "Sync failed with exit code $EXIT_CODE. See $LOG_FILE" >&2
  exit $EXIT_CODE
fi

echo "Sync finished. Log written to $LOG_FILE"

