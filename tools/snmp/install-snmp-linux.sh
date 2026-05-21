#!/usr/bin/env bash
set -euo pipefail

MANAGER_IP=""
COMMUNITY="serverwatch-ro"
PORT="161"
LOCATION="ServerWatch monitored host"
CONTACT="ServerWatch"

usage() {
  cat <<'USAGE'
Usage:
  sudo bash tools/snmp/install-snmp-linux.sh --manager <SERVERWATCH_IP> [options]

Options:
  --manager <ip>       IP allowed to query SNMP. Required.
  --community <value>  SNMP v2c read-only community. Default: serverwatch-ro
  --port <number>      SNMP UDP port. Default: 161
  --location <text>    sysLocation value.
  --contact <text>     sysContact value.
  --help               Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manager)
      MANAGER_IP="${2:-}"
      shift 2
      ;;
    --community)
      COMMUNITY="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --location)
      LOCATION="${2:-}"
      shift 2
      ;;
    --contact)
      CONTACT="${2:-}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$MANAGER_IP" ]]; then
  echo "Missing required --manager <SERVERWATCH_IP>." >&2
  usage
  exit 2
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root, for example with sudo." >&2
  exit 1
fi

install_snmpd() {
  if command -v snmpd >/dev/null 2>&1; then
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y snmpd snmp
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y net-snmp net-snmp-utils
  elif command -v yum >/dev/null 2>&1; then
    yum install -y net-snmp net-snmp-utils
  elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install net-snmp
  elif command -v apk >/dev/null 2>&1; then
    apk add net-snmp net-snmp-tools
  else
    echo "Could not detect a supported package manager. Install snmpd/net-snmp manually." >&2
    exit 1
  fi
}

configure_snmpd() {
  local config_dir="/etc/snmp"
  local config_file="${config_dir}/snmpd.conf"
  local backup_file="${config_file}.serverwatch.$(date +%Y%m%d%H%M%S).bak"

  mkdir -p "$config_dir"
  if [[ -f "$config_file" ]]; then
    cp "$config_file" "$backup_file"
    echo "Backup created: $backup_file"
  fi

  cat >"$config_file" <<EOF
# Managed by ServerWatch SNMP setup.
# Allows read-only SNMP v2c queries only from the ServerWatch manager.

agentAddress udp:${PORT}

sysLocation ${LOCATION}
sysContact ${CONTACT}

view serverwatchMonitoring included .1.3.6.1.2.1.1
view serverwatchMonitoring included .1.3.6.1.2.1.2
view serverwatchMonitoring included .1.3.6.1.2.1.25
view serverwatchMonitoring included .1.3.6.1.2.1.31

rocommunity ${COMMUNITY} ${MANAGER_IP} -V serverwatchMonitoring
EOF

  chmod 600 "$config_file"
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -qi "Status: active"; then
    ufw allow from "$MANAGER_IP" to any port "$PORT" proto udp
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-rich-rule="rule family=\"ipv4\" source address=\"${MANAGER_IP}\" port protocol=\"udp\" port=\"${PORT}\" accept"
    firewall-cmd --reload
  else
    echo "No active ufw/firewalld detected. Check local firewall rules for UDP ${PORT}."
  fi
}

restart_service() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable snmpd
    systemctl restart snmpd
  else
    service snmpd restart
  fi
}

install_snmpd
configure_snmpd
open_firewall
restart_service

echo "SNMP agent configured."
echo "Allowed manager: ${MANAGER_IP}"
echo "Community: ${COMMUNITY}"
echo "Test from ServerWatch host:"
echo "  snmpget -v2c -c ${COMMUNITY} <this-host-ip> 1.3.6.1.2.1.1.3.0"
