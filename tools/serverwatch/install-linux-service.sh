#!/usr/bin/env bash
set -euo pipefail

APP_USER="${SERVERWATCH_USER:-serverwatch}"
APP_DIR="${SERVERWATCH_APP_DIR:-/opt/serverwatch}"
DATA_DIR="${SERVERWATCH_DATA_DIR:-/var/lib/serverwatch}"
HOST="${SERVERWATCH_HOST:-0.0.0.0}"
PORT="${SERVERWATCH_PORT:-3000}"
SERVICE_FILE="/etc/systemd/system/serverwatch.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root, for example with sudo." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js before running this installer." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js 20+ is required. Current version: $(node -v)" >&2
  exit 1
fi

if ! command -v ping >/dev/null 2>&1; then
  echo "Warning: ping was not found. Install iputils-ping before monitoring hosts." >&2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}" "${DATA_DIR}"
install -m 0644 -o "${APP_USER}" -g "${APP_USER}" "${REPO_ROOT}/package.json" "${APP_DIR}/package.json"
install -m 0644 -o "${APP_USER}" -g "${APP_USER}" "${REPO_ROOT}/server.js" "${APP_DIR}/server.js"

rm -rf "${APP_DIR}/public"
install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/public"
cp -a "${REPO_ROOT}/public/." "${APP_DIR}/public/"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/public" "${DATA_DIR}"

cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=ServerWatch MVP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=HOST=${HOST}
Environment=PORT=${PORT}
Environment=DATA_DIR=${DATA_DIR}
ExecStart=$(command -v node) ${APP_DIR}/server.js
Restart=always
RestartSec=5
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable serverwatch
systemctl restart serverwatch
systemctl status serverwatch --no-pager
