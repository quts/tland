/** A tile coordinate. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PathOptions {
  /** Walkability test for a single tile. */
  isWalkable(x: number, y: number): boolean;
  /** Give up after expanding this many nodes, so a sealed target cannot hang. */
  maxNodes?: number;
}

const STRAIGHT_COST = 10;
// Diagonals cost sqrt(2); integer weights keep the comparisons exact.
const DIAGONAL_COST = 14;

const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, STRAIGHT_COST],
  [-1, 0, STRAIGHT_COST],
  [0, 1, STRAIGHT_COST],
  [0, -1, STRAIGHT_COST],
  [1, 1, DIAGONAL_COST],
  [1, -1, DIAGONAL_COST],
  [-1, 1, DIAGONAL_COST],
  [-1, -1, DIAGONAL_COST],
];

/** Octile distance — the exact cost of an unobstructed 8-way walk. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (
    STRAIGHT_COST * (dx + dy) + (DIAGONAL_COST - 2 * STRAIGHT_COST) * Math.min(dx, dy)
  );
}

/** A binary min-heap keyed on f-score. */
class NodeHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.values.push(value);
    let index = this.keys.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if ((this.keys[parent] as number) <= (this.keys[index] as number)) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  pop(): number | undefined {
    if (this.keys.length === 0) return undefined;
    const top = this.values[0] as number;
    const lastKey = this.keys.pop() as number;
    const lastValue = this.values.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let index = 0;
      for (;;) {
        const left = 2 * index + 1;
        const right = left + 1;
        let smallest = index;
        if (
          left < this.keys.length &&
          (this.keys[left] as number) < (this.keys[smallest] as number)
        ) {
          smallest = left;
        }
        if (
          right < this.keys.length &&
          (this.keys[right] as number) < (this.keys[smallest] as number)
        ) {
          smallest = right;
        }
        if (smallest === index) break;
        this.swap(smallest, index);
        index = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const key = this.keys[a] as number;
    const value = this.values[a] as number;
    this.keys[a] = this.keys[b] as number;
    this.values[a] = this.values[b] as number;
    this.keys[b] = key;
    this.values[b] = value;
  }
}

/**
 * A* over the tile grid, 8-way.
 *
 * Returns the tiles to walk through, excluding the start and including the
 * goal, or `null` when there is no route. Diagonal steps are only allowed when
 * both orthogonal neighbours are clear, so a character never slips between the
 * corners of two buildings.
 */
export function findPath(
  width: number,
  height: number,
  start: Point,
  goal: Point,
  options: PathOptions,
): Point[] | null {
  const { isWalkable } = options;
  const maxNodes = options.maxNodes ?? 20_000;

  if (!isWalkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const total = width * height;
  const index = (x: number, y: number): number => y * width + x;
  const gScore = new Int32Array(total).fill(-1);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const startIndex = index(start.x, start.y);
  gScore[startIndex] = 0;

  const open = new NodeHeap();
  open.push(heuristic(start.x, start.y, goal.x, goal.y), startIndex);

  const goalIndex = index(goal.x, goal.y);
  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop() as number;
    if (closed[current] === 1) continue;
    closed[current] = 1;

    if (current === goalIndex) {
      const path: Point[] = [];
      for (let node = goalIndex; node !== startIndex; node = cameFrom[node] as number) {
        const x = node % width;
        path.push({ x, y: (node - x) / width });
      }
      return path.reverse();
    }

    expanded += 1;
    if (expanded > maxNodes) return null;

    const cx = current % width;
    const cy = (current - cx) / width;

    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!isWalkable(nx, ny)) continue;
      // No corner cutting: a diagonal needs both of its sides open.
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(cx + dx, cy) || !isWalkable(cx, cy + dy)) continue;
      }

      const neighbor = index(nx, ny);
      if (closed[neighbor] === 1) continue;

      const tentative = (gScore[current] as number) + cost;
      const existing = gScore[neighbor] as number;
      if (existing !== -1 && tentative >= existing) continue;

      gScore[neighbor] = tentative;
      cameFrom[neighbor] = current;
      open.push(tentative + heuristic(nx, ny, goal.x, goal.y), neighbor);
    }
  }

  return null;
}

/**
 * Nearest walkable tile to a target, searched outward in rings.
 *
 * A tap often lands on a building or in the river; walking to the edge of it
 * is friendlier than ignoring the tap.
 */
export function nearestWalkable(
  width: number,
  height: number,
  target: Point,
  isWalkable: (x: number, y: number) => boolean,
  maxRadius = 6,
): Point | null {
  if (isWalkable(target.x, target.y)) return target;

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        // Only the ring, not the filled square we already searched.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = target.x + dx;
        const y = target.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (!isWalkable(x, y)) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }
    if (best !== null) return best;
  }

  return null;
}
