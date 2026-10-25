/**
 * Build packages/shared/src/map/town.json.
 *
 * The coastline comes from `coastline.txt`, a land/ocean mask of the island
 * at one character per tile — a stylized silhouette, not a survey. The
 * geography on top of it — rivers, mountains, parks, towns and roads — is
 * authored here.
 *
 *   node scripts/build-map.mjs
 *
 * Reference points, in tiles:
 *   the basin        x 59-90,  y 55-82
 *   the river mouth  x 36-42,  y 44-54
 *   volcanic group   centred (62, 36)
 *   western plateau  centred (22, 50)
 *   southern range   y 95-150
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mapDir = join(here, '..', 'packages', 'shared', 'src', 'map');

const OCEAN = '~';
const GRASS = '.';
const SAND = ',';
const HILL = '^';
const PATH = '=';
const BRIDGE = 'B';
const BUILDING = '#';
const PARK = '*';

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

const coastline = readFileSync(join(mapDir, 'coastline.txt'), 'utf8')
  .trimEnd()
  .split('\n');
const HEIGHT = coastline.length;
const WIDTH = coastline[0].length;
for (const row of coastline) {
  if (row.length !== WIDTH) throw new Error('coastline.txt is ragged');
}

const grid = coastline.map((row) => [...row].map((c) => (c === '.' ? GRASS : OCEAN)));

const inside = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
const at = (x, y) => (inside(x, y) ? grid[y][x] : OCEAN);
const set = (x, y, value) => {
  if (inside(x, y)) grid[y][x] = value;
};
/** Paint only where the predicate holds, so features never eat the ocean. */
const paint = (x, y, value, allow) => {
  if (!inside(x, y)) return;
  if (allow && !allow(grid[y][x])) return;
  grid[y][x] = value;
};

const onLand = (c) => c === GRASS || c === HILL || c === SAND || c === PARK;

/* ------------------------------------------------------------------ */
/* Noise and curves                                                    */
/* ------------------------------------------------------------------ */

/** Deterministic hash. The same seed always builds the same island. */
function hash(x, y, seed) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in [0,1]. Coarse enough to read as landscape, not fuzz. */
function noise(x, y, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Two octaves is plenty: enough wobble to look natural, not enough to fizz. */
function fbm(x, y, seed) {
  return noise(x, y, seed) * 0.65 + noise(x * 2.3, y * 2.3, seed + 97) * 0.35;
}

/**
 * Catmull-Rom through the control points.
 *
 * Rivers and roads are authored as a handful of places they pass through; the
 * spline is what stops them looking like they were drawn with a ruler.
 */
function spline(points, perUnit = 2) {
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * perUnit));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function disc(cx, cy, radius, value, allow) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) paint(x, y, value, allow);
    }
  }
}

/**
 * Stroke a curve, wandering off the straight line as it goes.
 *
 * `meander` pushes each sample sideways by a noise value, which is what turns
 * a drawn line into something that looks like water found its own way down.
 */
function strokeCurve(points, { width, value, allow, meander = 0, seed = 7 }) {
  const path = spline(points);
  path.forEach(([x, y], i) => {
    const t = i / (path.length - 1);
    let px = x;
    let py = y;
    if (meander > 0) {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular to the direction of travel.
      const offset = (fbm(i / 9, seed, seed) - 0.5) * 2 * meander;
      px += (-dy / len) * offset;
      py += (dx / len) * offset;
    }
    disc(px, py, (typeof width === 'function' ? width(t) : width) / 2, value, allow);
  });
  return path;
}

/* ------------------------------------------------------------------ */
/* Mountains                                                           */
/* ------------------------------------------------------------------ */

/**
 * The basin stays flat. Everything the real city is built on sits inside this
 * rectangle, and no hill is allowed to intrude on it — a mountain in the
 * middle of downtown would be both wrong and unplayable.
 */
const BASIN = { x: 54, y: 52, w: 44, h: 36 };

/**
 * The volcanic group north of the basin, the plateau west of it, the ridges
 * wrapping the north-east coast, and the range filling the south.
 *
 * Each is a disc whose edge is pushed in and out by noise, so the result is a
 * ridge line rather than a bubble.
 */
