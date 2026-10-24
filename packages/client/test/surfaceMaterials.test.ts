import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getTownMap } from '@tland/shared';
import { cornerHeights } from '../src/three/ground.js';
import { groundMaterial, terrainColorTexture, shoreDepthTexture, waterMaterial } from '../src/three/surfaceMaterials.js';

describe('terrain appearance', () => {
  it('stores a compact linear palette and limits grass marks to planted terrain', () => {
    const map = getTownMap();
    const texture = terrainColorTexture(map);
    expect(texture.image.width).toBe(map.width);
    expect(texture.image.height).toBe(map.height);
    expect(texture.image.data.length).toBe(map.width * map.height * 4);
    expect(texture.generateMipmaps).toBe(false);
    for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
      const terrain = map.terrainAt(x, y);
      const alpha = texture.image.data[(y * map.width + x) * 4 + 3];
      expect(alpha).toBe(['grass', 'park', 'hill'].includes(terrain) ? 255 : terrain === 'bridge' ? 128 : 0);
    }
    texture.dispose();
  });

  it('keeps every walkable tile flat while adding visual terrain transitions', () => {
    const map = getTownMap();
    const heights = cornerHeights(map);
    for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
      if (!map.isWalkable(x, y)) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        expect(heights[(y + dy) * (map.width + 1) + x + dx]).toBe(0);
      }
    }
  });

  it('keeps land at zero shore depth and distant water at full depth within a small texture budget', () => {
    const map = getTownMap();
    const texture = shoreDepthTexture(map);
    const palette = terrainColorTexture(map);
    expect(texture.image.data.byteLength + palette.image.data.byteLength).toBe(map.width * map.height * 5);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.image.data.some(value => value === 255)).toBe(true);
    for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
      const depth = texture.image.data[y * map.width + x]!;
      if (map.terrainAt(x, y) === 'water') expect(depth).toBeGreaterThan(0);
      else expect(depth).toBe(0);
    }
    texture.dispose();
    palette.dispose();
  });

  it('releases both custom textures with their materials', () => {
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    try {
      const material = groundMaterial(getTownMap());
      material.dispose();
      waterMaterial(getTownMap()).dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally { dispose.mockRestore(); }
  });
});
