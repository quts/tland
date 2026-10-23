# Shared settings for the Apple Container helper scripts.
# shellcheck shell=bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Load .env if present, then fall back to the documented defaults.
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

WEB_PORT="${WEB_PORT:-8080}"
GAME_PORT="${GAME_PORT:-3000}"
MAX_PLAYERS="${MAX_PLAYERS:-50}"
TICK_HZ="${TICK_HZ:-20}"

NETWORK="tland-net"
GAME_NAME="tland-game"
WEB_NAME="tland-web"
DEV_NAME="tland-dev"
GAME_IMAGE="tland/game:dev"
WEB_IMAGE="tland/web:dev"
DEV_IMAGE="tland/dev:node22"

require_container_cli() {
  if ! command -v container >/dev/null 2>&1; then
    echo "error: Apple Container CLI not found." >&2
    echo "       Install it from https://github.com/apple/container/releases" >&2
    exit 1
  fi
  if ! container system status >/dev/null 2>&1; then
    echo "error: container services are not running. Run: container system start" >&2
    exit 1
  fi
}

ensure_network() {
  if ! container network list 2>/dev/null | awk '{print $1}' | grep -qx "$NETWORK"; then
    echo "==> creating network $NETWORK"
    container network create "$NETWORK" >/dev/null
  fi
}

# Stop and delete a container if it exists, ignoring "not found".
remove_container() {
  local name="$1"
  container stop "$name" >/dev/null 2>&1 || true
  container delete "$name" >/dev/null 2>&1 || true
}

# IPv4 address a running container holds on its network, without the prefix.
#
# Apple Container only resolves container names through a local DNS domain,
# and creating one needs administrator rights. Reading the address here keeps
# the scripts password-free, and nginx gets a literal it can resolve at boot.
container_ip() {
  container inspect "$1" 2>/dev/null | python3 -c '
import json, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
entry = data[0]
networks = entry.get("status", {}).get("networks") or entry.get("networks") or []
for network in networks:
    address = network.get("ipv4Address", "")
    if address:
        print(address.split("/")[0])
        break
'
}

lan_ip() {
  for interface in en0 en1 en2; do
    local ip
    ip="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
  done
  echo ""
}
