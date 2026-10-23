import { describe, expect, it } from 'vitest';
import { findPath, nearestWalkable, type Point } from '../src/pathfinding.js';

/**
 * Build a walkability test from an ASCII map. `#` blocks, everything else is
 * open; this keeps each case readable as a picture of the situation.
 */
function gridFrom(rows: string[]) {
  const height = rows.length;
  const width = (rows[0] as string).length;
  for (const row of rows) {
    if (row.length !== width) throw new Error('ragged test grid');
  }
  return {
    width,
    height,
    isWalkable: (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < width && y < height && (rows[y] as string)[x] !== '#',
  };
}

function walk(rows: string[], start: Point, goal: Point): Point[] | null {
  const grid = gridFrom(rows);
  return findPath(grid.width, grid.height, start, goal, {
    isWalkable: grid.isWalkable,
  });
}

/** Every step must be adjacent to the last, and on an open tile. */
function assertContiguous(rows: string[], start: Point, path: Point[]): void {
  const grid = gridFrom(rows);
  let previous = start;
  for (const step of path) {
    const dx = Math.abs(step.x - previous.x);
    const dy = Math.abs(step.y - previous.y);
    expect(Math.max(dx, dy)).toBe(1);
    expect(grid.isWalkable(step.x, step.y)).toBe(true);
    previous = step;
  }
}

describe('findPath', () => {
  it('returns an empty path when already at the goal', () => {
    expect(walk(['...', '...', '...'], { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });

  it('excludes the start and includes the goal', () => {
    const path = walk(['....'], { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('takes the diagonal across open ground', () => {
    const rows = ['....', '....', '....', '....'];
    const path = walk(rows, { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(path).toHaveLength(3);
    assertContiguous(rows, { x: 0, y: 0 }, path as Point[]);
  });

  it('routes around a wall', () => {
    const rows = ['.....', '.###.', '.....'];
    const start = { x: 0, y: 1 };
    const goal = { x: 4, y: 1 };
    const path = walk(rows, start, goal);
    expect(path).not.toBeNull();
    assertContiguous(rows, start, path as Point[]);
    for (const step of path as Point[]) {
      expect(`${step.x},${step.y}`).not.toBe('2,1');
    }
  });

  it('returns null when the goal is walled off', () => {
    const rows = ['.....', '.###.', '.#.#.', '.###.', '.....'];
    expect(walk(rows, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it('returns null when the goal itself is blocked', () => {
    expect(walk(['...', '.#.', '...'], { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('returns null when the goal is outside the grid', () => {
    expect(walk(['...', '...'], { x: 0, y: 0 }, { x: 9, y: 9 })).toBeNull();
  });

  it('refuses to cut the corner between two blocks', () => {
    // Moving 0,0 -> 1,1 diagonally would squeeze between the two walls.
    const rows = ['.#', '#.'];
    expect(walk(rows, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('allows a diagonal when only one side is blocked', () => {
    const rows = ['.#', '..'];
    const path = walk(rows, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(path).not.toBeNull();
    assertContiguous(rows, { x: 0, y: 0 }, path as Point[]);
  });

  it('finds the shortest route through a gap', () => {
    const rows = [
      '..........',
      '.########.',
      '.#......#.',
      '.#.####.#.',
      '.#.#..#.#.',
      '.#.#..#.#.',
      '.#.####.#.',
      '.#......#.',
      '.########.',
      '..........',
    ];
    // The inner chamber has no opening at all.
    expect(walk(rows, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull();
  });

  it('honours maxNodes instead of searching a large map forever', () => {
    const rows = Array.from({ length: 40 }, () => '.'.repeat(40));
    const grid = gridFrom(rows);
    const path = findPath(
      grid.width,
      grid.height,
      { x: 0, y: 0 },
      { x: 39, y: 39 },
      { isWalkable: grid.isWalkable, maxNodes: 3 },
    );
    expect(path).toBeNull();
  });

  it('produces a contiguous path through a maze', () => {
    const rows = [
      '..........',
      '#########.',
      '..........',
      '.#########',
      '..........',
      '#########.',
      '..........',
    ];
    const start = { x: 0, y: 0 };
    const goal = { x: 0, y: 6 };
    const path = walk(rows, start, goal);
    expect(path).not.toBeNull();
    assertContiguous(rows, start, path as Point[]);
    expect(path?.at(-1)).toEqual(goal);
  });
});

describe('nearestWalkable', () => {
  const rows = ['.....', '.###.', '.###.', '.###.', '.....'];
  const grid = gridFrom(rows);
  const near = (target: Point, maxRadius?: number) =>
    nearestWalkable(grid.width, grid.height, target, grid.isWalkable, maxRadius);

  it('returns the target when it is already walkable', () => {
    expect(near({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('steps off a blocked tile to the closest open one', () => {
    const found = near({ x: 1, y: 1 });
    expect(found).not.toBeNull();
    expect(grid.isWalkable((found as Point).x, (found as Point).y)).toBe(true);
    const distance =
      Math.abs((found as Point).x - 1) + Math.abs((found as Point).y - 1);
    expect(distance).toBe(1);
  });

  it('gives up rather than searching the whole map', () => {
    expect(near({ x: 2, y: 2 }, 0)).toBeNull();
  });

  it('ignores tiles outside the grid', () => {
    const found = near({ x: -3, y: -3 });
    expect(found).toEqual({ x: 0, y: 0 });
  });
});
