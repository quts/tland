import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
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

  describe('spawn points', () => {
    it('are all somewhere a player can stand', () => {
      expect(map.spawnPoints.length).toBeGreaterThan(0);
      for (const point of map.spawnPoints) {
        expect(map.isWalkable(point.x, point.y)).toBe(true);
      }
    });

    it('are streets and plazas, not fields and beaches', () => {
      for (const point of map.spawnPoints) {
        expect(['path', 'park']).toContain(map.terrainAt(point.x, point.y));
      }
    });

    it('are spread over most of the island, not one district', () => {
      const districts = new Set(
        map.spawnPoints.map((point) => map.zoneAt(point.x, point.y)),
      );
      // Arriving should be able to put you in a lot of different places.
      expect(map.spawnPoints.length).toBeGreaterThan(300);
      expect(districts.size).toBeGreaterThanOrEqual(Math.ceil(map.zones.length * 0.75));
    });
  });

  it('treats everything outside the map as unwalkable', () => {
    expect(map.isWalkable(-1, 10)).toBe(false);
    expect(map.isWalkable(10, -1)).toBe(false);
    expect(map.isWalkable(map.width, 10)).toBe(false);
    expect(map.isWalkable(10, map.height)).toBe(false);
  });

  it('retains exactly the thirteen largest former districts', () => {
    expect(map.zones.map(zone => zone.name).sort()).toEqual(["陶丘","岬門","潮岬","鏡湖","三澗","青林","霧泉","暖灣","金脈","北苑","西汀","河口","平原"].sort());
  });

  it('keeps deterministic merged district ownership after reclaiming house plots', () => {
    // Same merged seed groups; reclaimed house footprints create new walking routes.
    // This fingerprint covers the fifteen-cottage collision terrain.
    const labels: string[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      labels.push((map.zoneAt(x, y) ?? '-') + '\n');
    }
    expect(createHash('sha256').update(labels.join('')).digest('hex')).toBe('007531050538d6ae667b51c4d7b28b1b62dfcc045c2ba2d164c43e30d9db1f85');
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
      // Merged districts should not regress to tiny strips of named ground.
      const MINIMUM_TILES = 100;
      const tooSmall = map.zones
        .map((zone) => [zone.name, owned.get(zone.name) ?? 0] as const)
        .filter(([, tiles]) => tiles < MINIMUM_TILES);
      expect(tooSmall).toEqual([]);
    });

    it('keeps every merged district connected on foot', () => {
      for (const zone of map.zones) {
        const seen = new Set<number>([zone.y * map.width + zone.x]);
        const queue = [...seen];
        for (let i = 0; i < queue.length; i++) {
          const index = queue[i]!, x = index % map.width, y = Math.floor(index / map.width);
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
            const next = ny * map.width + nx;
            if (seen.has(next) || map.zoneAt(nx, ny) !== zone.name) continue;
            seen.add(next); queue.push(next);
          }
        }
        expect(seen.size, zone.name).toBe(owned.get(zone.name));
      }
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
