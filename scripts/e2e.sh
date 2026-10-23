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

# The default container is too small: an iPad-sized WebGL surface at a
# device pixel ratio of 2 pushes WebKit past 1 GB and the browser is killed
# mid-test, which surfaces as "target page, context or browser has been
# closed" rather than as anything resembling an out-of-memory error.
MEMORY="${PLAYWRIGHT_MEMORY:-4G}"
CPUS="${PLAYWRIGHT_CPUS:-6}"

echo "==> running the end-to-end suite in $IMAGE ($CPUS cpus, $MEMORY)"
exec container run --rm -i \
  -m "$MEMORY" \
  -c "$CPUS" \
  -v "$REPO_ROOT:/work" \
  -w /work \
  -e "CI=1" \
  -e "HOME=/tmp" \
  -e "PLAYWRIGHT_OUTPUT_DIR=/tmp/playwright-results" \
  "$IMAGE" sh -lc '
    set -e
    [ -d node_modules ] || npm install
    npx playwright test "$@"
  ' -- "$@"
