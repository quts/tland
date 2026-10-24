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
