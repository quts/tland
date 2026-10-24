import { describe, expect, it } from 'vitest';
import { cameraBasis, CAMERA_TAG_HEADROOM } from '../src/three/cameraRig.js';
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

  it('keeps the name anchor above every projected hat at the lower camera angle', () => {
    const up = cameraBasis().up;
    const anchor = (AVATAR_TOP + CAMERA_TAG_HEADROOM) * up.y;
    for (const hat of HATS) {
      const geometry = buildAvatarGeometry({ body: 0, shirt: 4, hat, accessory: 'scarf' });
      const vertices = geometry.getAttribute('position');
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        for (let i = 0; i < vertices.count; i++) {
          const z = vertices.getZ(i) * Math.cos(heading) - vertices.getX(i) * Math.sin(heading);
          const projected = (vertices.getY(i) * up.y + z * up.z) * AVATAR_SCALE;
          expect(projected, hat).toBeLessThan(anchor);
        }
      }
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
