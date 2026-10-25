import * as THREE from 'three';
import { EYE, MOUTH, avatarTextureKey, type AvatarParts } from '../gfx/avatar.js';
import { PROPORTIONS } from './character/proportions.js';
import { buildCharacterGeometry, type CharacterOptions } from './character/index.js';

/**
 * 3D avatars.
 *
 * The character itself lives in `./character`: one central `PROPORTIONS`
 * config, and a component each for the base character, the scarf and the
 * hats. This module is the view's side of it — the merged geometry cache,
 * and the one texture the whole crowd shares, its face.
 */

export { PROPORTIONS, HEAD_TOP, alongArm } from './character/proportions.js';
export { buildCharacterGeometry, type CharacterOptions } from './character/index.js';

/** Head centre and radius; the face patch is placed from these. */
export const HEAD_Y = PROPORTIONS.head.y;
export const HEAD_RADIUS = PROPORTIONS.head.radius;
/**
 * Avatars are modelled about a tile tall and drawn larger: chunky enough to
 * read at phone zoom, the way the 2D sprites stand taller than their tile.
 */
export const AVATAR_SCALE = PROPORTIONS.scale;
/** Roughly where the top of a hat ends, drawn size, for name tags and bubbles. */
export const AVATAR_TOP = PROPORTIONS.top;

/** One avatar, merged. Faces +z. */
export function buildAvatarGeometry(
  parts: AvatarParts,
  options: CharacterOptions = {},
): THREE.BufferGeometry {
  return buildCharacterGeometry(parts, options);
}

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/**
 * The face: two dark oval eyes with a catchlight and a small smile, on a
 * transparent canvas. Shared by every avatar, so the whole crowd costs one
 * texture.
 */
export function faceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    for (const x of [85, 171]) {
      ctx.fillStyle = hex(EYE);
      ctx.beginPath();
      ctx.ellipse(x, 54, 15.5, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8ed';
      ctx.beginPath();
      ctx.ellipse(x - 5, 45, 5, 6.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 5.5, 62, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = hex(MOUTH);
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 82, 11, Math.PI * 0.14, Math.PI * 0.86);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/**
 * The patch of the head the face is drawn on: a slice of a sphere just
 * outside the head, so the features follow its curve instead of floating on
 * a flat card.
 */
export function faceGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(
    HEAD_RADIUS * 1.008,
    20,
    12,
    Math.PI / 2 - 0.72,
    1.44,
    Math.PI * 0.34,
    Math.PI * 0.3,
  )
    .scale(1, PROPORTIONS.head.squash, 1)
    .translate(0, HEAD_Y, 0);
}

/**
 * Geometry per avatar combination, built once and shared by everyone
 * wearing the same thing.
 */
export class AvatarGeometryCache {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  get(parts: AvatarParts): THREE.BufferGeometry {
    const key = avatarTextureKey(parts);
    let geometry = this.geometries.get(key);
    if (geometry === undefined) {
      geometry = buildCharacterGeometry(parts);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
  }
}
