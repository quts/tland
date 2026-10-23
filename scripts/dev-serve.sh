#!/usr/bin/env bash
#
# Live-reload development, both processes inside one container:
#   - the game server on $GAME_PORT
#   - the Vite dev server on 5173, which proxies /ws to the game server
#
# Published on 0.0.0.0 so a phone on the same Wi-Fi can load it. Use this for
# iterating; use scripts/container-up.sh to test the real production build.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

require_container_cli

VITE_PORT="${VITE_PORT:-5173}"
remove_container "$DEV_NAME"

IP="$(lan_ip)"
echo "==> dev server on http://localhost:$VITE_PORT"
[ -n "$IP" ] && echo "    from your iPhone: http://$IP:$VITE_PORT   (plain HTTP)"
echo

exec container run --rm -i -t \
  --name "$DEV_NAME" \
  -v "$REPO_ROOT:/work" \
  -w /work \
  -p "0.0.0.0:$VITE_PORT:5173" \
  -e "GAME_PORT=$GAME_PORT" \
  -e "MAX_PLAYERS=$MAX_PLAYERS" \
  -e "TICK_HZ=$TICK_HZ" \
  node:22-alpine sh -lc '
    set -e
    [ -d node_modules ] || npm install
    npm run dev -w @tland/server &
    SERVER_PID=$!
    trap "kill $SERVER_PID 2>/dev/null || true" EXIT INT TERM
    npm run dev -w @tland/client
  '
