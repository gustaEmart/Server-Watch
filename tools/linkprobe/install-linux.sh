#!/usr/bin/env bash
set -euo pipefail

SERVER_URL=""
AGENT_ID=""
LINK_NAME=""
SOURCE_IP=""
INTERFACE_NAME=""
TOKEN=""
PING_TARGETS="8.8.8.8,1.1.1.1,9.9.9.9,208.67.222.222,4.2.2.2,1.0.0.1"
PING_COUNT="4"
PING_TIMEOUT="5"
CHECK_INTERVAL="60"
ONLINE_THRESHOLD="0.5"
IP_CHECK_URLS="https://api.ipify.org,https://ifconfig.me/ip,http://icanhazip.com"
LOG_FILE=""
MODE="install"
BASE_DIR="/opt/serverwatch-linkprobe"
INSTALL_LOG="/var/log/serverwatch-linkprobe-install.log"

usage() {
  cat <<'USAGE'
Usage:
  curl -fsSL <serverwatch-url>/downloads/linkprobe/linux-installer | sudo bash -s -- \
    --server-url <url> \
    --agent-id <id> \
    --link-name <name> \
    --targets <a,b,c> \
    --token <token>

Options:
  --source-ip <ip>            Optional Linux source IP used with ping -I.
  --interface <name>          Optional Linux interface used with ping -I.
  --targets <a,b,c>           External ping targets. Default: 8.8.8.8,1.1.1.1,9.9.9.9,208.67.222.222,4.2.2.2,1.0.0.1
  --ping-count <n>            Pings per target. Default: 4
  --ping-timeout <seconds>    Timeout per ping. Default: 5
  --interval <seconds>        Seconds between cycles. Default: 60
  --threshold <fraction>      Minimum reachable target fraction for ONLINE. Default: 0.5
  --ip-check-urls <a,b,c>     Public IP check URLs.
  --log-file <path>           LinkProbe runtime log file. Default: /var/log/serverwatch-linkprobe-<agent>.log
  --remove --agent-id <id>    Remove only this LinkProbe service/config.

Examples:
  curl -fsSL http://serverwatch.local:3000/downloads/linkprobe/linux-installer | sudo bash -s -- \
    --server-url http://serverwatch.local:3000 \
    --agent-id hcrv-vivo-wan1 \
    --link-name "Vivo HCRV" \
    --targets 8.8.8.8,1.1.1.1,9.9.9.9 \
    --token TOKEN_DO_PROBE
USAGE
}

log() {
  local message="$1"
  printf '[%s] %s\n' "$(date -Is)" "$message" | tee -a "$INSTALL_LOG"
}

step() {
  local percent="$1"
  local message="$2"
  log "[$percent%] $message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url|--backend-url) SERVER_URL="${2:-}"; shift 2 ;;
    --agent-id) AGENT_ID="${2:-}"; shift 2 ;;
    --link-name|--name) LINK_NAME="${2:-}"; shift 2 ;;
    --source-ip) SOURCE_IP="${2:-}"; shift 2 ;;
    --interface) INTERFACE_NAME="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --targets|--ping-targets) PING_TARGETS="${2:-}"; shift 2 ;;
    --ping-count) PING_COUNT="${2:-}"; shift 2 ;;
    --ping-timeout) PING_TIMEOUT="${2:-}"; shift 2 ;;
    --interval|--check-interval) CHECK_INTERVAL="${2:-}"; shift 2 ;;
    --threshold|--online-threshold) ONLINE_THRESHOLD="${2:-}"; shift 2 ;;
    --ip-check-urls) IP_CHECK_URLS="${2:-}"; shift 2 ;;
    --log-file) LOG_FILE="${2:-}"; shift 2 ;;
    --remove|--uninstall) MODE="remove"; shift ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root, for example with sudo." >&2
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_LOG")"
touch "$INSTALL_LOG"
chmod 600 "$INSTALL_LOG"

sanitize_id() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/-/g; s/^-+//; s/-+$//' | cut -c1-80
}

json_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

json_array_from_csv() {
  local value="$1"
  local first=1
  printf '['
  IFS=',' read -ra items <<<"$value"
  for item in "${items[@]}"; do
    item="$(echo "$item" | xargs)"
    [[ -z "$item" ]] && continue
    if [[ "$first" -eq 0 ]]; then
      printf ', '
    fi
    json_string "$item"
    first=0
  done
  printf ']'
}

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

  echo "curl or wget is required." >&2
  exit 1
}

