import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_FOV_DEG,
  cameraBasis,
  cameraDistance,
  cameraOffset,
  cssToNdc,
  joystickToWorld,
  ndcToCss,
  screenToGround,
  tilesAcross,
  worldToScreen,
  type CameraView,
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

  describe('screen and ground', () => {
    /** The camera as the 3D view places it: following a player at (40.5, 0, 60.5). */
    function viewOf(width: number, height: number, pitch = 50, yaw = 0): CameraView {
      const aspect = width / height;
      const offset = cameraOffset(cameraDistance(tilesAcross(width), aspect), { x: 0, y: 0, z: 0 }, pitch, yaw);
      return {
        position: { x: 40.5 + offset.x, y: offset.y, z: 60.5 + offset.z },
        basis: cameraBasis(pitch, yaw),
        fovDeg: CAMERA_FOV_DEG,
        aspect,
        near: 0.5,
      };
    }

    it('puts the followed player at the centre of the screen', () => {
      const view = viewOf(390, 844);
      const hit = { x: 0, y: 0, z: 0 };
      expect(screenToGround(0, 0, view, 0, hit)).toBe(true);
      expect(hit.x).toBeCloseTo(40.5, 6);
      expect(hit.z).toBeCloseTo(60.5, 6);
    });

    it('turns a tap back into the tile under it', () => {
      for (const [width, height] of [[390, 844], [844, 390], [1024, 768]] as const) {
        const view = viewOf(width, height);
        for (const [tx, tz] of [[40, 60], [43, 58], [37, 63], [41, 55]] as const) {
          const ndc = { x: 0, y: 0 };
          if (!worldToScreen({ x: tx + 0.5, y: 0, z: tz + 0.5 }, view, ndc)) continue;
          const css = ndcToCss(ndc.x, ndc.y, width, height, { x: 0, y: 0 });
          const back = cssToNdc(css.x, css.y, width, height, { x: 0, y: 0 });
          const hit = { x: 0, y: 0, z: 0 };
          expect(screenToGround(back.x, back.y, view, 0, hit)).toBe(true);
          expect(Math.floor(hit.x)).toBe(tx);
          expect(Math.floor(hit.z)).toBe(tz);
        }
      }
    });

    it('agrees with itself for any yaw and pitch', () => {
      for (const [pitch, yaw] of [[35, 0], [50, 45], [65, 200]] as const) {
        const view = viewOf(500, 700, pitch, yaw);
        const ndc = { x: 0, y: 0 };
        expect(worldToScreen({ x: 42.2, y: 0, z: 59.1 }, view, ndc)).toBe(true);
        const hit = { x: 0, y: 0, z: 0 };
        expect(screenToGround(ndc.x, ndc.y, view, 0, hit)).toBe(true);
        expect(hit.x).toBeCloseTo(42.2, 6);
        expect(hit.z).toBeCloseTo(59.1, 6);
      }
    });

    it('puts up-screen further north on the ground', () => {
      const view = viewOf(390, 844);
      const near = { x: 0, y: 0, z: 0 };
      const far = { x: 0, y: 0, z: 0 };
      screenToGround(0, -0.5, view, 0, near);
      screenToGround(0, 0.5, view, 0, far);
      expect(far.z).toBeLessThan(near.z);
    });

    it('matches the three.js camera the 3D view actually draws with', () => {
      const [width, height] = [390, 844];
      const view = viewOf(width, height);
      // Set up exactly as Renderer3D does: orientation from lookAt, then moved.
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.5, 400);
      const offset = cameraOffset(cameraDistance(tilesAcross(width), width / height), { x: 0, y: 0, z: 0 });
      camera.position.set(offset.x, offset.y, offset.z);
      camera.lookAt(0, 0, 0);
      camera.position.set(view.position.x, view.position.y, view.position.z);
      camera.updateMatrixWorld();

      for (const [x, y, z] of [[40.5, 0, 60.5], [44, 0, 57], [37.2, 1.1, 63.4]] as const) {
        const ours = { x: 0, y: 0 };
        expect(worldToScreen({ x, y, z }, view, ours)).toBe(true);
        const theirs = new THREE.Vector3(x, y, z).project(camera);
        expect(ours.x).toBeCloseTo(theirs.x, 6);
        expect(ours.y).toBeCloseTo(theirs.y, 6);
      }
    });

    it('refuses points behind the camera, and the sky', () => {
      const view = viewOf(390, 844);
      expect(worldToScreen({ x: 40.5, y: 0, z: 200 }, view, { x: 0, y: 0 })).toBe(false);
      // Straight up the screen past the horizon never meets the ground.
      expect(screenToGround(0, 50, view, 0, { x: 0, y: 0, z: 0 })).toBe(false);
    });
  });
});
