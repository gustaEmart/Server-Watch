#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/Server-Watch}"
NODE_HOME="${NODE_HOME:-$HOME/opt/node-v20.19.2-linux-x64}"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$APP_DIR/.serverwatch.pid"

mkdir -p "$LOG_DIR"

"$APP_DIR/tools/serverwatch/start-mongodb-local.sh"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  exit 0
fi

cd "$APP_DIR"

SERVERWATCH_STORAGE="${SERVERWATCH_STORAGE:-mongodb}" \
MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/serverwatch}" \
MONGODB_DB="${MONGODB_DB:-serverwatch}" \
HOST="${HOST:-0.0.0.0}" \
PORT="${PORT:-3000}" \
DATA_DIR="${DATA_DIR:-./data}" \
PATH="$NODE_HOME/bin:$PATH" \
nohup "$NODE_HOME/bin/node" server.js > "$LOG_DIR/serverwatch.out.log" 2> "$LOG_DIR/serverwatch.err.log" < /dev/null &

echo $! > "$PID_FILE"
