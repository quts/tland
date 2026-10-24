/**
 * The fixed overhead camera, as plain arithmetic.
 *
 * Kept free of three.js so the numbers can be unit-tested and so the 2D
 * bundle never has a reason to pull this in. World units are tiles: x runs
 * east with the map's x, z runs south with the map's y, and y is up.
 */

/** Vertical field of view. Narrow, so the view reads as a diorama. */
export const CAMERA_FOV_DEG = 25;

/** How far the camera looks down from the horizontal. */
export const CAMERA_PITCH_DEG = 50;

/**
 * Rotation about the vertical axis. Zero puts north at the top of the screen,
 * matching the 2D view and the minimap; it never changes at runtime.
 */
export const CAMERA_YAW_DEG = 0;

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

/**
 * Distance from the camera to its target that shows `tiles` across the
 * screen at the target's depth.
 */
export function cameraDistance(tiles: number, aspect: number, fovDeg = CAMERA_FOV_DEG): number {
  const halfHeight = Math.tan((fovDeg * DEG) / 2);
  return tiles / (2 * halfHeight * Math.max(aspect, 1e-6));
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
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
}

/**
 * Where a point on screen meets the horizontal plane `groundY`.
 *
 * `ndcX` and `ndcY` run from -1 to 1, y up. Returns false when the ray never
 * comes down to the plane, which with a camera pitched downwards only happens
 * for points above the horizon.
 */
export function screenToGround(
  ndcX: number,
  ndcY: number,
  view: CameraView,
  groundY: number,
  out: Vec3,
): boolean {
  const tanHalf = Math.tan((view.fovDeg * DEG) / 2);
  const { forward, right, up } = view.basis;
  const sx = ndcX * tanHalf * view.aspect;
  const sy = ndcY * tanHalf;
  const dx = forward.x + right.x * sx + up.x * sy;
  const dy = forward.y + right.y * sx + up.y * sy;
  const dz = forward.z + right.z * sx + up.z * sy;
  if (dy >= -1e-9) return false;
  const t = (groundY - view.position.y) / dy;
  if (t <= 0) return false;
  out.x = view.position.x + dx * t;
  out.y = groundY;
  out.z = view.position.z + dz * t;
  return true;
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
  const tanHalf = Math.tan((view.fovDeg * DEG) / 2);
  out.x = (dx * right.x + dy * right.y + dz * right.z) / (depth * tanHalf * view.aspect);
  out.y = (dx * up.x + dy * up.y + dz * up.z) / (depth * tanHalf);
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
