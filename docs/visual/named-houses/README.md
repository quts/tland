# Twelve named reference cottages

2026-10-25 · PR #33 · branch: `codex/fifteen-named-houses`

## Current placement

Steve House, Dell House and Jeff House have been removed as requested. Their
48 building tiles are grass in the shared client/server map. The other twelve
houses retain their positions, names and colors; there is no re-selection or
relocation. There are exactly 192 building tiles (twelve complete 4 × 4 plots).

The initial fifteen plots were selected by exact max-min Euclidean spacing
among the original twenty-eight. The optimal minimum distance was √128 =
11.3137 tiles. The initial selection is retained as provenance and tested
separately; the remaining twelve are not presented as a new globally optimal
twelve-house selection.

The map generator reproduces the checked-in map byte-for-byte. The retained
Huffman House has a full collision footprint rather than the former road
sliver. Door approaches are clear of random blocking props. District seeds
are unchanged; the existing walking-distance algorithm recalculates ownership
for the reclaimed land, with its deterministic snapshot updated accordingly.

![Current location plan](locations.png)

| # | Name | Top-left tile x, y | Palette |
| --- | --- | --- | --- |
| 1 | Wilson House | 76, 44 | 1 |
| 2 | Engelbart House | 60, 52 | 2 |
| 3 | Moore House | 100, 52 | 3 |
| 4 | Berners-Lee House | 76, 56 | 4 |
| 5 | Hopper House | 92, 68 | 5 |
| 6 | Dijkstra House | 44, 72 | 6 |
| 7 | Huffman House | 64, 72 | 7 |
| 8 | von Neumann House | 76, 72 | 8 |
| 9 | Turing House | 104, 72 | 9 |
| 10 | Hawkins House | 52, 80 | 10 |
| 11 | Cooper House | 36, 84 | 11 |
| 12 | Shockley House | 76, 88 | 13 |

## Cottage design

One fixed silhouette follows the reference: rounded pitched roof, gabled
walls, hollow chimney, arched door/windows, flowerboxes, steps, shrubs,
rounded grass foundation and a wooden name plaque. Twelve colors from the
thirteen supported schemes are now used. Each house is 14,460 triangles;
repeated palette geometries are cached and all names share one texture atlas.

The 2D fallback shows the same color and name with a code-drawn front elevation.
These are actual WebKit renders of the TypeScript model.

![Twelve named houses](variants.png)

![Seven views](turnaround.png)

![Details](details.png)

## CI repair

The first PR CI run failed because the all-palette geometry test took 8.3
seconds on the GitHub runner, exceeding its unchanged 5-second timeout.
Recursive matcher comparison of large typed arrays is replaced with native
`Buffer.equals` on precisely bounded byte views. Every position and normal
byte in all thirteen palettes is still compared exactly; no timeout or
performance budget is raised.

Local validation also exposed a movement-relay test race: a state packet sent
before the move could arrive after clearing the receive buffer, and the test
selected that oldest packet. It now waits for the latest relayed position to
reach the target instead of relying on a fixed sleep and first packet.

## Validation and reproduction

```sh
node scripts/build-map.mjs
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test
```

With the Vite client running:

```sh
node scripts/house-review.mjs
```

This captures current locations, twelve named variants, seven views and detail
views, failing on browser/shader errors. Dedicated cottage scenarios capture
2D/3D on iPhone/iPad portrait and landscape.

Stationary rendering limits remain 150 calls / 300,000 triangles. The crowd
scenario retains its existing explicit call deviation ceiling. Physical-device
60fps remains unverified.

![Current iPhone 3D](cottage-3d-iphone.png)

![Current iPhone 2D](cottage-2d-iphone.png)

Local verification of the twelve-house update: type checking, ESLint, build,
202 unit tests and all eight dedicated WebKit cottage scenarios passed.
Current cottage counters are in `performance.json`; all stationary views stay
below the unchanged budgets.
