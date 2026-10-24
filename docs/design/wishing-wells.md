# Wishing wells

Three wells, spread evenly over the towns. A player standing at one names a
topic, and the server opens a house for it.

Well positions are map data, computed by `scripts/build-map.mjs` and written to
`town.json` beside `spawn` and `zones`. Client and server read the same file,
so nothing is sent over the wire.

## Placing them

- Candidates: `path` and `park` tiles reachable from the spawn, whose 3×3
  neighbourhood is walkable and touches no building. The island is more than
  half sea, so limiting candidates to town ground keeps a well from landing in
  the middle of nowhere.
- Run k-means over the candidates with k = 3 and a fixed seed, then snap each
  centre to the nearest candidate.
- Write `"wells": [{ "id": "w1", "x": .., "y": .. }, ...]`. `TownMap` in
  `map.ts` gains `readonly wells`.
- `PROPS` gains `'well'`, added to `BLOCKING_PROPS` and stamped over whatever
  prop the scatter put on that tile. The existing test that every walkable tile
  is reachable from the spawn then proves a well never seals anything off.

```js
// scripts/build-map.mjs (addition, after `reached` is computed)
function placeWells(candidates, k = 3, iterations = 40, seed = 0x77e11) {
  let centres = pickSeeded(candidates, k, seed); // deterministic sample
  for (let i = 0; i < iterations; i += 1) {
    const groups = centres.map(() => []);
    for (const tile of candidates) {
      groups[nearestIndex(centres, tile)].push(tile);
    }
    centres = groups.map((g, j) => (g.length === 0 ? centres[j] : mean(g)));
  }
  return centres.map((c, j) => ({ id: `w${j + 1}`, ...nearest(candidates, c) }));
}
```

A map test asserts that any two wells are at least 25% of the map's diagonal
apart.

## Making a wish

1. Within 2 tiles of a well, the HUD shows a "許願" button on touch, or an "E"
   hint on a keyboard. The client decides when to show it; the server checks
   the distance again.
2. The player types a topic (2 to 30 characters) and picks which platforms to
   search.
3. The client sends `wish`. The server normalizes the topic: drop `#`, fold
   full-width to half-width, trim, lowercase Latin letters.
4. If a house already has that topic, no new house opens. That house gains
   heat, and the reply names it; the minimap (`ui/minimap.ts`) flashes its
   position.
5. Otherwise the server assigns a house: the empty one nearest this well; failing
   that, the coldest active house below the archive threshold is recycled;
   failing that, the reply is "鎮上滿了".
6. The topic is created, the house switches to colour at level 1, and
   `houseUpdate` goes to everyone. The well plays a short sparkle.
7. The article agent runs once straight away. A topic with no articles still
   gets its house; the panel says no articles have been found yet.

## Limits

- Three wishes per session per day. The window is 24 hours and lives in the
  `Store`, so reconnecting does not reset it.
- Each well shows its three most recent wishes and who made them.
