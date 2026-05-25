#!/usr/bin/env bash
set -euo pipefail

SERVER_URL=""
PROBE_ID=""
TOKEN=""
NAME=""
INSTALL_DIR="/opt/serverwatch-probe"
NODE_VERSION_REQUIRED="20.19.2"

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

SERVER_URL="${SERVER_URL%/}"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

download_url() {
  local url="$1"
  local destination="$2"
  shift 2

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$@" -o "$destination" "$url"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    local wget_headers=()
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -H) wget_headers+=(--header="$2"); shift 2 ;;
        *) shift ;;
      esac
    done
    wget -q "${wget_headers[@]}" -O "$destination" "$url"
    return
  fi

  echo "curl or wget is required to download probe files." >&2
  exit 1
}

download_asset() {
  local asset="$1"
  local destination="$2"
  local url="${SERVER_URL}/downloads/probe/${asset}"

  download_url "$url" "$destination" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-ServerWatch-Probe-Token: ${TOKEN}"
}

node_major() {
  local node_bin="$1"
  local version
  version="$("$node_bin" -p 'process.versions.node' 2>/dev/null || true)"
  echo "${version%%.*}"
}

system_node_path() {
  if ! command -v node >/dev/null 2>&1; then
    return
  fi
  local node_bin
  node_bin="$(command -v node)"
  local major
  major="$(node_major "$node_bin")"
  if [[ -n "$major" && "$major" -ge 20 ]]; then
    echo "$node_bin"
  fi
}

node_archive_platform() {
  case "$(uname -m)" in
    x86_64|amd64) echo "linux-x64" ;;
    aarch64|arm64) echo "linux-arm64" ;;
    armv7l) echo "linux-armv7l" ;;
    *)
      echo "Unsupported CPU architecture for bundled Node.js: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

ensure_node_runtime() {
  local node_bin
  node_bin="$(system_node_path)"
  if [[ -n "$node_bin" ]]; then
    echo "$node_bin"
    return
  fi

  local platform archive_name archive_path runtime_root bundled_node
  platform="$(node_archive_platform)"
  archive_name="node-v${NODE_VERSION_REQUIRED}-${platform}.tar.xz"
  archive_path="$TMP_DIR/$archive_name"
  runtime_root="$INSTALL_DIR/node"
  bundled_node="$runtime_root/bin/node"

  mkdir -p "$INSTALL_DIR"
  echo "Installing isolated Node.js ${NODE_VERSION_REQUIRED} runtime for ServerWatch Probe..." >&2
  download_url "https://nodejs.org/dist/v${NODE_VERSION_REQUIRED}/${archive_name}" "$archive_path"
  rm -rf "$runtime_root"
  mkdir -p "$runtime_root"
  tar -xJf "$archive_path" --strip-components=1 -C "$runtime_root"

  if [[ ! -x "$bundled_node" ]]; then
    echo "Bundled Node.js installation failed." >&2
    exit 1
  fi
  echo "$bundled_node"
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
NODE_BIN="$(ensure_node_runtime)"
cp "$TMP_DIR/collector.js" "$INSTALL_DIR/collector.js"
cp "$TMP_DIR/setup-server.js" "$INSTALL_DIR/setup-server.js"
cat >"$INSTALL_DIR/package.json" <<'EOF'
{
  "type": "module"
}
EOF
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
ExecStart=$NODE_BIN $INSTALL_DIR/collector.js --config $INSTALL_DIR/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable serverwatch-probe
systemctl restart serverwatch-probe
systemctl status serverwatch-probe --no-pager
