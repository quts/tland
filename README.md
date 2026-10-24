# Riverside Town

A cozy 2D top-down multiplayer world, set in a stylized town inspired by the
shape of Taipei City. Open a URL on your phone, pick a name and a look, walk
around, and talk to whoever is standing nearby. No accounts, no database, no
monetization.

Non-commercial hobby project. Every graphic is generated in code; see
[ASSET_LICENSES.md](ASSET_LICENSES.md).

## What's in it

- A 136 × 160 tile island: a river basin ringed by mountains, opening to the
  sea on one side. **13 named districts** cover every walkable tile and
  announce themselves as you cross into them. Neighboring smaller districts
  merge into larger ones while preserving the former borders. Four rivers
  meet in the basin, with bridges, mountains north and south, parks, beaches
  and open sea.
- Touch controls: a virtual joystick, and tap-to-move with A* pathfinding.
  WASD and the arrow keys work on a desktop.
- An avatar builder: skin, shirt, hat and accessory, all drawn in code.
- Proximity chat. Speech bubbles are visible only within about three tiles,
  with hysteresis so they do not blink as people drift at the edge of earshot.
- Four emotes, a minimap, and a live player count.
- Two views of the same world. **3D is the default**: a soft low-poly
  diorama under a fixed angled camera. `?view=2d` switches to the flat 2D
  view, and the browser remembers the choice. Same map, same grid, same
  controls, same people either way; devices that cannot draw 3D get 2D.

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

   That opens the 3D view; add `?debug=1` for the frame-rate readout, or
   `?view=2d` for the 2D view. TESTING.md has the checklists.

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

The WebKit end-to-end suite, in the official Playwright image — iPhone and
iPad, portrait and landscape:

```bash
./scripts/e2e.sh
```

It needs a roomier container than the default: an iPad-sized WebGL surface at
a device pixel ratio of 2 pushes WebKit past 1 GB, and the browser is killed
mid-test. `scripts/e2e.sh` asks for 4 GB and 6 CPUs; override with
`PLAYWRIGHT_MEMORY` and `PLAYWRIGHT_CPUS`.

`node_modules/` and `dist/` end up in the working tree and hold linux/arm64
binaries. They are gitignored and are only meant to be used from inside a
container. All of those containers are Debian-based so they share one
`node_modules` with the glibc Playwright image; running `npm install` from an
Alpine container instead would leave native bindings for the wrong libc.

Thirty wandering bots, to see how a view copes with a crowd (see TESTING.md):

```bash
./scripts/dev.sh sh -c 'npm run build -w @tland/shared && node scripts/bots.mjs --url ws://<mac-lan-ip>:8080/ws --count 30 --near 68,72'
```

Bind mounts deliver no filesystem events, so `node --watch` and Vite's HMR do
not see edits made on the host. Restart the container after changing server
code.

## Deploying

The two halves have different needs, and that decides where each can live.

- **The client** is static files. Any static host will do.
- **The game server** must be a *long-lived process that keeps state in
  memory*: the room, who is in it, and who can hear whom all live between
  connections. A serverless platform cannot host it — and that is not a
  question of paying for a bigger plan, it is what serverless is. Vercel,
  Netlify Functions, Cloudflare Workers and Lambda are all out for this
  process, on any tier.

So there are two shapes.

### Together, behind nginx

Both containers on one machine — a VPS, EC2, Fly.io, Render, anything that
runs a container. `docker compose up --build` is the whole deployment, nginx
serves the client and proxies `/ws`, and everything is same-origin. Nothing
needs configuring.

### Split: static host plus a small server

Put the client on a static host and the game server on a small always-on
machine. Two settings connect them:

| Where | Setting | Example |
| --- | --- | --- |
| Client, at **build** time | `VITE_GAME_WS_URL` | `wss://town-game.example.com` |
| Game server | `ALLOWED_ORIGINS` | `https://your-town.example.com` |

`VITE_GAME_WS_URL` is baked into the bundle by Vite, so changing it needs a
rebuild, not just a restart. Leave it unset and the client talks to `/ws` on
its own origin, which is what the nginx deployment wants.

