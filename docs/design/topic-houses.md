# Topic houses

Every one of the 28 building plots is a topic house. Empty, it keeps its
current shape in greyscale. With a topic it turns to colour and steps through
five levels as interest rises and falls. The server decides the level; the two
renderers only draw it.

## First: move `buildingPlots` into shared

`buildingPlots()` and `BUILDING_CELL` live in
`packages/client/src/world/buildingLayout.ts`, where the server cannot see
them. They move to `packages/shared/src/buildings.ts`, and each plot gains a
stable id, `h-${x}-${y}`, and a door tile: the tile just outside the middle of
its south edge. Both renderers import from shared; nothing on screen changes.

Today's variants, by plot count: 4, 7, 8, 2 and 7 — the two towers are at
tiles 72,48 and 68,56.

## States and levels

- **Empty**: the plot's existing variant (`plot.variant` unchanged), in
  greyscale. Not a level.
- **Active**: in colour, levels 1 to 5. Opening a topic always starts at level
  1, a single storey house, whatever the plot's variant was.
- **Archived**: heat below 2 for 72 hours with nobody inside. The topic is
  archived and the house returns to empty. The topic and its comments stay in
  the `Store`.

| Level | Look | 3D wall height (tiles) | Up at heat ≥ | Down below heat |
| --- | --- | ---: | ---: | ---: |
| 1 | Single storey house | 1.6 | on opening | never; archives instead |
| 2 | Two storey house | 2.6 | 15 | 12 |
| 3 | Five storey apartment | 4.5 | 40 | 32 |
| 4 | Ten storey block | 7.5 | 90 | 72 |
| 5 | Skyscraper | 12 | 180 | 144 |

The down threshold is 80% of the up threshold, so a house sitting near a
boundary does not bob up and down. The numbers are a guess for 5 to 20
players and will be tuned from real use.

## Heat

Events add points; the total halves every 24 hours. A tick every five minutes
moves a house at most one level, so buildings grow and shrink gradually. Only
the current value and when it was last updated are stored.

| Event | Points | Counted at most |
| --- | ---: | --- |
| Topic opened | +10 | When the wish succeeds |
| Someone enters | +5 | Once per session per 30 minutes |
| Comment | +2 | Once per session per minute |
| Same topic wished again | +5 | See [wishing-wells.md](wishing-wells.md) step 4 |
| Agent finds a new article | +1 | Per article |

```ts
// packages/shared/src/heat.ts — pure, tested with an injected clock
export const HALF_LIFE_MS = 24 * 3600_000;
export const LEVEL_UP = [0, 15, 40, 90, 180] as const; // index = level - 1
export const DOWN_RATIO = 0.8;
export const ARCHIVE_HEAT = 2;

export interface Heat {
  value: number;
  at: number;
  level: number;
}

export function decayed(h: Heat, now: number): number {
  return h.value * 0.5 ** ((now - h.at) / HALF_LIFE_MS);
}

export function addHeat(h: Heat, points: number, now: number): Heat {
  return { value: decayed(h, now) + points, at: now, level: h.level };
}

export function targetLevel(value: number, current: number): number {
  let up = 1;
  LEVEL_UP.forEach((threshold, i) => {
    if (value >= threshold) up = i + 1;
  });
  if (up > current) return up;
  let down = current;
  while (down > 1 && value < (LEVEL_UP.at(down - 1) ?? 0) * DOWN_RATIO) down -= 1;
  return down;
}

/** One step toward the target per tick, so buildings grow and shrink gradually. */
export function stepHeat(h: Heat, now: number): Heat {
  const value = decayed(h, now);
  const goal = targetLevel(value, h.level);
  return { value, at: now, level: h.level + Math.sign(goal - h.level) };
}
```

## Drawing in 3D

- Walls, roofs and fronts are static `InstancedMesh`es built once in
  `three/props.ts`. Topic houses move to a new `three/topicHouses.ts` with
  their own three instanced meshes and a `setHouse(id, level, active)` that
  rewrites one instance's matrix and colour.
- Empty: height from the existing `BUILDING_HEIGHTS[variant]`, wall and roof
  instance colours swapped for a grey of the same lightness. Active: level
  height, in colour.
- Height changes ease over 0.5 seconds in the render loop, writing nothing on
  frames where nothing moved, as the rest of the renderer does.
- `buildSunShadows` is baked at load and will not match a changing height.
  Topic houses use only the grounded blob shadow until that is revisited.
- A 12-tile tower hides roughly 12 tiles behind it under the 45° orthographic
  camera. When the local player is behind one, it goes semi-transparent. This
  needs trying on a phone.

## Drawing in 2D

- `gfx/buildings.ts` generates ten more textures at boot with
  `generateTexture()`: a greyscale copy of each of the five existing variants,
  and the five levels in colour.
- One sprite per plot. On `houseUpdate` it swaps texture with a short scale
  tween. Depth keeps the existing sort by y.

## Signs and going in

- An active house carries a sign above it with the topic and how many people
  are inside. In 3D it is DOM, through the same `WorldOverlay` as name tags.
  Empty houses have no sign.
- Building tiles are not walkable, so "going in" means standing within one
  tile of the door and pressing "進入". That opens a DOM panel,
  `ui/housePanel.ts`; the avatar stays at the door.
- The server checks the door distance on `houseEnter` and records the player as
  a member. Walking more than 2 tiles from the door, or disconnecting, leaves.
- The panel: articles on one side (title, platform, a two or three sentence
  summary, a link to the original; newest first; at most 10), the comment board
  on the other (live; the latest 200 kept), and the members along the top.

## The article agent

`packages/server/src/topics/agent.ts`, scheduled in the game server process.

1. Every active topic runs every three hours, and once when its wish succeeds.
   At most two topics run at a time.
2. Call `search()` on each provider the topic picked that has `topicSearch`.
3. Drop duplicates: the same `(provider, postId)`, the same normalized URL, or
   titles at least 0.9 similar.
4. Hand the newest 10 to the `Summarizer` for a two or three sentence summary in
   Traditional Chinese, instructed to report what the article says without
   opinion.
5. Store them, add heat, and send `houseArticles` to the house's members.

`Summarizer` is an interface too: `summarize(post, signal): Promise<string>`.
Development uses `TruncateSummarizer`, the first 100 characters, so no API key
is needed. Which LLM backs production is an environment setting.