const MASSIFS = [
  { cx: 62, cy: 32, r: 14, seed: 11 },
  { cx: 50, cy: 30, r: 9, seed: 23 },
  { cx: 75, cy: 31, r: 9, seed: 31 },
  { cx: 29, cy: 55, r: 6, seed: 43 },
  { cx: 19, cy: 50, r: 10, seed: 57 },
  { cx: 101, cy: 47, r: 12, seed: 61 },
  { cx: 117, cy: 62, r: 10, seed: 73 },
  { cx: 70, cy: 116, r: 18, seed: 83 },
  { cx: 44, cy: 114, r: 14, seed: 97 },
  { cx: 97, cy: 100, r: 12, seed: 101 },
  { cx: 58, cy: 138, r: 12, seed: 103 },
  { cx: 37, cy: 130, r: 10, seed: 107 },
];

for (const { cx, cy, r, seed } of MASSIFS) {
  const reach = Math.ceil(r * 1.45);
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      // Noise on position, not angle: neighbouring massifs then blend into
      // one range instead of showing where each circle ended.
      const edge = r * (0.72 + fbm(x / 11, y / 11, seed) * 0.72);
      if (d <= edge) paint(x, y, HILL, (c) => c === GRASS);
    }
  }
}
for (let y = BASIN.y; y < BASIN.y + BASIN.h; y += 1) {
  for (let x = BASIN.x; x < BASIN.x + BASIN.w; x += 1) {
    if (at(x, y) === HILL) set(x, y, GRASS);
  }
}

/* ------------------------------------------------------------------ */
/* Rivers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Four rivers meeting in the basin and leaving north-west to the sea — the
 * arrangement that gives the real city its shape.
 */
const CONFLUENCE = [62, 79];

const RIVERS = [
  {
    points: [
      CONFLUENCE, [60, 74], [56, 69], [54, 63], [50, 59],
      [46, 55], [44, 50], [40, 47], [36, 44], [33, 42],
    ],
    width: (t) => 6 + t * 5,
    meander: 2.6,
    seed: 5,
  },
  {
    points: [
      [106, 63], [98, 59], [90, 63], [83, 59],
      [76, 63], [69, 61], [64, 66], [57, 70], [52, 66],
    ],
    width: () => 3.6,
    meander: 1.6,
    seed: 17,
  },
  {
    points: [[78, 108], [74, 99], [71, 91], [67, 84], CONFLUENCE],
    width: () => 3.4,
    meander: 1.8,
    seed: 29,
  },
  {
    points: [[40, 118], [46, 107], [52, 96], [57, 86], CONFLUENCE],
    width: () => 3.4,
    meander: 1.8,
    seed: 41,
  },
];

// Level ground either side first, so every river can be walked along.
for (const river of RIVERS) {
  strokeCurve(river.points, {
    width: (t) => river.width(t) + 12,
    value: GRASS,
    allow: (c) => c === HILL,
    meander: river.meander,
    seed: river.seed,
  });
}
for (const river of RIVERS) {
  strokeCurve(river.points, {
    width: river.width,
    value: OCEAN,
    allow: onLand,
    meander: river.meander,
    seed: river.seed,
  });
}

// The river widens into a pool where it leaves the southern hills.
disc(73, 97, 4.5, OCEAN, onLand);

/* ------------------------------------------------------------------ */
/* Shoreline                                                           */
/* ------------------------------------------------------------------ */

/** A band of sand wherever land meets water, river banks included. */
const shore = [];
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    if (grid[y][x] !== GRASS && grid[y][x] !== HILL) continue;
    if (at(x - 1, y) === OCEAN || at(x + 1, y) === OCEAN ||
        at(x, y - 1) === OCEAN || at(x, y + 1) === OCEAN) shore.push([x, y]);
  }
}
for (const [x, y] of shore) set(x, y, SAND);

/* ------------------------------------------------------------------ */
/* Parks                                                               */
/* ------------------------------------------------------------------ */

