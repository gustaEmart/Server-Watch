#!/usr/bin/env bash
set -euo pipefail

MONGODB_HOME="${MONGODB_HOME:-$HOME/opt/mongodb}"
MONGODB_DATA_DIR="${MONGODB_DATA_DIR:-$HOME/apps/serverwatch-mongodb/data}"
MONGODB_LOG_DIR="${MONGODB_LOG_DIR:-$HOME/apps/serverwatch-mongodb/logs}"
MONGODB_PORT="${MONGODB_PORT:-27017}"

mkdir -p "$MONGODB_DATA_DIR" "$MONGODB_LOG_DIR"

if pgrep -x mongod >/dev/null 2>&1; then
  exit 0
fi

"$MONGODB_HOME/bin/mongod" \
  --dbpath "$MONGODB_DATA_DIR" \
  --logpath "$MONGODB_LOG_DIR/mongod.log" \
  --fork \
  --bind_ip 127.0.0.1 \
  --port "$MONGODB_PORT"
