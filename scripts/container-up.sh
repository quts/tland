#!/usr/bin/env bash
#
# Build and start the whole site with Apple Container.
# Equivalent of `docker compose up --build`.
#
#   ./scripts/container-up.sh            build and start
#   ./scripts/container-up.sh --no-build reuse the existing images

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

require_container_cli

BUILD=1
[ "${1:-}" = "--no-build" ] && BUILD=0

if [ "$BUILD" -eq 1 ]; then
  echo "==> building $GAME_IMAGE"
  container build -t "$GAME_IMAGE" -f docker/game.Dockerfile .
  echo "==> building $WEB_IMAGE"
  container build -t "$WEB_IMAGE" -f docker/web.Dockerfile .
fi

ensure_network
remove_container "$WEB_NAME"
remove_container "$GAME_NAME"

echo "==> starting $GAME_NAME"
container run -d \
  --name "$GAME_NAME" \
  --network "$NETWORK" \
  -e "GAME_PORT=$GAME_PORT" \
  -e "GAME_HOST=0.0.0.0" \
  -e "MAX_PLAYERS=$MAX_PLAYERS" \
  -e "TICK_HZ=$TICK_HZ" \
  "$GAME_IMAGE" >/dev/null

# nginx resolves `game` at startup, so wait for the game server to answer.
echo "==> waiting for game server"
for _ in $(seq 1 40); do
  if container exec "$GAME_NAME" node -e \
      "fetch('http://127.0.0.1:$GAME_PORT/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    echo "    game server healthy"
    break
  fi
  sleep 0.5
done

GAME_IP="$(container_ip "$GAME_NAME")"
if [ -z "$GAME_IP" ]; then
  echo "error: could not read the address of $GAME_NAME" >&2
  exit 1
fi

echo "==> starting $WEB_NAME on port $WEB_PORT (upstream $GAME_IP:$GAME_PORT)"
container run -d \
  --name "$WEB_NAME" \
  --network "$NETWORK" \
  -p "0.0.0.0:$WEB_PORT:80" \
  -e "GAME_UPSTREAM=$GAME_IP:$GAME_PORT" \
  "$WEB_IMAGE" >/dev/null

IP="$(lan_ip)"
echo
echo "Ready."
echo "  On this Mac:   http://localhost:$WEB_PORT"
if [ -n "$IP" ]; then
  echo "  From your iPhone/iPad on the same Wi-Fi:"
  echo "                 http://$IP:$WEB_PORT   (plain HTTP)"
fi
echo
echo "  Logs:  container logs -f $WEB_NAME    container logs -f $GAME_NAME"
echo "  Stop:  ./scripts/container-down.sh"
