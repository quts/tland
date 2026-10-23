import { describe, expect, it } from 'vitest';
import { getTownMap } from '../src/map.js';
import { findPath } from '../src/pathfinding.js';
import { isBlockingProp, isWalkableTerrain } from '../src/terrain.js';

const map = getTownMap();

describe('town map', () => {
  it('expands to the documented tile size', () => {
    expect(map.width).toBe(136);
    expect(map.height).toBe(160);
  });

  it('is cached, not rebuilt per call', () => {
    expect(getTownMap()).toBe(map);
  });

  it('spawns the player somewhere they can stand', () => {
    expect(map.isWalkable(map.spawn.x, map.spawn.y)).toBe(true);
  });

  it('treats everything outside the map as unwalkable', () => {
    expect(map.isWalkable(-1, 10)).toBe(false);
    expect(map.isWalkable(10, -1)).toBe(false);
    expect(map.isWalkable(map.width, 10)).toBe(false);
    expect(map.isWalkable(10, map.height)).toBe(false);
  });

  it('names all twelve districts of the city proper', () => {
    const named = new Set(map.zones.map((zone) => zone.name));
    for (const district of [
      '中正', '大同', '中山', '松山', '大安', '萬華',
      '信義', '士林', '北投', '內湖', '南港', '文山',
    ]) {
      expect(named).toContain(district);
    }
  });

  it('also names the larger surrounding districts', () => {
    const named = new Set(map.zones.map((zone) => zone.name));
    for (const district of ['淡水', '板橋', '新店', '烏來', '三重', '鶯歌']) {
      expect(named).toContain(district);
    }
  });

  it('gives every zone a distinct name', () => {
    const names = map.zones.map((zone) => zone.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('puts every district on ground you can stand on', () => {
    for (const zone of map.zones) {
      expect(map.isWalkable(zone.x, zone.y)).toBe(true);
      expect(map.zoneAt(zone.x, zone.y)).toBe(zone.name);
    }
  });

  describe('district coverage', () => {
    // Walk the whole island once and count who owns what.
    const owned = new Map<string, number>();
    let walkable = 0;
    let unnamed = 0;
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (!map.isWalkable(x, y)) continue;
        walkable += 1;
        const zone = map.zoneAt(x, y);
        if (zone === null) {
          unnamed += 1;
          continue;
        }
        owned.set(zone, (owned.get(zone) ?? 0) + 1);
      }
    }

    it('leaves no walkable tile without a district', () => {
      expect(unnamed).toBe(0);
      expect(walkable).toBeGreaterThan(0);
    });

    it('gives every district enough ground to be noticed', () => {
      // A district smaller than this is crossed before its banner is read,
      // which is how 三重 came to exist on the map but never be seen.
      const MINIMUM_TILES = 25;
      const tooSmall = map.zones
        .map((zone) => [zone.name, owned.get(zone.name) ?? 0] as const)
        .filter(([, tiles]) => tiles < MINIMUM_TILES);
      expect(tooSmall).toEqual([]);
    });

    it('cannot hide one district underneath another', () => {
      // Every district owns ground, and the ground sums to the whole island —
      // so no two can be claiming the same tile.
      expect(owned.size).toBe(map.zones.length);
      expect([...owned.values()].reduce((a, b) => a + b, 0)).toBe(walkable);
    });
  });

  it('is an island: sea on every corner, and sea most of the way round', () => {
    for (const [x, y] of [
      [0, 0],
      [map.width - 1, 0],
      [0, map.height - 1],
      [map.width - 1, map.height - 1],
    ]) {
      expect(map.terrainAt(x as number, y as number)).toBe('water');
    }

    let edge = 0;
    let sea = 0;
    for (let x = 0; x < map.width; x += 1) {
      for (const y of [0, map.height - 1]) {
        edge += 1;
        if (map.terrainAt(x, y) === 'water') sea += 1;
      }
    }
    for (let y = 0; y < map.height; y += 1) {
      for (const x of [0, map.width - 1]) {
        edge += 1;
        if (map.terrainAt(x, y) === 'water') sea += 1;
      }
    }
    // The outline brushes the frame in a couple of places; it must not be
    // anywhere near running off it.
    expect(sea / edge).toBeGreaterThan(0.97);
  });

  it('is mostly sea, as an island should be', () => {
    let water = 0;
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (map.terrainAt(x, y) === 'water') water += 1;
      }
    }
    expect(water / (map.width * map.height)).toBeGreaterThan(0.5);
  });

  it('includes water, hills and bridges', () => {
    const seen = new Set<string>();
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) seen.add(map.terrainAt(x, y));
    }
    expect(seen).toContain('water');
    expect(seen).toContain('hill');
    expect(seen).toContain('bridge');
    expect(seen).toContain('building');
    expect(seen).toContain('park');
  });

  it('never leaves a blocking prop on unwalkable terrain', () => {
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (isBlockingProp(map.propAt(x, y))) {
          expect(isWalkableTerrain(map.terrainAt(x, y))).toBe(true);
        }
      }
    }
  });

  it('leaves every walkable tile reachable from the spawn', () => {
    const reached = new Set<number>();
    const start = map.spawn.y * map.width + map.spawn.x;
    const queue = [start];
    reached.add(start);

    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      const x = index % map.width;
      const y = (index - x) / map.width;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (!map.isWalkable(nx as number, ny as number)) continue;
        const neighbor = (ny as number) * map.width + (nx as number);
        if (reached.has(neighbor)) continue;
        reached.add(neighbor);
        queue.push(neighbor);
      }
    }

    const stranded: string[] = [];
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (map.isWalkable(x, y) && !reached.has(y * map.width + x)) {
          stranded.push(`${x},${y}`);
        }
      }
    }
    expect(stranded).toEqual([]);
  });

  it('can be walked from the spawn to the far side of the map', () => {
    // (51, 3) is the walkable tile furthest from the spawn, out on the
    // northern cape.
    const path = findPath(
      map.width,
      map.height,
      map.spawn,
      { x: 51, y: 3 },
      { isWalkable: map.isWalkable, maxNodes: 60_000 },
    );
    expect(path).not.toBeNull();
    expect((path as { x: number; y: number }[]).length).toBeGreaterThan(10);
  });
});
