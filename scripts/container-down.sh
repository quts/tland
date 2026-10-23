#!/usr/bin/env bash
#
# Stop and remove the site containers. Equivalent of `docker compose down`.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

require_container_cli

for name in "$WEB_NAME" "$GAME_NAME" "$DEV_NAME"; do
  echo "==> removing $name"
  remove_container "$name"
done

echo "done. (network $NETWORK left in place; 'container network delete $NETWORK' to remove)"
