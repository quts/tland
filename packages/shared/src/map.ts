import townData from './map/town.json' with { type: 'json' };
import { hashCoords } from './random.js';
import {
  TERRAIN_BY_CHAR,
  isBlockingProp,
  isWalkableTerrain,
  type Prop,
  type Terrain,
} from './terrain.js';

/**
 * A named district and its display anchor, in tile coordinates. Merged
 * districts retain several internal coverage seeds behind this public anchor.
 */
export interface Zone {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface TownMap {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** The fixed point the client draws before the server says where you are. */
  readonly spawn: { readonly x: number; readonly y: number };
  /**
   * Where a player may be dropped when they join: streets and plazas, never
   * the middle of a field or a beach. Every town is represented, so arriving
   * puts you somewhere that looks like a place and has somewhere to walk to.
   */
  readonly spawnPoints: readonly { readonly x: number; readonly y: number }[];
  readonly zones: readonly Zone[];
  terrainAt(x: number, y: number): Terrain;
  propAt(x: number, y: number): Prop;
  /** Inside the map, on walkable terrain, and not blocked by a prop. */
  isWalkable(x: number, y: number): boolean;
  zoneAt(x: number, y: number): string | null;
}

/** Seeds are fixed so every client and the server scatter props identically. */
const PROP_SEED = 0x7a1a11;

interface Grid {
  readonly width: number;
  readonly height: number;
  readonly terrain: Terrain[];
  readonly props: Prop[];
}

function indexOf(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

/** Terrain is walkable and nothing is standing on it. */
function isOpen(grid: Grid, x: number, y: number): boolean {
  if (!inBounds(grid, x, y)) return false;
  const index = indexOf(grid, x, y);
  return (
    isWalkableTerrain(grid.terrain[index] as Terrain) &&
    !isBlockingProp(grid.props[index] as Prop)
  );
}

/** Expand the coarse authored grid: one cell becomes cellTiles x cellTiles. */
function expandTerrain(): Grid {
  const cell = townData.cellTiles;
  const width = townData.width * cell;
  const height = townData.height * cell;
  const terrain = new Array<Terrain>(width * height);

  for (let y = 0; y < height; y += 1) {
    const row = townData.grid[Math.floor(y / cell)] as string;
    for (let x = 0; x < width; x += 1) {
      const char = row.charAt(Math.floor(x / cell));
      const kind = TERRAIN_BY_CHAR[char];
      if (kind === undefined) {
        throw new Error(`unknown terrain character ${JSON.stringify(char)}`);
      }
      terrain[y * width + x] = kind;
    }
  }

  return { width, height, terrain, props: new Array<Prop>(width * height).fill('none') };
}

/**
 * Scatter decorations. Deterministic per tile, so no sequence or ordering
 * dependency: the same tile always gets the same prop.
 */
function scatterProps(grid: Grid): void {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = indexOf(grid, x, y);
      const terrain = grid.terrain[index] as Terrain;
      const roll = hashCoords(x, y, PROP_SEED) % 1000;

      if (terrain === 'grass') {
        if (roll < 55) grid.props[index] = 'tree';
        else if (roll < 150) grid.props[index] = 'flower';
        else if (roll < 158) grid.props[index] = 'bench';
      } else if (terrain === 'sand') {
        if (roll < 40) grid.props[index] = 'rock';
        else if (roll < 70) grid.props[index] = 'flower';
      }
    }
  }
}

/**
 * Clear scattered props that would seal off part of the map.
 *
 * A random tree dropped into a one-tile gap can strand a whole district, so
 * flood-fill from the spawn and open up whatever the fill could not reach.
 * The terrain itself is already verified connected; only props can break it.
 */