`ALLOWED_ORIGINS` matters more than it looks. **WebSocket upgrades are not
subject to CORS**, so a game server on a public address will happily accept a
socket from anybody's web page unless it checks the origin itself. Set it as
soon as the server is reachable from the internet. Leave it unset behind
nginx, where the server is only reachable from inside the container network.

The server also needs TLS in front of it when the client is on HTTPS: a page
served over `https:` cannot open a `ws:` socket. Most hosts terminate TLS for
you; otherwise put a reverse proxy in front.

#### Vercel

`vercel.json` is set up for the client half: it builds `@tland/client`, serves
`packages/client/dist`, and sends the same security headers nginx does (plus
`Cross-Origin-Opener-Policy`, which nginx leaves off because browsers ignore
it on the plain-HTTP LAN setup). Set `VITE_GAME_WS_URL` as an environment
variable — this repo keeps it in `vercel.json` rather than the Vercel
dashboard, since Vite bakes it into the public bundle and it is not a secret.

Without that variable the client has nowhere to connect: it will say
**找不到遊戲伺服器** on the join screen rather than spinning on "reconnecting"
forever, and the join button stays disabled.

**Leave the project's Root Directory empty.** This is an npm workspaces
monorepo, so install and build have to run from the repository root; pointing
Vercel at `packages/client` — which its dashboard will suggest, since that is
where the Vite app lives — installs 24 packages instead of 141 and then fails
with `Missing script: "build:client"`, because the root scripts and
`@tland/shared` are not there. Leave Build Command, Install Command and
Output Directory empty too: anything set in the dashboard overrides
`vercel.json`.

#### EC2

[DEPLOY-EC2.md](DEPLOY-EC2.md) is a step-by-step runbook for the other half:
one EC2 instance, an Elastic IP, a domain, and Caddy in front for automatic
TLS — then wiring it to the Vercel build. It has been followed end to end, and
carries the notes for what actually goes wrong: Cloudflare's proxy silently
preventing certificate issuance, and the two ways a healthy server looks broken
when you test it with curl.

### Moving later

Nothing above is specific to a host. The game server is an ordinary container
image (`docker/game.Dockerfile`), so moving it anywhere else is a matter of
running the same image and pointing `VITE_GAME_WS_URL` at it.

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
- **`packages/client`** — TypeScript + Vite. The game as the client knows it
  — the local player, routes, everyone else's interpolated positions, live
  bubbles, the current district — is `ClientWorld`, which knows nothing about
  drawing. A renderer draws it: `Renderer2D` (Phaser 3, every texture produced
  at boot by `Graphics.generateTexture()`) or `Renderer3D` (three.js).
- **`web`** serves the built client and reverse-proxies `/ws` and `/healthz`
  to `game`, adding the security headers.

**`ws` rather than Colyseus**: the protocol is a handful of message types and
one room, so a hand-written 20 Hz loop is less machinery than Colyseus's
schema and room abstractions, and it keeps the server image small.

### The 3D view

The view is the renderer and nothing else. Movement, collision, A*,
proximity and the protocol are the same code in both, run by the same
`ClientWorld`; the 3D view only decides how it looks.

- **Choosing a view.** 3D unless the address says `?view=2d` (or `?view=3d`);
  a view named in the address is remembered in `localStorage`, so the plain
  address keeps someone's last choice. See `packages/client/src/view.ts`.
- **Loaded separately.** three.js and the 3D code are a separate chunk (about
  150 KB gzipped) fetched by a dynamic import, so the 2D view never downloads
  it. A quick WebGL 2 check runs first; if it fails, or the chunk does not
  load, the page says so and carries on in 2D.
- **The grid, extruded.** Walkable tiles are flat at height zero, always; only
  tiles that were already impassable — hills — rise, and carry decorative
  woods. Ground is merged per 32-tile chunk with ambient occlusion baked into
  vertex colours. Every repeated prop is an `InstancedMesh`, grouped by region
  so frustum culling still works. No shadow maps and no post-processing:
  contact shadows are baked or soft blobs.