if [[ -z "$AGENT_ID" ]]; then
  echo "--agent-id is required." >&2
  usage
  exit 2
fi

SAFE_ID="$(sanitize_id "$AGENT_ID")"
if [[ -z "$SAFE_ID" ]]; then
  echo "--agent-id produced an invalid service name." >&2
  exit 2
fi

SERVICE_NAME="serverwatch-linkprobe-${SAFE_ID}.service"
CONFIG_DIR="${BASE_DIR}/${SAFE_ID}"
CONFIG_PATH="${CONFIG_DIR}/config.json"
BINARY_PATH="${CONFIG_DIR}/linkprobe"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

remove_linkprobe() {
  step 10 "Parando ${SERVICE_NAME}..."
  systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  step 35 "Desabilitando servico..."
  systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$SERVICE_PATH"
  systemctl daemon-reload
  step 70 "Removendo configuracao ${CONFIG_DIR}..."
  rm -rf "$CONFIG_DIR"
  step 100 "LinkProbe ${AGENT_ID} removido."
}

if [[ "$MODE" == "remove" ]]; then
  remove_linkprobe
  exit 0
fi

if [[ -z "$SERVER_URL" || -z "$TOKEN" ]]; then
  echo "--server-url and --token are required." >&2
  usage
  exit 2
fi

SERVER_URL="${SERVER_URL%/}"
LINK_NAME="${LINK_NAME:-$AGENT_ID}"
LOG_FILE="${LOG_FILE:-/var/log/serverwatch-linkprobe-${SAFE_ID}.log}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

arch_path() {
  case "$(uname -m)" in
    x86_64|amd64) echo "linux-amd64" ;;
    aarch64|arm64) echo "linux-arm64" ;;
    *)
      echo "Unsupported CPU architecture for LinkProbe: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

validate_server_connection() {
  step 5 "Validando URL e token no ServerWatch..."
  local url="${SERVER_URL}/api/probe/validate?probeId=${SAFE_ID}"
  download_url "$url" "$TMP_DIR/validate.json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-ServerWatch-Probe-Token: ${TOKEN}"
}

validate_server_connection

step 15 "Baixando LinkProbe de ${SERVER_URL}..."
ASSET="$(arch_path)"
download_url "${SERVER_URL}/downloads/linkprobe/${ASSET}" "$TMP_DIR/linkprobe" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-ServerWatch-Probe-Token: ${TOKEN}"
chmod +x "$TMP_DIR/linkprobe"

step 35 "Instalando binario..."
systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
mkdir -p "$CONFIG_DIR"
cp "$TMP_DIR/linkprobe" "$BINARY_PATH"
chmod 755 "$BINARY_PATH"

step 55 "Gerando configuracao..."
cat >"$CONFIG_PATH" <<EOF
{
  "agent_id": $(json_string "$AGENT_ID"),
  "link_name": $(json_string "$LINK_NAME"),
  "interface": $(json_string "$INTERFACE_NAME"),
  "source_ip": $(json_string "$SOURCE_IP"),
  "ping_targets": $(json_array_from_csv "$PING_TARGETS"),
  "ping_count": ${PING_COUNT},
  "ping_timeout": ${PING_TIMEOUT},
  "check_interval": ${CHECK_INTERVAL},
  "online_threshold": ${ONLINE_THRESHOLD},
  "ip_check_urls": $(json_array_from_csv "$IP_CHECK_URLS"),
  "backend_url": $(json_string "$SERVER_URL"),
  "token": $(json_string "$TOKEN"),
  "log_file": $(json_string "$LOG_FILE")
}
EOF
chmod 600 "$CONFIG_PATH"

step 70 "Configurando servico systemd..."
cat >"$SERVICE_PATH" <<EOF
[Unit]
Description=ServerWatch LinkProbe ${AGENT_ID}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${BINARY_PATH} --config ${CONFIG_PATH}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

step 84 "Habilitando servico..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
step 92 "Iniciando LinkProbe..."
systemctl restart "$SERVICE_NAME"
systemctl status "$SERVICE_NAME" --no-pager
step 100 "Instalacao concluida. Configuracao: ${CONFIG_PATH}. Log: ${INSTALL_LOG}."
