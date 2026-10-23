#!/usr/bin/env bash
#
# Bring the game server on this instance up to date with the repository.
#
# Idempotent: if the deployed commit already matches the branch and the
# container is healthy, it does nothing. That makes it safe to run on every
# boot and on a timer, so deploying is just merging on GitHub.
#
# Safe: the new image is built and health-checked on a spare port *before*
# anything touches the running container. A broken build leaves the live
# server alone and exits non-zero.
#
#   sudo systemctl start tland-deploy      # deploy now
#   journalctl -u tland-deploy -n 50       # what happened
#
# Settings live in /etc/tland.env; see deploy/tland.env.example.

set -euo pipefail

# Re-exec from a copy. This script updates the very file it is running from,
# and bash reads a script lazily — rewriting it mid-run gives undefined
# behaviour. Running from a snapshot removes the problem entirely.
if [ -z "${TLAND_SELF_COPY:-}" ]; then
  copy="$(mktemp /tmp/tland-deploy.XXXXXX)"
  cat -- "$0" >"$copy"
  chmod +x "$copy"
  TLAND_SELF_COPY="$copy" exec bash "$copy" "$@"
fi
trap 'rm -f "$TLAND_SELF_COPY"' EXIT

ENV_FILE="${TLAND_ENV_FILE:-/etc/tland.env}"
# shellcheck source=/dev/null
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

REPO="${TLAND_REPO:-$HOME/tland}"
BRANCH="${TLAND_BRANCH:-main}"
CONTAINER="${TLAND_CONTAINER:-tland-game}"
IMAGE="${TLAND_IMAGE:-tland/game}"
PORT="${TLAND_PORT:-3000}"
PROBE_PORT="${TLAND_PROBE_PORT:-3999}"
# Remembers a commit that would not build, so the next run does not grind
# through the same failure.
FAILED_MARK="${TLAND_FAILED_MARK:-/tmp/tland-deploy.failed}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*"; exit 1; }
# Set once the commit is known; a failure after that point is remembered.
mark_failed() { [ -n "${short_sha:-}" ] && printf '%s' "$short_sha" >"$FAILED_MARK"; }
fail() { mark_failed; die "$@"; }

# One deploy at a time: a timer firing during a slow build must not start a
# second one.
exec 9>"/tmp/tland-deploy.lock"
flock -n 9 || { log "another deploy is already running; nothing to do"; exit 0; }

command -v docker >/dev/null || die "docker is not installed"
[ -d "$REPO/.git" ] || die "no git repository at $REPO"

cd "$REPO"

/usr/bin/env git fetch --quiet origin "$BRANCH" || die "could not reach the remote"
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/$BRANCH")"

container_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]
}

# What is *actually serving*, not what happens to be checked out. Those differ
# whenever a build failed: the checkout moved on, the container did not. Asking
# the container means a failed deploy is retried on the next run instead of
# being mistaken for a finished one.
deployed_sha() {
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" 2>/dev/null |
    sed -n 's/^GIT_COMMIT=//p' | head -1
}

remote_short="$(git rev-parse --short "origin/$BRANCH")"
running_sha="$(deployed_sha)"

if [ "$running_sha" = "$remote_short" ] && container_running; then
  log "already serving ${remote_short}; nothing to do"
  exit 0
fi

# A commit that failed to build once will fail again. Try it, then leave it
# alone until a new one arrives, so a broken branch cannot pin the instance at
# 100% CPU rebuilding it every time the timer fires.
if [ "$(cat "$FAILED_MARK" 2>/dev/null)" = "$remote_short" ]; then
  log "${remote_short} already failed to deploy; waiting for a new commit"
  exit 0
fi

if [ -n "$running_sha" ]; then
  log "serving ${running_sha}, want ${remote_short}"
else
  log "nothing is serving; deploying ${remote_short}"
fi

if [ "$local_sha" != "$remote_sha" ]; then
  # reset, not pull: this checkout is a deployment target, never a workspace,
  # and a stray local edit must not be able to stop a deploy.
  git reset --hard --quiet "origin/$BRANCH"
fi

short_sha="$(git rev-parse --short HEAD)"
candidate="$IMAGE:candidate"

log "building $candidate"
docker build --quiet -t "$candidate" -f docker/game.Dockerfile . >/dev/null \
  || fail "build failed; the running server has not been touched"

# Prove the new image actually serves before retiring the old one.
probe="${CONTAINER}-probe"
docker rm -f "$probe" >/dev/null 2>&1 || true
log "health-checking it on port $PROBE_PORT"
docker run -d --name "$probe" \
  -p "127.0.0.1:${PROBE_PORT}:3000" \
  -e "GIT_COMMIT=$short_sha" \
  "$candidate" >/dev/null

healthy=""
for _ in $(seq 1 30); do
  if curl -fsS -m 2 "http://127.0.0.1:${PROBE_PORT}/healthz" >/dev/null 2>&1; then
    healthy=yes
    break
  fi
  sleep 1
done
docker logs "$probe" 2>&1 | tail -5 | sed 's/^/    probe: /'
docker rm -f "$probe" >/dev/null 2>&1 || true

[ -n "$healthy" ] || fail "the new image never became healthy; keeping the old one"

log "swapping in ${short_sha}"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker tag "$candidate" "$IMAGE:latest"
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:3000" \
  -e "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" \
  -e "GIT_COMMIT=$short_sha" \
  "$IMAGE:latest" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS -m 2 "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    log "live on ${short_sha}: $(curl -fsS -m 2 "http://127.0.0.1:${PORT}/healthz")"
    rm -f "$FAILED_MARK"
    # Images and build cache accumulate one layer set per deploy, and this
    # instance has a small disk.
    docker image prune -f >/dev/null 2>&1 || true
    docker builder prune -f --keep-storage 2GB >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

fail "swapped in ${short_sha} but it is not answering; check: docker logs $CONTAINER"
