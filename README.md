# Riverside Town

A cozy 2D top-down multiplayer world, set in a stylized town inspired by the
shape of Taipei City. Open a URL on your phone, pick a name and a look, walk
around, and talk to whoever is standing nearby. No accounts, no database, no
monetization.

Non-commercial hobby project. Every graphic is generated in code; see
[ASSET_LICENSES.md](ASSET_LICENSES.md).

## What's in it

- A 160 × 120 tile town, rendered from a hand-authored coarse grid, with the
  twelve districts — 中正, 大同, 中山, 松山, 大安, 萬華, 信義, 士林, 北投,
  內湖, 南港, 文山 — named as zones that announce themselves as you cross into
  them. A river down the west side, another winding in from the north-east,
  bridges where the roads cross them, and hills in the north and the south.
- Touch controls: a virtual joystick, and tap-to-move with A* pathfinding.
  WASD and the arrow keys work on a desktop.
- An avatar builder: skin, shirt, hat and accessory, all drawn in code.
- Proximity chat. Speech bubbles are visible only within about three tiles,
  with hysteresis so they do not blink as people drift at the edge of earshot.
- Four emotes, a minimap, and a live player count.

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
- Browsers ignore some security headers on a non-secure origin — which is why
  `Cross-Origin-Opener-Policy` is deliberately left off; see
  `docker/security-headers.conf`.
- Features gated behind a secure context (service workers, for instance) are
  unavailable. This project does not use any of them.

Do not expose this to the public internet as-is. It has no TLS, and no abuse
protection beyond the rate limits below.

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

The WebKit end-to-end suite, in the official Playwright image:

```bash
./scripts/e2e.sh
```

`node_modules/` and `dist/` end up in the working tree and hold linux/arm64
binaries. They are gitignored and are only meant to be used from inside a
container. All of those containers are Debian-based so they share one
`node_modules` with the glibc Playwright image; running `npm install` from an
Alpine container instead would leave native bindings for the wrong libc.

Bind mounts deliver no filesystem events, so `node --watch` and Vite's HMR do
not see edits made on the host. Restart the container after changing server
code.

## How it fits together

```
browser ──HTTP──> web (nginx)  ──/ws──> game (node + ws)
                  static client         in-memory room
```

- **`packages/shared`** — the wire protocol, the map, pathfinding, the
  proximity tracker and the rate limiter. Imported by both sides, so the two
  cannot drift apart and the interesting logic is unit-testable without a
  browser or a socket.
- **`packages/server`** — Node + [`ws`](https://github.com/websockets/ws).
  Server-authoritative: it owns the room, validates every claimed position
  against the map and a speed limit, decides who can hear whom, sanitizes all
  text, and reaps sockets that stop answering. State is in memory; restarting
  empties the world.
- **`packages/client`** — TypeScript + Vite + Phaser 3. Every texture is
  produced at boot by `Graphics.generateTexture()`.
- **`web`** serves the built client and reverse-proxies `/ws` and `/healthz`
  to `game`, adding the security headers.

**`ws` rather than Colyseus**: the protocol is a handful of message types and
one room, so a hand-written 20 Hz loop is less machinery than Colyseus's
schema and room abstractions, and it keeps the server image small.

### The map

`packages/shared/src/map/town.json` is the authored artifact: a 40 × 30 grid of
terrain characters, one per coarse cell, plus the district rectangles. Each
cell expands in code to 4 × 4 tiles of 32px, giving the 160 × 120 tile world.
Decorations — trees, flowers, benches, rocks — are scattered from a fixed seed
rather than hand-placed, so client and server agree on them without sending
anything over the wire. Anything the scatter would have sealed off is cleared
again by a flood fill from the spawn, and a test asserts every walkable tile
stays reachable.

### Limits

| Thing | Limit |
| --- | --- |
| Players in the room | 50; further joins get a friendly refusal |
| Chat messages | 5 per 10 seconds, 120 characters |
| Emotes | 8 per 10 seconds |
| Inbound frame size | 4 KB |
| Malformed frames | 12, then the socket is closed |
| Movement | validated against the map and a speed cap each time |

## Configuration

Copy `.env.example` to `.env` to change ports or limits. No secrets are needed.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEB_PORT` | `8080` | Port the site is published on |
| `GAME_PORT` | `3000` | Game server port, internal to the container network |
| `MAX_PLAYERS` | `50` | Room capacity |
| `TICK_HZ` | `20` | Server simulation and broadcast rate |

## Also here

- [TESTING.md](TESTING.md) — manual iOS test checklist.
- [ASSET_LICENSES.md](ASSET_LICENSES.md) — every font and asset, and its license.
