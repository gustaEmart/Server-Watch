#!/usr/bin/env bash
set -euo pipefail

SERVER_URL=""
PROBE_ID=""
TOKEN=""
NAME=""
INSTALL_DIR="/opt/serverwatch-probe"

usage() {
  cat <<'USAGE'
Usage:
  curl -fsSL <serverwatch-url>/downloads/probe/linux-installer | sudo bash -s -- --server-url <url> --probe-id <id> --token <token> [--name <name>]

Local repository fallback:
  sudo bash tools/probe/install-linux.sh --server-url <url> --probe-id <id> --token <token> [--name <name>]

Setup UI:
  node probe/setup-server.js --config ./config.json
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url) SERVER_URL="${2:-}"; shift 2 ;;
    --probe-id) PROBE_ID="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$SERVER_URL" || -z "$PROBE_ID" || -z "$TOKEN" ]]; then
  usage
  exit 2
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root, for example with sudo." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js before running this installer." >&2
  exit 1
fi

SERVER_URL="${SERVER_URL%/}"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

download_asset() {
  local asset="$1"
  local destination="$2"
  local url="${SERVER_URL}/downloads/probe/${asset}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "X-ServerWatch-Probe-Token: ${TOKEN}" \
      -o "$destination" \
      "$url"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -q \
      --header="Authorization: Bearer ${TOKEN}" \
      --header="X-ServerWatch-Probe-Token: ${TOKEN}" \
      -O "$destination" \
      "$url"
    return
  fi

  echo "curl or wget is required to download probe files." >&2
  exit 1
}

if [[ -f "probe/collector.js" && -f "probe/setup-server.js" ]]; then
  cp probe/collector.js "$TMP_DIR/collector.js"
  cp probe/setup-server.js "$TMP_DIR/setup-server.js"
else
  echo "Downloading probe files from ${SERVER_URL}..."
  download_asset "collector.js" "$TMP_DIR/collector.js"
  download_asset "setup-server.js" "$TMP_DIR/setup-server.js"
fi

mkdir -p "$INSTALL_DIR"
cp "$TMP_DIR/collector.js" "$INSTALL_DIR/collector.js"
cp "$TMP_DIR/setup-server.js" "$INSTALL_DIR/setup-server.js"
cat >"$INSTALL_DIR/config.json" <<EOF
{
  "serverUrl": "$SERVER_URL",
  "probeId": "$PROBE_ID",
  "name": "${NAME:-$PROBE_ID}",
  "token": "$TOKEN",
  "intervalSeconds": 10,
  "timeoutMs": 2500
}
EOF
chmod 600 "$INSTALL_DIR/config.json"

cat >/etc/systemd/system/serverwatch-probe.service <<EOF
[Unit]
Description=ServerWatch Probe Collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) $INSTALL_DIR/collector.js --config $INSTALL_DIR/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable serverwatch-probe
systemctl restart serverwatch-probe
systemctl status serverwatch-probe --no-pager