- **Avatars** map the same four choices onto rounded primitives, merged into
  one geometry per combination. Faces and blob shadows for the whole crowd are
  one instanced draw each, so thirty players cost about thirty-two draw calls.
- **Text is DOM.** Name tags, bubbles and emotes are elements laid over the
  canvas, positioned each frame by projecting the head; text goes in through
  `textContent`, in the page's own font.
- **A fixed 3/4 camera.** Orthographic, pitched 45°, north up, following
  the player at the same zoom rule as 2D (the width is fixed; a portrait phone
  sees further north and south). Orthographic because a perspective camera
  tall enough for a portrait screen sees the bottom of it nearly from above
  and the top nearly from the side, so each house looked drawn by its own
  rules; now every house, bridge and tree is drawn the same way wherever it
  is. Up on the joystick is up the screen, and a tap is cast onto the terrain,
  hills included, to find its tile — through the same arithmetic the unit
  tests check against three.js's own camera. Every camera setting is in
  `packages/client/src/three/cameraRig.ts`.
- **Water with banks.** The shallows fade from pale at each bank to open
  water a couple of tiles out, so rivers sit in their beds rather than
  reading as a flat blue sheet.
- **On a phone.** Device pixel ratio capped at 2; the render loop reuses its
  vectors, matrices and instance buffers rather than allocating them each
  frame, and only rewrites an overlay's position when it moved; a lost WebGL
  context pauses and recovers; five seconds under 30 fps *offers* the 2D view
  rather than switching unasked.

### The map

An island of 136 x 160 tiles, a little over half of it sea. The silhouette is
a stylized one, kept as a land/sea mask at one character per tile in
`packages/shared/src/map/coastline.txt`.

Everything inside that outline is placed by `scripts/build-map.mjs`, which
writes `packages/shared/src/map/town.json` — the file the game actually reads:

```bash
./scripts/dev.sh node scripts/build-map.mjs --preview
```

The geography is arranged to give the basin a ring of high ground: a volcanic
group to the north, a plateau west, ridges along the north-east coast, and a
range filling the south. Four rivers meet in the basin and leave north-west to
the sea, with bridges at the crossings. Towns are clusters rather than grids — a regular
block pattern reads as a circuit board from above, which is the opposite of
the look this is going for.

Arrivals are **scattered**. A joining player is dropped on a random street or
plaza tile, so the town does not grow entirely around one spot. Grass and
beaches are excluded from the pool: materialising in the middle of a meadow
leaves you with nothing around you, and a beach usually faces you out to sea.

Districts are **seed points, not rectangles**. Each is one coordinate, and
every walkable tile belongs to whichever seed is nearest *on foot* — a
multi-source flood fill, so rivers and ridges become the borders by
themselves. Rectangles were the first attempt and they went wrong three ways
at once: they overlapped, so one name silently hid another; they left three
fifths of the island nameless; and 三川 was covered so completely it could
never be seen at all. None of those is expressible in this model, and tests
hold the line on coverage and on districts being big enough to notice.

Decorations on top of the terrain — trees, flowers, benches, rocks — are
scattered at load time from a fixed seed, so client and server agree on them
without sending anything over the wire. Anything that scatter would have
sealed off is reopened by a flood fill from the spawn, and a test asserts
every walkable tile stays reachable.

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
| `ALLOWED_ORIGINS` | unset | Origins the game server accepts sockets from; unset allows any. Set it once the server is public — see [Deploying](#deploying) |
| `VITE_GAME_WS_URL` | unset | Absolute WebSocket URL of the game server, baked into the client at build time. Unset means same origin |

## Also here

- [DEPLOY-EC2.md](DEPLOY-EC2.md) — putting the game server on EC2, with TLS.
- [TESTING.md](TESTING.md) — manual iOS test checklist.
- [ASSET_LICENSES.md](ASSET_LICENSES.md) — every font and asset, and its license.
- [docs/design/](docs/design/README.md) — planned: social status above heads,
  wishing wells, and topic houses that grow with interest.
