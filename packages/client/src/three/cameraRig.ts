/**
 * The fixed overhead camera, as plain arithmetic.
 *
 * Kept free of three.js so the numbers can be unit-tested and so the 2D
 * bundle never has a reason to pull this in. World units are tiles: x runs
 * east with the map's x, z runs south with the map's y, and y is up.
 *
 * Every camera setting lives here, and Renderer3D only applies them.
 *
 * The projection is orthographic, on purpose. A perspective camera tall
 * enough for a portrait phone sees the ground at very different angles at
 * the top and bottom of the screen: houses near the bottom are all roof,
 * houses near the top all wall, and each one looks drawn by its own rules.
 * An orthographic camera sees every point from the same angle, so every
 * house, bridge and tree is drawn the same way wherever it is on screen.
 */

/**
 * How far the camera looks down from the horizontal: the classic 3/4 view.
 * Ground depth is drawn at sin(pitch) and heights at cos(pitch), so at 45°
 * a wall and the same length of street read at the same size — roofs, walls
 * and the ground all stay legible together.
 */
export const CAMERA_PITCH_DEG = 45;

/**
 * Rotation about the vertical axis. Zero puts north at the top of the screen,
 * matching the 2D view and the minimap, so up on the joystick is north in
 * both. It never changes at runtime.
 */
export const CAMERA_YAW_DEG = 0;

/**
 * Distance from the camera to the point it follows. With an orthographic
 * camera this sets nothing about size; it only has to clear the tallest hill
 * and keep the near and far planes comfortably around the visible ground.
 */
export const CAMERA_DISTANCE = 60;
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 160;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

const DEG = Math.PI / 180;

/**
 * Tiles across the screen, by the same rule as the 2D camera: roughly 14 on a
 * handset and 30 on a desktop.
 */
export function tilesAcross(cssWidth: number): number {
  return Math.min(Math.max(cssWidth / 26, 13), 30);
}

/** Half the visible width and height, in tiles, for a screen of this aspect. */
export interface OrthoFrame {
  halfWidth: number;
  halfHeight: number;
}

/** Portrait phones should prioritize useful character scale over distant map coverage. */
export const PORTRAIT_TILES_HIGH = 22;
const PORTRAIT_ASPECT_MAX = 0.8;

/** The orthographic frame that shows a fixed number of tiles across. */
export function orthoFrame(tiles: number, aspect: number, out: OrthoFrame): OrthoFrame {
  out.halfWidth = tiles / 2;
  out.halfHeight = out.halfWidth / Math.max(aspect, 1e-6);
  return out;
}

/**
 * Choose a viewport frame: portrait screens keep a useful vertical zoom,
 * while landscape screens preserve the established width-based framing.
 */
export function viewportFrame(width: number, height: number, out: OrthoFrame): OrthoFrame {
  const aspect = width / Math.max(height, 1e-6);
  if (aspect < PORTRAIT_ASPECT_MAX) {
    out.halfHeight = PORTRAIT_TILES_HIGH / 2;
    out.halfWidth = out.halfHeight * aspect;
    return out;
  }
  return orthoFrame(tilesAcross(width), aspect, out);
}

/** Where the camera sits relative to the point it looks at. */
export function cameraOffset(
  distance: number,
  out: Vec3,
  pitchDeg = CAMERA_PITCH_DEG,
  yawDeg = CAMERA_YAW_DEG,
): Vec3 {
  const pitch = pitchDeg * DEG;
  const yaw = yawDeg * DEG;
  out.x = Math.sin(yaw) * Math.cos(pitch) * distance;
  out.y = Math.sin(pitch) * distance;
  out.z = Math.cos(yaw) * Math.cos(pitch) * distance;
  return out;
}

/**
 * Turn a joystick deflection into a direction on the ground.
 *
 * Screen axes are x right and y down. Pushing up always walks up the screen,
 * whatever the camera's yaw; with the default yaw this is the identity, which
 * is the point — the 2D and 3D views move the same way under the thumb.
 */
export function joystickToWorld(
  screenX: number,
  screenY: number,
  out: Vec2,
  yawDeg = CAMERA_YAW_DEG,
): Vec2 {
  const yaw = yawDeg * DEG;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Right on screen is (cos, -sin) on the ground; up on screen is (-sin, -cos).
  out.x = screenX * cos + screenY * sin;
  out.y = -screenX * sin + screenY * cos;
  return out;
}

