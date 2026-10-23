import { describe, expect, it } from 'vitest';
import { getTownMap } from '../src/map.js';
import { findPath } from '../src/pathfinding.js';
import { isBlockingProp, isWalkableTerrain } from '../src/terrain.js';

const map = getTownMap();

describe('town map', () => {
  it('expands to the documented tile size', () => {
    expect(map.width).toBe(160);
    expect(map.height).toBe(120);
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

  it('names all twelve districts', () => {
    expect(map.zones.map((zone) => zone.name).sort()).toEqual(
      [
        '中正',
        '大同',
        '中山',
        '松山',
        '大安',
        '萬華',
        '信義',
        '士林',
        '北投',
        '內湖',
        '南港',
        '文山',
      ].sort(),
    );
  });

  it('reports the district under a tile inside a zone', () => {
    const zone = map.zones[0];
    expect(zone).toBeDefined();
    expect(map.zoneAt(zone!.x, zone!.y)).toBe(zone!.name);
    expect(map.zoneAt(zone!.x + zone!.width - 1, zone!.y + zone!.height - 1)).toBe(
      zone!.name,
    );
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
    // (159, 28) is the walkable tile furthest from the spawn, up in 內湖.
    const path = findPath(
      map.width,
      map.height,
      map.spawn,
      { x: 159, y: 28 },
      { isWalkable: map.isWalkable, maxNodes: 60_000 },
    );
    expect(path).not.toBeNull();
    expect((path as { x: number; y: number }[]).length).toBeGreaterThan(10);
  });
});
