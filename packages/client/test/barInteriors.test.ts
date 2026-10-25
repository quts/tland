import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAR_INTERIORS } from '../src/world/barInteriors.js';
import { HOUSE_DATA } from '../src/world/buildingLayout.js';

/** Read dimensions from the actual lossless WebP asset, not declared metadata. */
function dimensions(bytes: Buffer): { width: number; height: number } {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (bytes.toString('ascii', offset, offset + 4) === 'VP8L') {
      expect(bytes[offset + 8]).toBe(0x2f);
      const bits = bytes.readUInt32LE(offset + 9);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('Expected a native-resolution lossless WebP');
}

describe('bar interiors', () => {
  it('assigns each house a different standalone high-resolution image', () => {
    expect(BAR_INTERIORS.map(bar => bar.house)).toEqual(HOUSE_DATA.houses.map(h => h.name));
    expect(BAR_INTERIORS).toHaveLength(12);
    expect(new Set(BAR_INTERIORS.map(bar => bar.image)).size).toBe(12);
    expect(new Set(BAR_INTERIORS.map(bar => bar.style)).size).toBe(12);
  });
  it('ships all twelve as full-size lossless images instead of thumbnail windows', () => {
    for (const bar of BAR_INTERIORS) {
      const asset = readFileSync(new URL('../public' + bar.image, import.meta.url));
      const size = dimensions(asset);
      expect(size.width, bar.house).toBeGreaterThanOrEqual(1536);
      expect(size.height, bar.house).toBeGreaterThanOrEqual(1024);
    }
  });
});