/** The camera's axes in world space. Fixed for the session. */
export interface CameraBasis {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

export function cameraBasis(pitchDeg = CAMERA_PITCH_DEG, yawDeg = CAMERA_YAW_DEG): CameraBasis {
  const pitch = pitchDeg * DEG;
  const yaw = yawDeg * DEG;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const forward = { x: -Math.sin(yaw) * cp, y: -sp, z: -Math.cos(yaw) * cp };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  // up = right x forward
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { forward, right, up };
}

/** Everything needed to go between the screen and the world for one frame. */
export interface CameraView {
  readonly position: Vec3;
  readonly basis: CameraBasis;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly near: number;
}

/** The point on the camera's image plane under a screen position. */
function rayOrigin(ndcX: number, ndcY: number, view: CameraView, out: Vec3): Vec3 {
  const { right, up } = view.basis;
  const sx = ndcX * view.halfWidth;
  const sy = ndcY * view.halfHeight;
  out.x = view.position.x + right.x * sx + up.x * sy;
  out.y = view.position.y + right.y * sx + up.y * sy;
  out.z = view.position.z + right.z * sx + up.z * sy;
  return out;
}

/**
 * Where a point on screen meets the horizontal plane `groundY`.
 *
 * `ndcX` and `ndcY` run from -1 to 1, y up. Every ray runs parallel to the
 * camera's forward axis. Returns false only if the camera were looking level
 * or upwards, which this one never does.
 */
export function screenToGround(
  ndcX: number,
  ndcY: number,
  view: CameraView,
  groundY: number,
  out: Vec3,
): boolean {
  const forward = view.basis.forward;
  if (forward.y >= -1e-9) return false;
  rayOrigin(ndcX, ndcY, view, out);
  const t = (groundY - out.y) / forward.y;
  out.x += forward.x * t;
  out.y = groundY;
  out.z += forward.z * t;
  return true;
}

/**
 * Where a point on screen first touches the terrain, hills included.
 *
 * Casting onto the flat y = 0 plane is wrong wherever the ground is raised:
 * a tap on a hillside passes through it and lands on a tile behind the hill.
 * This marches down the ray from `maxHeight` until it is at or below
 * `heightAt`, then narrows the crossing down. Ground never sits below zero
 * for picking, so the march always ends.
 */
export function screenToTerrain(
  ndcX: number,
  ndcY: number,
  view: CameraView,
  heightAt: (x: number, z: number) => number,
  maxHeight: number,
  out: Vec3,
): boolean {
  if (!screenToGround(ndcX, ndcY, view, maxHeight, out)) return false;
  const f = view.basis.forward;
  const step = 0.1;
  const limit = Math.ceil((maxHeight + 1) / -f.y / step);
  let previous = 0;
  for (let i = 1; i <= limit; i += 1) {
    const t = i * step;
    const y = out.y + f.y * t;
    if (y <= Math.max(0, heightAt(out.x + f.x * t, out.z + f.z * t))) {
      // The surface lies between the previous sample and this one.
      let lo = previous;
      let hi = t;
      for (let k = 0; k < 8; k += 1) {
        const mid = (lo + hi) / 2;
        const my = out.y + f.y * mid;
        if (my <= Math.max(0, heightAt(out.x + f.x * mid, out.z + f.z * mid))) hi = mid;
        else lo = mid;
      }
      out.x += f.x * hi;
      out.z += f.z * hi;
      out.y += f.y * hi;
      return true;
    }
    previous = t;
  }
  return screenToGround(ndcX, ndcY, view, 0, out);
}

/**
 * Project a world point to normalised device coordinates.
 *
 * Returns false for points behind the near plane; the caller hides whatever
 * it was going to draw there.
 */
export function worldToScreen(point: Vec3, view: CameraView, out: Vec2): boolean {
  const { forward, right, up } = view.basis;
  const dx = point.x - view.position.x;
  const dy = point.y - view.position.y;
  const dz = point.z - view.position.z;
  const depth = dx * forward.x + dy * forward.y + dz * forward.z;
  if (depth <= view.near) return false;
  out.x = (dx * right.x + dy * right.y + dz * right.z) / view.halfWidth;
  out.y = (dx * up.x + dy * up.y + dz * up.z) / view.halfHeight;
  return true;
}

/** CSS pixels inside the canvas to normalised device coordinates. */
export function cssToNdc(x: number, y: number, width: number, height: number, out: Vec2): Vec2 {
  out.x = (x / width) * 2 - 1;
  out.y = 1 - (y / height) * 2;
  return out;
}

/** Normalised device coordinates to CSS pixels inside the canvas. */
export function ndcToCss(x: number, y: number, width: number, height: number, out: Vec2): Vec2 {
  out.x = ((x + 1) / 2) * width;
  out.y = ((1 - y) / 2) * height;
  return out;
}
