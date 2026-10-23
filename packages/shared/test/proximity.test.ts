import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../src/constants.js';
import { ProximityTracker } from '../src/proximity.js';

/** Two players `tiles` apart on the x axis. */
function pair(tiles: number) {
  return [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: tiles * TILE_SIZE, y: 0 },
  ];
}

describe('ProximityTracker', () => {
  it('rejects an exit radius smaller than the enter radius', () => {
    expect(() => new ProximityTracker(4, 3)).toThrow();
  });

  it('brings a pair into range at the enter radius', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(2.9));
    expect(tracker.canHear('a', 'b')).toBe(true);
    expect(tracker.canHear('b', 'a')).toBe(true);
  });

  it('leaves a pair out of range beyond the enter radius', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(3.5));
    expect(tracker.canHear('a', 'b')).toBe(false);
  });

  it('includes the enter radius exactly', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(3));
    expect(tracker.canHear('a', 'b')).toBe(true);
  });

  it('keeps a pair in range between the two radii', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(2));
    tracker.update(pair(3.5));
    // Past the enter radius, but not yet past the exit radius.
    expect(tracker.canHear('a', 'b')).toBe(true);
  });

  it('drops a pair only past the exit radius', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(2));
    tracker.update(pair(4));
    expect(tracker.canHear('a', 'b')).toBe(true);
    tracker.update(pair(4.1));
    expect(tracker.canHear('a', 'b')).toBe(false);
  });

  it('does not flicker while a pair hovers in the hysteresis band', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(2.9));
    for (const distance of [3.1, 3.9, 3.2, 3.8, 3.5]) {
      tracker.update(pair(distance));
      expect(tracker.canHear('a', 'b')).toBe(true);
    }
  });

  it('needs the full enter radius again after dropping out', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(2));
    tracker.update(pair(5));
    expect(tracker.canHear('a', 'b')).toBe(false);
    tracker.update(pair(3.5));
    // Inside the exit radius, but re-entry demands the enter radius.
    expect(tracker.canHear('a', 'b')).toBe(false);
    tracker.update(pair(2.9));
    expect(tracker.canHear('a', 'b')).toBe(true);
  });

  it('measures distance in two dimensions', () => {
    const tracker = new ProximityTracker(3, 4);
    // 3,3 tiles apart is about 4.24 tiles, past the enter radius.
    tracker.update([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 3 * TILE_SIZE, y: 3 * TILE_SIZE },
    ]);
    expect(tracker.canHear('a', 'b')).toBe(false);
  });

  it('treats a player as able to hear themselves', () => {
    const tracker = new ProximityTracker();
    expect(tracker.canHear('a', 'a')).toBe(true);
  });

  it('keeps each pair independent', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update([
      { id: 'a', x: 0, y: 0 },
      { id: 'near', x: TILE_SIZE, y: 0 },
      { id: 'far', x: 40 * TILE_SIZE, y: 0 },
    ]);
    expect(tracker.canHear('a', 'near')).toBe(true);
    expect(tracker.canHear('a', 'far')).toBe(false);
    expect(tracker.canHear('near', 'far')).toBe(false);
  });

  it('forgets a player who disconnects', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(1));
    expect(tracker.pairCount).toBe(1);
    tracker.forget('b');
    expect(tracker.canHear('a', 'b')).toBe(false);
    expect(tracker.pairCount).toBe(0);
  });

  it('drops pairs for anyone missing from an update', () => {
    const tracker = new ProximityTracker(3, 4);
    tracker.update(pair(1));
    expect(tracker.pairCount).toBe(1);
    tracker.update([{ id: 'a', x: 0, y: 0 }]);
    expect(tracker.pairCount).toBe(0);
  });

  it('handles an empty world', () => {
    const tracker = new ProximityTracker();
    expect(() => tracker.update([])).not.toThrow();
    expect(tracker.pairCount).toBe(0);
  });
});
