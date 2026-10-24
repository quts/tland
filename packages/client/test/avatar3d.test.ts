import { describe, expect, it } from 'vitest';
import { ACCESSORIES, HATS } from '../src/gfx/avatar.js';
import { AVATAR_SCALE, AVATAR_TOP, AvatarGeometryCache, buildAvatarGeometry } from '../src/three/avatar3d.js';

describe('avatar geometry', () => {
  it('fits every outfit below its overlay anchor with finite vertices and ground contact', () => {
    for (const hat of HATS) for (const accessory of ACCESSORIES) {
      const geometry = buildAvatarGeometry({ body: 0, shirt: 4, hat, accessory });
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      expect(bounds.max.y * AVATAR_SCALE, hat + '/' + accessory).toBeLessThan(AVATAR_TOP);
      expect(bounds.min.y).toBeGreaterThan(-0.01);
      expect(bounds.min.y).toBeLessThan(0.01);
      const vertices = geometry.getAttribute('position');
      const colors = geometry.getAttribute('color');
      expect(colors.count).toBe(vertices.count);
      expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
  });

  it('shares geometry only for identical outfits', () => {
    const cache = new AvatarGeometryCache();
    const outfit = { body: 0, shirt: 4, hat: 'sunhat', accessory: 'scarf' } as const;
    expect(cache.get(outfit)).toBe(cache.get({ ...outfit }));
    expect(cache.get(outfit)).not.toBe(cache.get({ ...outfit, hat: 'none' }));
    cache.dispose();
  });
});
