#!/usr/bin/env bash
#
# Run a command against this repo inside a throwaway Node container, so the
# host needs no Node toolchain at all.
#
#   ./scripts/dev.sh npm install
#   ./scripts/dev.sh npm run typecheck
#   ./scripts/dev.sh npm test
#   ./scripts/dev.sh sh            # interactive shell
#
# The repo is bind-mounted, so node_modules/ and dist/ land in the working
# tree (both are gitignored). They hold linux/arm64 binaries and are meant to
# be used only from inside a container.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

require_container_cli

if [ "$#" -eq 0 ]; then
  set -- sh
fi

exec container run --rm -i -t \
  -v "$REPO_ROOT:/work" \
  -w /work \
  -e "npm_config_update_notifier=false" \
  -e "CI=1" \
  node:22-alpine "$@"
