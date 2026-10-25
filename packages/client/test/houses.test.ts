import { describe, expect, it } from 'vitest';
import { getTownMap, isWalkableTerrain } from '@tland/shared';
import { BUILDING_CELL, HOUSE_DATA, HOUSE_NAMES, HOUSE_COLORS, buildingPlots } from '../src/world/buildingLayout.js';
import { houseGeometry } from '../src/three/house.js';

const map = getTownMap();
const squareDistance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

describe('fifteen named cottages', () => {
  it('uses exactly the requested names and fifteen complete collision footprints', () => {
    expect(HOUSE_NAMES).toEqual([
      'Wilson House', 'Engelbart House', 'Moore House', 'Berners-Lee House', 'Hopper House',
      'Dijkstra House', 'Huffman House', 'von Neumann House', 'Turing House', 'Hawkins House',
      'Cooper House', 'Dell House', 'Shockley House', 'Steve House', 'Jeff House',
    ]);
    expect(buildingPlots(map)).toHaveLength(15);
    let count = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (map.terrainAt(x, y) === 'building') count++;
    }
    expect(count).toBe(15 * BUILDING_CELL ** 2);
    for (const house of buildingPlots(map)) {
      for (let y = house.y; y < house.y + 4; y++) for (let x = house.x; x < house.x + 4; x++) {
        expect(map.terrainAt(x, y)).toBe('building');
        expect(map.isWalkable(x, y)).toBe(false);
      }
      expect([house.x + 1, house.x + 2].some(x => map.isWalkable(x, house.y + 4))).toBe(true);
    }
  });

  it('reclaims removed buildings as walkable terrain rather than invisible obstacles', () => {
    for (const old of HOUSE_DATA.selection.originalPlots) {
      if (HOUSE_DATA.houses.some(h => h.x === old.x && h.y === old.y)) continue;
      for (let y = old.y; y < old.y + 4; y++) for (let x = old.x; x < old.x + 4; x++) {
        expect(isWalkableTerrain(map.terrainAt(x, y))).toBe(true);
      }
    }
  });

  it('maximizes the minimum Euclidean distance among the original 28 plots exactly', () => {
    const points = HOUSE_DATA.selection.originalPlots;
    const chosen = HOUSE_DATA.houses;
    expect(new Set(chosen.map(p => p.x + ',' + p.y)).size).toBe(15);
    for (const house of chosen) expect(points.some(p => p.x === house.x && p.y === house.y)).toBe(true);
    const distances = chosen.flatMap((a, i) => chosen.slice(i + 1).map(b => squareDistance(a, b)));
    expect(Math.min(...distances)).toBe(128);
    // All squared distances are multiples of 16: improving 128 requires >=144.
    // Prove infeasibility via an exact 15-clique search in the compatibility graph.
    const adjacent = points.map((a, i) => points.reduce((mask, b, j) =>
      i !== j && squareDistance(a, b) >= 144 ? mask | (1 << j) : mask, 0));
    const population = (n: number): number => {
      let count = 0;
      while (n) { n &= n - 1; count++; }
      return count;
    };
    const feasible = (candidates: number, needed: number): boolean => {
      if (needed === 0) return true;
      while (population(candidates) >= needed) {
        const bit = candidates & -candidates;
        candidates ^= bit;
        const i = 31 - Math.clz32(bit);
        if (feasible(candidates & adjacent[i]!, needed - 1)) return true;
      }
      return false;
    };
    expect(feasible((1 << points.length) - 1, 15)).toBe(false);
  });

  it('uses identical geometry for all thirteen reference color schemes', () => {
    const baseline = houseGeometry(0);
    const positions = baseline.getAttribute('position');
    baseline.computeBoundingBox();
    expect(baseline.boundingBox!.min.x).toBeGreaterThanOrEqual(-2);
    expect(baseline.boundingBox!.max.x).toBeLessThanOrEqual(2);
    expect(baseline.boundingBox!.min.z).toBeGreaterThanOrEqual(-2);
    expect(baseline.boundingBox!.max.z).toBeLessThanOrEqual(2);
    expect(positions.count / 3).toBeLessThan(15_000);
    for (let variant = 1; variant < HOUSE_COLORS.length; variant++) {
      const next = houseGeometry(variant);
      expect(next.getAttribute('position').array).toEqual(positions.array);
      expect(next.getAttribute('normal').array).toEqual(baseline.getAttribute('normal').array);
      next.dispose();
    }
    baseline.dispose();
  });
});
