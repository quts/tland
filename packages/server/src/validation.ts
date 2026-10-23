import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  SPEED_TOLERANCE,
  TILE_SIZE,
  WALK_SPEED,
  getTownMap,
  sanitizeText,
} from '@tland/shared';

const map = getTownMap();

/** Half-size of a character's footprint, matching the client's collision box. */
const HALF_WIDTH = 8;
const HALF_HEIGHT = 5;

export const WORLD_WIDTH_PX = map.width * TILE_SIZE;
export const WORLD_HEIGHT_PX = map.height * TILE_SIZE;

/**
 * Could a character legitimately be standing here?
 *
 * The same footprint test the client uses, so a position the client considers
 * legal is never rejected and snapped back.
 */
export function isStandablePosition(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || y < 0 || x > WORLD_WIDTH_PX || y > WORLD_HEIGHT_PX) return false;

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

/**
 * How far a character may legitimately have travelled in `elapsedMs`.
 *
 * A floor of one tile absorbs the case where several moves arrive in the same
 * millisecond, which otherwise makes any movement look like a teleport.
 */
export function maxTravelDistance(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return Math.max(TILE_SIZE, WALK_SPEED * TILE_SIZE * seconds * SPEED_TOLERANCE);
}

export interface MoveCheck {
  readonly accepted: boolean;
  /** Where the player actually is after the check. */
  readonly x: number;
  readonly y: number;
}

/**
 * Validate a claimed position against the last accepted one.
 *
 * Rejected claims leave the player where they were; the caller sends a
 * correction so the client can snap back rather than drift out of sync.
 */
export function checkMove(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  elapsedMs: number,
): MoveCheck {
  if (!isStandablePosition(toX, toY)) {
    return { accepted: false, x: fromX, y: fromY };
  }
  const travelled = Math.hypot(toX - fromX, toY - fromY);
  if (travelled > maxTravelDistance(elapsedMs)) {
    return { accepted: false, x: fromX, y: fromY };
  }
  return { accepted: true, x: toX, y: toY };
}

/**
 * Clean up a nickname. Returns null when nothing usable is left.
 *
 * Length is measured in code points, so an emoji counts as one character
 * rather than two and a name of emoji cannot smuggle in extra length.
 */
export function normalizeNickname(raw: string): string | null {
  const cleaned = sanitizeText(raw, NICKNAME_MAX_LENGTH * 4);
  const codePoints = [...cleaned];
  if (codePoints.length < NICKNAME_MIN_LENGTH) return null;
  return codePoints.slice(0, NICKNAME_MAX_LENGTH).join('');
}
