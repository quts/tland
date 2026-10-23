# Role
You are a senior full-stack game developer. Build a small, fun, non-commercial multiplayer web app.
Work in milestones. After each milestone, stop and tell me how to test it on my iPhone/iPad before continuing.

# Product
A Gather.town-style 2D top-down multiplayer world whose map is a stylized version of Taipei City.
Players open a URL in a mobile browser, pick a nickname and an avatar, walk around, and see
speech bubbles from nearby players. No accounts, no persistence, no monetization.

# Hard constraint: avoid IP / copyright issues (highest priority)
The visual mood should be "cozy island-life sim": soft pastel palette, rounded shapes, chunky outlines,
grass/flower textures, gentle UI. But it must be 100% original:
- Do NOT use or imitate any Nintendo / Animal Crossing assets, characters, villagers, logos (including any leaf-shaped logo),
  UI (no phone-style app menu that mimics an in-game smartphone), fonts, sounds, music, item or furniture designs.
- Do NOT write "Animal Crossing", "動森", "Nintendo", or character names anywhere: code, comments, file names, README, page title.
- Do NOT use official logos/trademarks of real organizations (e.g. Taipei Metro logo, Taipei 101 logo, city government emblem).
  Landmarks may appear only as generic, simplified original shapes (e.g. "a tall tower", "a temple roof").
- All graphics are generated in code (Phaser Graphics → generateTexture, or hand-written SVG) — no downloaded sprites.
- Fonts: only SIL OFL licensed fonts (a rounded Traditional Chinese font such as jf-openhuninn, plus Noto Sans TC fallback), self-hosted.
- Create ASSET_LICENSES.md listing every font/asset and its license. If unsure about a license, don't use it and ask me.

# Map
- Stylized, NOT geographically precise. A hand-authored coarse grid (JSON in the repo) defines terrain;
  tiles are rendered from that grid in code.
- Include the 12 districts as named zones: 中正、大同、中山、松山、大安、萬華、信義、士林、北投、內湖、南港、文山.
  Entering a zone shows a small banner with the district name.
- Rivers as water tiles (Tamsui River on the west, Keelung River winding through the north/east),
  hills in the north (Beitou/Shilin) and southeast (Wenshan/Nangang), bridges where paths cross rivers.
- Roughly 160×120 tiles, 32px tiles. Decorative trees, flowers, benches, generic buildings.

# Target devices (critical)
Users are on iPhone / iPad using Safari (WebKit). Desktop is secondary.
- Touch controls: virtual joystick (bottom-left) AND tap-to-move with simple pathfinding (A* on the tile grid).
  Keyboard WASD/arrows also work on desktop.
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`; respect `env(safe-area-inset-*)`;
  use `100dvh`; prevent double-tap zoom and pinch zoom on the game canvas; no hover-dependent UI.
- Support portrait and landscape; reflow UI on resize/orientation change.
- Cap devicePixelRatio at 2 for performance. Target 60fps on iPhone 12-class devices with 30 players visible.
- Safari suspends WebSockets when the tab is backgrounded: implement auto-reconnect with backoff and resync state on visibilitychange.
- Audio (if any) only after a user gesture; default muted.
- On-screen text input for chat must not be covered by the iOS keyboard (handle visualViewport resize).

# Features (MVP)
1. Join screen: nickname (1–16 chars) + avatar builder from original parts (body color, hat, accessory) — all drawn in code.
2. Real-time movement synced across players; smooth interpolation of remote players.
3. Proximity chat: typed messages appear as speech bubbles above the avatar, visible only to players within range.
   Use hysteresis (enter radius 3 tiles, exit radius 4 tiles) to avoid flicker. Bubbles fade after 6s.
4. Emotes (wave, heart, laugh, sleep) as small original icons.
5. District zone banners + a minimap toggle.
6. Player count indicator. One shared room, max 50 players; reject with a friendly message when full.

# Architecture
- Client: TypeScript + Vite + Phaser 3.
- Server: Node.js (LTS) + TypeScript, WebSocket game server (Colyseus or plain `ws` — pick one and justify briefly).
  Server-authoritative: validate movement (speed clamp, walkable tiles), rate-limit messages (e.g. 5 msgs / 10s),
  max chat length 120 chars, strip control characters. Client renders all user text with textContent, never innerHTML.
- State is in memory only; no database.
- Shared types package for message schemas between client and server.

# Docker Compose (everything runs with one command)
- `docker compose up --build` starts the whole site on http://localhost:8080.
- Services:
  - `web`: multi-stage build (node build → nginx:alpine) serving the static client; reverse-proxies `/ws` to the game server
    with proper WebSocket upgrade headers. Add security headers (CSP allowing only self + ws/wss to same origin,
    X-Content-Type-Options, Referrer-Policy).
  - `game`: Node server, non-root user, healthcheck endpoint.
- No secrets required. Provide `.env.example` for ports/limits.
- README must explain how to test from an iPhone on the same Wi-Fi (access via the Mac's LAN IP),
  and note that this LAN setup is plain HTTP.

# Quality
- Unit tests (Vitest) for: proximity hysteresis, movement validation, rate limiter, pathfinding.
- Playwright smoke test using WebKit with iPhone and iPad device emulation: load page, join, move, send a bubble,
  second browser context sees it.
- `npm run lint` and `npm run typecheck` pass. Add a minimal GitHub Actions workflow running tests.
- Provide a manual iOS test checklist in TESTING.md (rotation, background/foreground reconnect, keyboard overlap, joystick feel).

# Milestones (stop after each for my review)
1. Repo skeleton, docker compose, empty Phaser scene reachable from iPhone on LAN.
2. Map rendering from the JSON grid with code-generated tiles, camera follow, joystick + tap-to-move (single player).
3. Multiplayer movement sync, join screen, avatar builder.
4. Proximity speech bubbles, emotes, zone banners, minimap.
5. Hardening (rate limits, reconnect, security headers), tests, docs, ASSET_LICENSES.md.

# Before writing code
Give me a short plan: directory structure, library choices with one-line justification, message protocol,
and any assumption you're making. Ask me if anything is ambiguous. Don't build ahead of the current milestone.
