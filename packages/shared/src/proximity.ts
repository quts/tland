import {
  PROXIMITY_ENTER_RADIUS,
  PROXIMITY_EXIT_RADIUS,
  TILE_SIZE,
} from './constants.js';

export interface PositionedEntity {
  readonly id: string;
  /** World pixels. */
  readonly x: number;
  readonly y: number;
}

/** Order-independent key, so one entry covers both directions of a pair. */
function pairKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

/**
 * Who can hear whom, with hysteresis.
 *
 * A pair comes into range at `enterRadius` and only drops out at the wider
 * `exitRadius`. Without that gap, two people standing almost exactly at the
 * threshold would flicker in and out of earshot every tick, and their bubbles
 * would blink.
 */
export class ProximityTracker {
  private readonly inRange = new Set<string>();
  private readonly enterDistanceSquared: number;
  private readonly exitDistanceSquared: number;

  constructor(
    enterRadiusTiles: number = PROXIMITY_ENTER_RADIUS,
    exitRadiusTiles: number = PROXIMITY_EXIT_RADIUS,
  ) {
    if (exitRadiusTiles < enterRadiusTiles) {
      throw new Error('the exit radius must not be smaller than the enter radius');
    }
    this.enterDistanceSquared = (enterRadiusTiles * TILE_SIZE) ** 2;
    this.exitDistanceSquared = (exitRadiusTiles * TILE_SIZE) ** 2;
  }

  /** Recompute every pair. Call once per tick with the current positions. */
  update(entities: readonly PositionedEntity[]): void {
    const live = new Set<string>();

    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const a = entities[i] as PositionedEntity;
        const b = entities[j] as PositionedEntity;
        const key = pairKey(a.id, b.id);
        live.add(key);

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distanceSquared = dx * dx + dy * dy;

        if (this.inRange.has(key)) {
          if (distanceSquared > this.exitDistanceSquared) this.inRange.delete(key);
        } else if (distanceSquared <= this.enterDistanceSquared) {
          this.inRange.add(key);
        }
      }
    }

    // Forget pairs involving anyone who has left, so the set cannot grow
    // without bound on a long-running server.
    for (const key of this.inRange) {
      if (!live.has(key)) this.inRange.delete(key);
    }
  }

  /** Can `a` hear `b` right now? */
  canHear(a: string, b: string): boolean {
    if (a === b) return true;
    return this.inRange.has(pairKey(a, b));
  }

  /** Drop every pair involving `id`, when they disconnect. */
  forget(id: string): void {
    for (const key of this.inRange) {
      const separator = key.indexOf('|');
      if (key.slice(0, separator) === id || key.slice(separator + 1) === id) {
        this.inRange.delete(key);
      }
    }
  }

  /** Number of pairs currently in range. Exposed for tests. */
  get pairCount(): number {
    return this.inRange.size;
  }
}