/** Mown lawns and flowers. Irregular, like the hills. */
const PARKS = [
  { cx: 83, cy: 79, r: 5, seed: 211 },   // the big forest park, east of the centre
  { cx: 67, cy: 69, r: 2.5, seed: 223 }, // a civic square by the river
  { cx: 62, cy: 26, r: 8, seed: 229 },   // the national park in the volcanic group
  { cx: 92, cy: 86, r: 4, seed: 233 },   // out towards the eastern hills
  { cx: 47, cy: 90, r: 4, seed: 239 },   // across the river, on the west bank
  { cx: 73, cy: 104, r: 4, seed: 241 },  // by the pool in the southern valley
  { cx: 30, cy: 46, r: 4, seed: 251 },   // on the headland above the port
];
for (const { cx, cy, r, seed } of PARKS) {
  const reach = Math.ceil(r * 1.5);
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      const edge = r * (0.75 + fbm(x / 7, y / 7, seed) * 0.6);
      if (Math.hypot(x - cx, y - cy) <= edge) {
        paint(x, y, PARK, (c) => c === GRASS || c === HILL);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Lanes and towns                                                     */
/* ------------------------------------------------------------------ */

const walkableForPath = (c) => c === GRASS || c === HILL || c === PARK || c === SAND;

/**
 * Lay a road. Roads never touch water: they stop at the bank and wait for a
 * bridge. An earlier version let them pave over any water they crossed, and
 * since roads naturally follow valleys, that quietly deleted all four rivers.
 */
function layRoad(points, width = 2.4) {
  const path = spline(points);
  for (const [x, y] of path) disc(x, y, width / 2, PATH, walkableForPath);
  return path;
}

/**
 * Bridges are placed deliberately, as short spans across a named river, and
 * are the only way over. Each is drawn as decking over the water with a
 * little road either end to meet the bank.
 */
function layBridge(from, to, width = 2.6) {
  const path = spline([from, to], 3);
  for (const [x, y] of path) {
    disc(x, y, width / 2, BRIDGE, (c) => c === OCEAN);
    disc(x, y, width / 2, PATH, walkableForPath);
  }
}

/**
 * Towns are clusters, not grids.
 *
 * Each is a patch of ground where houses are likely; within it, any 4x4 of
 * clear grass can take one, subject to a die roll and a minimum gap. The
 * result reads as a settlement that grew rather than one that was planned,
 * which is the look this is going for.
 */
const TOWNS = [
  // `gap` is the closest two houses may sit, in tiles. Four means they may
  // share a wall, which is what the middle of a town should look like;
  // further out they stand apart in their own gardens.
  { name: 'core', cx: 74, cy: 75, r: 20, density: 0.95, gap: 6 },
  { name: 'northbasin', cx: 70, cy: 56, r: 13, density: 0.9, gap: 6 },
  { name: 'eastbasin', cx: 91, cy: 69, r: 10, density: 0.85, gap: 6 },
  { name: 'westbank', cx: 52, cy: 86, r: 14, density: 0.92, gap: 6 },
  { name: 'xindian', cx: 75, cy: 101, r: 9, density: 0.8, gap: 6 },
  { name: 'tamsui', cx: 41, cy: 45, r: 8, density: 0.8, gap: 6 },
  { name: 'xizhi', cx: 101, cy: 62, r: 9, density: 0.75, gap: 6 },
  { name: 'sanxia', cx: 40, cy: 105, r: 9, density: 0.75, gap: 6 },
  { name: 'northcoast', cx: 74, cy: 23, r: 8, density: 0.7, gap: 6 },
  { name: 'linkou', cx: 20, cy: 48, r: 8, density: 0.7, gap: 6 },
  { name: 'ridge', cx: 113, cy: 59, r: 8, density: 0.65, gap: 6 },
  // Smaller places, so the island does not empty out away from the basin.
  { name: 'southbasin', cx: 69, cy: 88, r: 9, density: 0.8, gap: 6 },
  { name: 'eastcoast', cx: 104, cy: 72, r: 8, density: 0.6, gap: 6 },
  { name: 'northshore', cx: 56, cy: 46, r: 7, density: 0.6, gap: 6 },
  { name: 'westshore', cx: 33, cy: 60, r: 7, density: 0.55, gap: 6 },
  { name: 'southvalley', cx: 60, cy: 100, r: 8, density: 0.6, gap: 6 },
  { name: 'farsouth', cx: 46, cy: 120, r: 7, density: 0.5, gap: 6 },
];

const taken = [];
let built = 0;
let considered = 0;

for (const town of TOWNS) {
  const plots = [];
  const reach = Math.ceil(town.r);
  for (let by = Math.floor((town.cy - reach) / 4) * 4; by <= town.cy + reach; by += 4) {
    for (let bx = Math.floor((town.cx - reach) / 4) * 4; bx <= town.cx + reach; bx += 4) {
      if (Math.hypot(bx + 2 - town.cx, by + 2 - town.cy) > town.r) continue;
      plots.push([bx, by]);
    }
  }
  // Densest in the middle, thinning towards the edge of the settlement.
  for (const [bx, by] of plots) {
    considered += 1;
    const falloff = 1 - Math.hypot(bx + 2 - town.cx, by + 2 - town.cy) / town.r;
    if (hash(bx, by, 0x5eed) >= town.density * (0.45 + falloff * 0.75)) continue;

    let clear = true;
    for (let y = by; y < by + 4 && clear; y += 1) {
      for (let x = bx; x < bx + 4; x += 1) {
        // A house may stand on the shore as happily as on the grass.
        if (at(x, y) !== GRASS && at(x, y) !== SAND) { clear = false; break; }
      }
    }
    if (!clear) continue;
    // Houses may stand corner to corner, which staggers a street pleasantly,
    // but never wall to wall: a row of those reads as one slab from above.
    const tooClose = taken.some(([tx, ty]) => {
      const dx = Math.abs(tx - bx);
      const dy = Math.abs(ty - by);
      return (dx < town.gap && dy < 2) || (dy < town.gap && dx < 2);
    });
    if (tooClose) continue;

    taken.push([bx, by]);
    built += 1;
    for (let y = by; y < by + 4; y += 1) {
      for (let x = bx; x < bx + 4; x += 1) set(x, y, BUILDING);
    }
  }
}

/**
 * Roads between the places worth walking to, kept off the riverbanks so the
 * water stays the thing you notice.
 */
const ROADS = [
  // Across the north of the basin.
  [[58, 54], [68, 53], [78, 53], [88, 55], [95, 58]],
  // Across the south of it.
  [[60, 83], [70, 83], [80, 82], [89, 79]],
  // Up the east edge, joining the two.
  [[97, 61], [100, 67], [100, 74], [95, 79]],
  // North over the volcanic group to the coast.
  [[64, 52], [64, 44], [64, 36], [68, 27], [73, 21]],
  // Down the west bank towards the port.
  [[47, 72], [43, 62], [40, 52], [38, 44]],
  // West to the plateau.
  [[45, 76], [36, 69], [27, 58], [21, 49]],
  // South-west towards the hill town.
  [[53, 89], [48, 96], [43, 102], [39, 107]],
  // South to the valley town.
  [[73, 88], [75, 94], [77, 100], [79, 106]],
  // South-east into the hills.
  [[91, 81], [97, 86], [103, 91], [107, 96]],
  // Out along the north-east ridges.
  [[102, 60], [111, 57], [119, 59], [127, 64]],
];

for (const points of ROADS) layRoad(points, 2.0);

/** One crossing per river reach, chosen to meet the banks square. */
const BRIDGES = [
  [[48, 68], [58, 62]],    // the big river, below the confluence
  [[42, 56], [52, 50]],    // the big river, up towards the mouth
  [[66, 56], [66, 76]],    // the Keelung, in the middle of the city
  [[80, 54], [80, 74]],    // the Keelung, further east
  [[92, 58], [92, 72]],    // the Keelung, out by the eastern town
  [[66, 80], [74, 86]],    // the southern river
  [[56, 82], [64, 88]],    // the south-western river
];

for (const [from, to] of BRIDGES) layBridge(from, to);

/* ------------------------------------------------------------------ */
/* Districts                                                           */
/* ------------------------------------------------------------------ */

/**
 * Districts are seed points, not rectangles.
 *
 * Sizes vary a lot, and that is correct rather than a bug to tune away: the
 * real districts range from a few square kilometres to a few hundred. What is
 * not acceptable is a district too small to notice, so every one of these is
 * checked by a test to own a usable patch of ground.
 *
 * Every walkable tile belongs to whichever seed is nearest *on foot* — the
 * assignment is a multi-source flood fill in map.ts, so rivers and ridges
 * become the borders by themselves. Rectangles were the earlier model and
 * they went wrong in three ways at once: they overlapped, so one name
 * silently hid another; they left three fifths of the island nameless; and
 * one of them (三川) was covered so completely that it could never be seen.
 *
 * A seed only has to be somewhere in the right part of the map. If it lands
 * on water or a cliff it is snapped to the nearest walkable tile below.
 */
// Preserve the old coverage sites so merging never redraws an old district.
const DISTRICT_SEEDS = [
  // The city proper.
  ['霧泉', 57, 51],
  ['北苑', 64, 59],
  ['舊埠', 61, 71],
  ['中樞', 70, 67],
  ['東埠', 81, 67],
  ['鏡湖', 88, 60],
  ['東關', 95, 73],
  ['城心', 68, 78],
  ['西埠', 59, 83],
  ['南苑', 79, 77],
  ['新衡', 88, 77],
  ['南嶺', 77, 90],

  // North coast, west to east.
  ['岬門', 52, 12],
  ['白沙', 47, 27],
  ['暖灣', 74, 23],
  ['潮岬', 86, 33],

  // The river mouth and the west.
  ['河口', 41, 44],
  ['西汀', 34, 52],
  ['高原', 19, 48],

  // The west bank of the basin. These sit across the river from the city
  // proper, so they are placed on the far bank rather than beside it.
  ['流洲', 50, 66],
  ['三川', 52, 72],
  ['五汊', 44, 68],
  ['平原', 38, 73],
  ['新埠', 46, 78],
  ['長橋', 54, 84],
  ['和川', 63, 89],
  ['石垣', 54, 93],
  ['青林', 44, 88],
  ['陶丘', 30, 93],

  // South, up the valley and into the range.
  ['溪源', 74, 100],
  ['谷口', 84, 87],
  ['岩門', 92, 95],
  ['茶嶺', 97, 107],
  ['霧谷', 69, 124],
  ['三澗', 44, 110],

  // East and north-east.
  ['雨關', 101, 62],
  ['溪燈', 104, 80],
  ['金脈', 116, 64],
  ['東岬', 128, 70],
];

/** Nearest walkable tile to a seed, so no district is stranded offshore. */
function snapToLand(x, y) {
  if (walkable(x, y)) return [x, y];
  for (let r = 1; r <= 24; r += 1) {
    let best = null;
    let bestDistance = Infinity;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!walkable(x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestDistance) {
          bestDistance = d;
          best = [x + dx, y + dy];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Spawn, and making sure the world is one piece                       */
/* ------------------------------------------------------------------ */

const WALKABLE = new Set([GRASS, SAND, PATH, BRIDGE, PARK]);
const walkable = (x, y) => inside(x, y) && WALKABLE.has(grid[y][x]);

function reachableFrom(sx, sy) {
  const seen = new Uint8Array(WIDTH * HEIGHT);
  const queue = [sy * WIDTH + sx];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % WIDTH;
    const y = (index - x) / WIDTH;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!walkable(nx, ny)) continue;
      const n = ny * WIDTH + nx;
      if (seen[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

// A plaza in the middle of the city centre, kept clear.
const SPAWN = { x: 68, y: 72 };
disc(SPAWN.x, SPAWN.y, 2.5, PATH, (c) => c !== OCEAN);

/**
 * Islands the player could never reach are scenery at best and a bug report at
 * worst. Anything the flood fill cannot get to becomes hillside instead.
 */
const reached = reachableFrom(SPAWN.x, SPAWN.y);
let stranded = 0;
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    if (!WALKABLE.has(grid[y][x])) continue;
    if (reached[y * WIDTH + x]) continue;
    grid[y][x] = HILL;
    stranded += 1;
  }
}

/* ------------------------------------------------------------------ */
/* Emit                                                                */
/* ------------------------------------------------------------------ */

const DISTRICT_MERGES = {
  "陶丘": [
    "陶丘"
  ],
  "岬門": [
    "岬門",
    "白沙"
  ],
  "潮岬": [
    "潮岬"
  ],
  "鏡湖": [
    "東埠",
    "鏡湖",
    "東關",
    "城心",
    "南苑",
    "新衡",
    "南嶺",
    "谷口",
    "岩門",
    "茶嶺",
    "霧谷",
    "溪燈"
  ],
  "三澗": [
    "和川",
    "石垣",
    "溪源",
    "三澗"
  ],
  "青林": [
    "長橋",
    "青林"
  ],
  "霧泉": [
    "霧泉"
  ],
  "暖灣": [
    "暖灣"
  ],
  "金脈": [
    "雨關",
    "金脈",
    "東岬"
  ],
  "北苑": [
    "北苑",
    "舊埠",
    "中樞"
  ],
  "西汀": [
    "西汀",
    "高原"
  ],
  "河口": [
    "河口"
  ],
  "平原": [
    "西埠",
    "流洲",
    "三川",
    "五汊",
    "平原",
    "新埠"
  ]
};

const DISTRICT_SITES = [];
for (const [name, x, y] of DISTRICT_SEEDS) {
  const seed = snapToLand(x, y);
  if (seed === null) {
    console.warn(`  ! no walkable tile near ${name} (${x}, ${y}); dropping it`);
    continue;
  }
  DISTRICT_SITES.push({ name, x: seed[0], y: seed[1] });
}

const members = Object.values(DISTRICT_MERGES).flat();
if (Object.keys(DISTRICT_MERGES).length !== 13 ||
    new Set(members).size !== members.length ||
    members.length !== DISTRICT_SITES.length ||
    DISTRICT_SITES.some(site => !members.includes(site.name))) {
  throw new Error('District merges must cover every former site exactly once in thirteen groups');
}

/** Retain the larger district's anchor and union the former coverage sites. */
const ZONES = Object.entries(DISTRICT_MERGES).map(([name, members]) => {
  const anchor = DISTRICT_SITES.find(site => site.name === name);
  if (!anchor || !members.includes(name)) throw new Error('Missing retained district: ' + name);
  const seeds = DISTRICT_SITES.flatMap((site, priority) => members.includes(site.name)
    ? [{ x: site.x, y: site.y, priority }] : []);
  return { ...anchor, seeds };
});

// Retain exactly the fifteen approved, maximally separated original plots.
const houseData = JSON.parse(readFileSync(join(mapDir, 'houses.json'), 'utf8'));
const retained = new Set(houseData.houses.map(({ x, y }) => x + ',' + y));
for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
  if (grid[y][x] !== BUILDING) continue;
  const key = Math.floor(x / 4) * 4 + ',' + Math.floor(y / 4) * 4;
  if (!retained.has(key)) grid[y][x] = GRASS;
}

// Road generation must not leave traversable slivers through a visible cottage.
for (const { x, y } of houseData.houses) {
  for (let yy = y; yy < y + 4; yy++) for (let xx = x; xx < x + 4; xx++) {
    grid[yy][xx] = BUILDING;
  }
}
const rows = grid.map((row) => row.join(''));


const town = {
  version: 3,
  name: 'Riverside Town',
  note:
    'Terrain at one character per tile. The island silhouette comes from ' +
    'coastline.txt; the rivers, hills, parks and streets on top of it are ' +
    'placed by scripts/build-map.mjs. Stylized, not a survey.',
  width: WIDTH,
  height: HEIGHT,
  cellTiles: 1,
  spawn: SPAWN,
  legend: {
    '.': 'grass',
    ',': 'sand',
    '~': 'water',
    '^': 'hill',
    '=': 'path',
    B: 'bridge',
    '#': 'building',
    '*': 'park',
  },
  grid: rows,
  zones: ZONES,
};

writeFileSync(join(mapDir, 'town.json'), `${JSON.stringify(town, null, 2)}\n`);

const counts = {};
for (const row of rows) for (const c of row) counts[c] = (counts[c] ?? 0) + 1;
const named = Object.fromEntries(
  Object.entries(counts).map(([c, n]) => [town.legend[c], n]),
);
const walkableCount = [...WALKABLE].reduce((sum, c) => sum + (counts[c] ?? 0), 0);

console.log(`${WIDTH} x ${HEIGHT} tiles`);
console.log('terrain:', named);
console.log(`walkable ${walkableCount}, stranded tiles turned to hillside: ${stranded}`);
console.log(`zones: ${ZONES.length}`);
console.log(`houses: ${houseData.houses.length} retained from ${built} built / ${considered} candidate plots`);

if (process.argv.includes('--preview')) {
  console.log();
  for (let y = 0; y < HEIGHT; y += 2) {
    console.log(
      String(y).padStart(3) + ' ' +
      Array.from({ length: Math.ceil(WIDTH / 2) }, (_, i) => rows[y][i * 2]).join(''),
    );
  }
}
