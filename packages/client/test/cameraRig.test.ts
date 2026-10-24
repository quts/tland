import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOV_DEG,
  cameraDistance,
  cameraOffset,
  joystickToWorld,
  tilesAcross,
} from '../src/three/cameraRig.js';

describe('3D camera rig', () => {
  it('shows as many tiles across as the 2D camera does', () => {
    expect(tilesAcross(390)).toBe(15);
    expect(tilesAcross(200)).toBe(13);
    expect(tilesAcross(1920)).toBe(30);
  });

  it('backs off far enough to fit that many tiles at the target', () => {
    const aspect = 390 / 844;
    const distance = cameraDistance(15, aspect);
    const visibleWidth =
      2 * distance * Math.tan(((CAMERA_FOV_DEG * Math.PI) / 180) / 2) * aspect;
    expect(visibleWidth).toBeCloseTo(15, 6);
  });

  it('sits south of and above the player, looking north', () => {
    const offset = cameraOffset(10, { x: 0, y: 0, z: 0 }, 50, 0);
    expect(offset.x).toBeCloseTo(0, 9);
    expect(offset.y).toBeGreaterThan(0);
    expect(offset.z).toBeGreaterThan(0);
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(10, 9);
  });

  describe('joystick mapping', () => {
    const out = { x: 0, y: 0 };

    it('is the identity with north up, like the 2D view', () => {
      expect(joystickToWorld(0, -1, out)).toEqual({ x: 0, y: -1 });
      expect(joystickToWorld(1, 0, out)).toEqual({ x: 1, y: 0 });
    });

    it('keeps up-screen meaning away from the camera for any yaw', () => {
      for (const yaw of [0, 30, 90, 135, 180, 270]) {
        const offset = cameraOffset(1, { x: 0, y: 0, z: 0 }, 50, yaw);
        joystickToWorld(0, -1, out, yaw);
        // Up-screen walks the opposite way to where the camera sits.
        const horizontal = Math.hypot(offset.x, offset.z);
        expect(out.x).toBeCloseTo(-offset.x / horizontal, 9);
        expect(out.y).toBeCloseTo(-offset.z / horizontal, 9);
      }
    });

    it('never changes the speed', () => {
      joystickToWorld(0.6, 0.3, out, 37);
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(Math.hypot(0.6, 0.3), 9);
    });
  });
});
