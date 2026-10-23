#!/usr/bin/env bash
#
# Fetch the upstream OFL font and convert it to WOFF2, inside a container.
#
# Only the WOFF2 is committed: the 4.9 MB upstream TTF compresses to ~2.2 MB
# with every one of its 12,260 glyphs intact, which matters a lot over a phone
# connection. Nothing is subsetted, because player nicknames can contain any
# Han character.
#
# Run this only to re-fetch or upgrade the font.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

require_container_cli

FONT_VERSION="${FONT_VERSION:-2.1}"
FONT_DIR="packages/client/public/fonts"
FONT_URL="https://github.com/justfont/open-huninn-font/releases/download/v${FONT_VERSION}/jf-openhuninn-${FONT_VERSION}.ttf"
LICENSE_URL="https://raw.githubusercontent.com/justfont/open-huninn-font/master/LICENSE"

mkdir -p "$FONT_DIR"

echo "==> fetching jf open huninn v${FONT_VERSION} and converting to WOFF2"
container run --rm \
  -v "$REPO_ROOT:/work" -w /work \
  -e "FONT_VERSION=$FONT_VERSION" \
  -e "FONT_URL=$FONT_URL" \
  -e "LICENSE_URL=$LICENSE_URL" \
  -e "FONT_DIR=$FONT_DIR" \
  python:3.12-alpine sh -lc '
    set -e
    apk add --no-cache curl >/dev/null
    pip install --quiet --no-cache-dir "fonttools[woff]"
    curl -fsSL -o "/tmp/font.ttf" "$FONT_URL"
    curl -fsSL -o "$FONT_DIR/jf-openhuninn-OFL-LICENSE.txt" "$LICENSE_URL"
    python - <<PY
import os
from fontTools.ttLib import TTFont

font = TTFont("/tmp/font.ttf")
font.flavor = "woff2"
out = f"{os.environ[\"FONT_DIR\"]}/jf-openhuninn-{os.environ[\"FONT_VERSION\"]}.woff2"
font.save(out)
print(f"wrote {out} ({os.path.getsize(out) / 1e6:.2f} MB, {len(font.getGlyphOrder())} glyphs)")
PY
  '
