import { TILE_SIZE, WALK_SPEED, type TownMap } from '@tland/shared';

/** Half-size of the character's footprint, in pixels. */
const HALF_WIDTH = 8;
const HALF_HEIGHT = 5;

/** Speed in pixels per second. */
export const WALK_SPEED_PX = WALK_SPEED * TILE_SIZE;

/**
 * Can the character's feet occupy this world position?
 *
 * The footprint is a small box at the feet rather than the whole sprite, so a
 * character can tuck in beside a building the way their shadow suggests.
 */
export function canStand(map: TownMap, x: number, y: number): boolean {
  const left = Math.floor((x - HALF_WIDTH) / TILE_SIZE);
  const right = Math.floor((x + HALF_WIDTH - 0.001) / TILE_SIZE);
  const top = Math.floor((y - HALF_HEIGHT) / TILE_SIZE);
  const bottom = Math.floor((y + HALF_HEIGHT - 0.001) / TILE_SIZE);

  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      if (!map.isWalkable(tileX, tileY)) return false;
    }
  }
  return true;
}

export interface MoveResult {
  readonly x: number;
  readonly y: number;
  /** True when the full requested movement was blocked on both axes. */
  readonly blocked: boolean;
}

/**
 * Move with wall sliding: try both axes together, then each on its own.
 *
 * Sliding is what makes a joystick feel right — pushing diagonally into a wall
 * should slide along it instead of stopping dead.
 */
export function moveWithCollision(
  map: TownMap,
  x: number,
  y: number,
  dx: number,
  dy: number,
): MoveResult {
  if (dx === 0 && dy === 0) return { x, y, blocked: false };

  if (canStand(map, x + dx, y + dy)) {
    return { x: x + dx, y: y + dy, blocked: false };
  }
  if (dx !== 0 && canStand(map, x + dx, y)) {
    return { x: x + dx, y, blocked: false };
  }
  if (dy !== 0 && canStand(map, x, y + dy)) {
    return { x, y: y + dy, blocked: false };
  }
  return { x, y, blocked: true };
}

/** Centre of a tile, in world pixels. */
export function tileCenter(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function toTile(worldX: number, worldY: number): { x: number; y: number } {
  return { x: Math.floor(worldX / TILE_SIZE), y: Math.floor(worldY / TILE_SIZE) };
}
