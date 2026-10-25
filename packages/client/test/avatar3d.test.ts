import { describe, expect, it } from 'vitest';
import { cameraBasis, CAMERA_TAG_HEADROOM } from '../src/three/cameraRig.js';
import {
  AVATAR_SCALE, AVATAR_TOP, characterArmGeometry, characterBodyGeometry,
} from '../src/three/avatar3d.js';

describe('avatar geometry', () => {
  it('stands on the ground and fits below its overlay anchor', () => {
    const geometry = characterBodyGeometry();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.max.y * AVATAR_SCALE).toBeLessThan(AVATAR_TOP);
    expect(bounds.min.y).toBeGreaterThan(-0.01);
    expect(bounds.min.y).toBeLessThan(0.01);
  });

  it('carries a part number and a brightness for every vertex', () => {
    for (const geometry of [characterBodyGeometry(), characterArmGeometry()]) {
      const vertices = geometry.getAttribute('position');
      const colors = geometry.getAttribute('color');
      const parts = geometry.getAttribute('partId');
      expect(colors.count).toBe(vertices.count);
      expect(parts.count).toBe(vertices.count);
      expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < parts.count; i += 1) {
        expect(Number.isInteger(parts.getX(i))).toBe(true);
        expect(parts.getX(i)).toBeGreaterThanOrEqual(0);
        expect(parts.getX(i)).toBeLessThan(7);
        // The vertex colour is grey: it is a brightness, not a colour.
        expect(colors.getY(i)).toBeCloseTo(colors.getX(i), 10);
        expect(colors.getZ(i)).toBeCloseTo(colors.getX(i), 10);
      }
    }
  });

  it('keeps the name anchor above the hat at the lower camera angle', () => {
    const up = cameraBasis().up;
    const anchor = (AVATAR_TOP + CAMERA_TAG_HEADROOM) * up.y;
    const vertices = characterBodyGeometry().getAttribute('position');
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (let i = 0; i < vertices.count; i += 1) {
        const z = vertices.getZ(i) * Math.cos(heading) - vertices.getX(i) * Math.sin(heading);
        const projected = (vertices.getY(i) * up.y + z * up.z) * AVATAR_SCALE;
        expect(projected).toBeLessThan(anchor);
      }
    }
  });
});
