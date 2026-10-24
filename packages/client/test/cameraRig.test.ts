import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CAMERA_NEAR,
  CAMERA_PITCH_DEG,
  cameraBasis,
  cameraOffset,
  cssToNdc,
  joystickToWorld,
  ndcToCss,
  orthoFrame,
  screenToGround,
  screenToTerrain,
  tilesAcross,
  worldToScreen,
  type CameraView,
} from '../src/three/cameraRig.js';

/** The camera as the 3D view places it: following a player at (40.5, 0, 60.5). */
function viewOf(width: number, height: number, pitch = CAMERA_PITCH_DEG, yaw = 0): CameraView {
  const frame = orthoFrame(tilesAcross(width), width / height, { halfWidth: 0, halfHeight: 0 });
  const offset = cameraOffset(CAMERA_DISTANCE, { x: 0, y: 0, z: 0 }, pitch, yaw);
  return {
    position: { x: 40.5 + offset.x, y: offset.y, z: 60.5 + offset.z },
    basis: cameraBasis(pitch, yaw),
    halfWidth: frame.halfWidth,
    halfHeight: frame.halfHeight,
    near: CAMERA_NEAR,
  };
}

describe('3D camera rig', () => {
  it('shows as many tiles across as the 2D camera does', () => {
    expect(tilesAcross(390)).toBe(15);
    expect(tilesAcross(200)).toBe(13);
    expect(tilesAcross(1920)).toBe(30);
  });

  it('fixes the width and lets a portrait screen see further, never narrower', () => {
    const portrait = orthoFrame(15, 390 / 844, { halfWidth: 0, halfHeight: 0 });
    expect(portrait.halfWidth * 2).toBe(15);
    expect(portrait.halfHeight / portrait.halfWidth).toBeCloseTo(844 / 390, 9);
  });

  it('sits south of and above the player, looking north', () => {
    const offset = cameraOffset(10, { x: 0, y: 0, z: 0 }, 50, 0);
    expect(offset.x).toBeCloseTo(0, 9);
    expect(offset.y).toBeGreaterThan(0);
    expect(offset.z).toBeGreaterThan(0);
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(10, 9);
  });

  it('keeps the whole visible ground between the near and far planes', () => {
    const view = viewOf(390, 844);
    for (const ndcY of [-1, 1]) {
      const ground = { x: 0, y: 0, z: 0 };
      expect(screenToGround(0, ndcY, view, 0, ground)).toBe(true);
      const f = view.basis.forward;
      const depth =
        (ground.x - view.position.x) * f.x +
        (ground.y - view.position.y) * f.y +
        (ground.z - view.position.z) * f.z;
      expect(depth).toBeGreaterThan(CAMERA_NEAR);
      expect(depth).toBeLessThan(CAMERA_FAR);
    }
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
          expect(worldToScreen({ x: tx + 0.5, y: 0, z: tz + 0.5 }, view, ndc)).toBe(true);
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

    it('draws a house the same wherever it is on screen', () => {
      // The defect this camera fixes: under perspective, a wall near the top
      // of a portrait screen and one near the bottom came out very different.
      const view = viewOf(390, 844);
      const wallOnScreen = (z: number): number => {
        const foot = { x: 0, y: 0 };
        const top = { x: 0, y: 0 };
        worldToScreen({ x: 40.5, y: 0, z }, view, foot);
        worldToScreen({ x: 40.5, y: 2, z }, view, top);
        return top.y - foot.y;
      };
      const nearTop = wallOnScreen(60.5 - 20);
      const nearBottom = wallOnScreen(60.5 + 20);
      expect(nearTop).toBeCloseTo(nearBottom, 9);
    });

    it('puts up-screen further north on the ground', () => {
      const view = viewOf(390, 844);
      const near = { x: 0, y: 0, z: 0 };
      const far = { x: 0, y: 0, z: 0 };
      screenToGround(0, -0.5, view, 0, near);
      screenToGround(0, 0.5, view, 0, far);
      expect(far.z).toBeLessThan(near.z);
    });

    it('refuses points behind the camera', () => {
      const view = viewOf(390, 844);
      expect(worldToScreen({ x: 40.5, y: 0, z: 200 }, view, { x: 0, y: 0 })).toBe(false);
    });

    it('matches the three.js camera the 3D view actually draws with', () => {
      const [width, height] = [390, 844];
      const view = viewOf(width, height);
      // Set up exactly as Renderer3D does: orientation from lookAt, then moved.
      const camera = new THREE.OrthographicCamera(
        -view.halfWidth,
        view.halfWidth,
        view.halfHeight,
        -view.halfHeight,
        CAMERA_NEAR,
        CAMERA_FAR,
      );
      const offset = cameraOffset(CAMERA_DISTANCE, { x: 0, y: 0, z: 0 });
      camera.position.set(offset.x, offset.y, offset.z);
      camera.lookAt(0, 0, 0);
      camera.position.set(view.position.x, view.position.y, view.position.z);
      camera.updateMatrixWorld();

      for (const [x, y, z] of [[40.5, 0, 60.5], [44, 0, 57], [37.2, 1.1, 63.4], [46, 3, 45]] as const) {
        const ours = { x: 0, y: 0 };
        expect(worldToScreen({ x, y, z }, view, ours)).toBe(true);
        const theirs = new THREE.Vector3(x, y, z).project(camera);
        expect(ours.x).toBeCloseTo(theirs.x, 6);
        expect(ours.y).toBeCloseTo(theirs.y, 6);
      }
    });
  });

  describe('taps on raised ground', () => {
    // A ridge two tiles high covering z < 58; flat everywhere else.
    const ridge = (_x: number, z: number): number => (z < 58 ? 2 : 0);

    it('lands on the hillside it was aimed at, not on a tile behind it', () => {
      const view = viewOf(390, 844);
      // Aim at a point on top of the ridge.
      const ndc = { x: 0, y: 0 };
      expect(worldToScreen({ x: 41.5, y: 2, z: 56.5 }, view, ndc)).toBe(true);

      const flat = { x: 0, y: 0, z: 0 };
      screenToGround(ndc.x, ndc.y, view, 0, flat);
      // The flat-plane answer goes straight through the hill.
      expect(Math.floor(flat.z)).toBeLessThan(56);

      const hit = { x: 0, y: 0, z: 0 };
      expect(screenToTerrain(ndc.x, ndc.y, view, ridge, 2, hit)).toBe(true);
      expect(Math.floor(hit.x)).toBe(41);
      expect(Math.floor(hit.z)).toBe(56);
      expect(hit.y).toBeCloseTo(2, 2);
    });

    it('agrees with the flat plane where the ground is flat', () => {
      const view = viewOf(390, 844);
      const flatGround = (): number => 0;
      for (const [ndcX, ndcY] of [[0, 0], [0.4, -0.3], [-0.7, 0.6]] as const) {
        const plane = { x: 0, y: 0, z: 0 };
        const terrain = { x: 0, y: 0, z: 0 };
        screenToGround(ndcX, ndcY, view, 0, plane);
        expect(screenToTerrain(ndcX, ndcY, view, flatGround, 3, terrain)).toBe(true);
        expect(terrain.x).toBeCloseTo(plane.x, 2);
        expect(terrain.z).toBeCloseTo(plane.z, 2);
      }
    });
  });
});