function openStrandedRegions(grid: Grid, spawnX: number, spawnY: number): void {
  const total = grid.width * grid.height;

  for (let pass = 0; pass < 8; pass += 1) {
    const reached = new Uint8Array(total);
    const queue: number[] = [indexOf(grid, spawnX, spawnY)];
    reached[queue[0] as number] = 1;

    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      const x = index % grid.width;
      const y = (index - x) / grid.width;
      const neighbors: ReadonlyArray<readonly [number, number]> = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (!isOpen(grid, nx, ny)) continue;
        const neighborIndex = indexOf(grid, nx, ny);
        if (reached[neighborIndex] === 1) continue;
        reached[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }

    let cleared = 0;
    for (let index = 0; index < total; index += 1) {
      if (reached[index] === 1) continue;
      if (!isWalkableTerrain(grid.terrain[index] as Terrain)) continue;

      // This tile is open but unreachable: take down the props walling it in.
      const x = index % grid.width;
      const y = (index - x) / grid.width;
      for (const [nx, ny] of [
        [x, y],
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as ReadonlyArray<readonly [number, number]>) {
        if (!inBounds(grid, nx, ny)) continue;
        const neighborIndex = indexOf(grid, nx, ny);
        if (isBlockingProp(grid.props[neighborIndex] as Prop)) {
          grid.props[neighborIndex] = 'none';
          cleared += 1;
        }
      }
    }

    // Nothing left to open, or nothing left that props can fix.
    if (cleared === 0) return;
  }
}

interface ZoneSeed {
  readonly x: number;
  readonly y: number;
  readonly zoneIndex: number;
  readonly priority: number;
}

/**
 * Give every walkable tile the district it is nearest to *on foot*.
 *
 * A multi-source flood fill from the seeds, spreading only over ground you
 * could actually walk, so a river or a ridge becomes a border without anyone
 * having to draw one. Original seed priority retains the old boundaries
 * when several sites share a merged name. Three properties come for free,
 * each of which the earlier rectangles got wrong: no tile can belong to two districts, no
 * walkable tile is left nameless, and a district can never be hidden
 * underneath another.
 */
function assignZones(grid: Grid, seeds: readonly ZoneSeed[]): Int16Array {
  const owner = new Int16Array(grid.width * grid.height).fill(-1);
  const queue: number[] = [];

  seeds.forEach((seed) => {
    if (!isOpen(grid, seed.x, seed.y)) return;
    const start = indexOf(grid, seed.x, seed.y);
    if (owner[start] !== -1) return; // two seeds on one tile; first wins
    owner[start] = seed.zoneIndex;
    queue.push(start);
  });

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] as number;
    const x = current % grid.width;
    const y = (current - x) / grid.width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as ReadonlyArray<readonly [number, number]>) {
      if (!isOpen(grid, nx, ny)) continue;
      const neighbor = indexOf(grid, nx, ny);
      if (owner[neighbor] !== -1) continue;
      owner[neighbor] = owner[current] as number;
      queue.push(neighbor);
    }
  }

  return owner;
}

let cached: TownMap | null = null;

/** The one shared map. Built once, then reused. */
export function getTownMap(): TownMap {
  if (cached !== null) return cached;

  const grid = expandTerrain();
  scatterProps(grid);

  const spawn = { x: townData.spawn.x, y: townData.spawn.y };
  // Never bury the spawn under a bench.
  grid.props[indexOf(grid, spawn.x, spawn.y)] = 'none';
  openStrandedRegions(grid, spawn.x, spawn.y);

  const cell = townData.cellTiles;
  const zones: Zone[] = townData.zones.map((zone) => ({
    name: zone.name,
    x: zone.x * cell,
    y: zone.y * cell,
  }));
  const seeds: ZoneSeed[] = townData.zones.flatMap((zone, zoneIndex) =>
    zone.seeds.map(seed => ({
      x: seed.x * cell,
      y: seed.y * cell,
      zoneIndex,
      priority: seed.priority,
    })),
  ).sort((a, b) => a.priority - b.priority);
  const zoneOwner = assignZones(grid, seeds);

  // Streets and plazas, gathered once. Grass is excluded deliberately: a
  // player who materialises in the middle of a meadow has nothing around
  // them, and one who lands on a beach is usually facing the sea.
  const spawnPoints: { x: number; y: number }[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!isOpen(grid, x, y)) continue;
      const terrain = grid.terrain[indexOf(grid, x, y)] as Terrain;
      if (terrain === 'path' || terrain === 'park') spawnPoints.push({ x, y });
    }
  }

  cached = {
    name: townData.name,
    width: grid.width,
    height: grid.height,
    spawn,
    spawnPoints,
    zones,
    terrainAt: (x, y) =>
      inBounds(grid, x, y) ? (grid.terrain[indexOf(grid, x, y)] as Terrain) : 'water',
    propAt: (x, y) =>
      inBounds(grid, x, y) ? (grid.props[indexOf(grid, x, y)] as Prop) : 'none',
    isWalkable: (x, y) => isOpen(grid, x, y),
    zoneAt: (x, y) => {
      if (!inBounds(grid, x, y)) return null;
      const index = zoneOwner[indexOf(grid, x, y)] as number;
      return index === -1 ? null : (zones[index] as Zone).name;
    },
  };

  return cached;
}
