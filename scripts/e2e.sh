#!/usr/bin/env bash
#
# Run the Playwright smoke tests in the official Playwright image, which
# already carries a WebKit build and its system libraries. Nothing is
# installed on the host.
#
#   ./scripts/e2e.sh                 run everything
#   ./scripts/e2e.sh --project=ipad  one device only

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

require_container_cli

IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.64.1-noble}"

echo "==> running the end-to-end suite in $IMAGE"
exec container run --rm -i \
  -v "$REPO_ROOT:/work" \
  -w /work \
  -e "CI=1" \
  -e "HOME=/tmp" \
  "$IMAGE" sh -lc '
    set -e
    [ -d node_modules ] || npm install
    npx playwright test "$@"
  ' -- "$@"
