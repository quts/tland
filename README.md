# Riverside Town

A cozy 2D top-down multiplayer world, set in a stylized town inspired by the
shape of Taipei City. Open a URL on your phone, pick a name, walk around, and
talk to whoever is standing nearby. No accounts, no database, no monetization.

Non-commercial hobby project. Every graphic is generated in code; see
[ASSET_LICENSES.md](ASSET_LICENSES.md).

> **Status: milestone 1 of 5.** The repo skeleton, container setup, and an
> empty Phaser scene that connects to the game server. The map, movement,
> and chat arrive in later milestones.

## Running it

### With Docker

```bash
docker compose up --build
```

Then open <http://localhost:8080>.

### With Apple Container (macOS, Apple silicon)

Apple Container has no `compose`, so these scripts do the equivalent with its
CLI, building the same two Dockerfiles.

```bash
./scripts/container-up.sh
```

```bash
./scripts/container-down.sh
```

One-time setup: install [Apple Container](https://github.com/apple/container/releases),
run `container system start`, and install Rosetta with
`softwareupdate --install-rosetta --agree-to-license` — the image builder
requires it even for arm64-only builds.

## Testing from an iPhone or iPad

Both commands above bind to every interface, so a phone on the **same Wi-Fi**
can reach the Mac directly.

1. Find your Mac's LAN address:

   ```bash
   ipconfig getifaddr en0
   ```

   `scripts/container-up.sh` prints it for you when it finishes.

2. On the phone, open `http://<that-address>:8080` — for example
   `http://192.168.50.91:8080`.

3. Both devices must be on the same network. A "guest" or "client isolation"
   Wi-Fi mode blocks device-to-device traffic and will not work.

**This LAN setup is plain HTTP, not HTTPS.** That is fine on a home network,
but it has consequences worth knowing:

- The WebSocket runs over `ws://`, not `wss://`. Nothing is encrypted.
- Browsers ignore some security headers on a non-secure origin.
- Features gated behind a secure context (service workers, for instance) are
  unavailable. This project does not use any of them.

Do not expose this to the public internet as-is. It has no TLS and no abuse
protection beyond basic rate limits.

## Development

The host needs no Node toolchain. Every command runs in a container:

```bash
./scripts/dev.sh npm install
```

```bash
./scripts/dev.sh npm run typecheck
```

```bash
./scripts/dev.sh npm run lint
```

```bash
./scripts/dev.sh npm test
```

For a live-reloading dev server (Vite on 5173, game server beside it),
reachable from your phone at `http://<mac-lan-ip>:5173`:

```bash
./scripts/dev-serve.sh
```

`node_modules/` and `dist/` end up in the working tree and hold linux/arm64
binaries. They are gitignored and are only meant to be used from inside a
container.

## How it fits together

```
browser ──HTTP──> web (nginx)  ──/ws──> game (node + ws)
                  static client         in-memory room
```

- **`packages/shared`** — message protocol and world constants, imported by
  both sides so they cannot drift.
- **`packages/server`** — Node + [`ws`](https://github.com/websockets/ws).
  Server-authoritative: it owns the room, validates every client message, and
  reaps sockets that stop answering. State is in memory; restarting empties
  the world.
- **`packages/client`** — TypeScript + Vite + Phaser 3.
- **`web`** serves the built client and reverse-proxies `/ws` and `/healthz`
  to `game`, adding the security headers.

`ws` over Colyseus: the protocol is a handful of message types and one room,
so a hand-written 20 Hz loop is less machinery than Colyseus's schema and room
abstractions, and it keeps the server image small.

## Configuration

Copy `.env.example` to `.env` to change ports or limits. No secrets are needed.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEB_PORT` | `8080` | Port the site is published on |
| `GAME_PORT` | `3000` | Game server port, internal to the container network |
| `MAX_PLAYERS` | `50` | Room capacity; further joins get a friendly refusal |
| `TICK_HZ` | `20` | Server simulation and broadcast rate |

## Also here

- [TESTING.md](TESTING.md) — manual iOS test checklist.
- [ASSET_LICENSES.md](ASSET_LICENSES.md) — every font and asset, and its license.
