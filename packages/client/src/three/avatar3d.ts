import * as THREE from 'three';
import { PALETTE } from '../gfx/palette.js';
import {
  BODY_COLORS,
  SHIRT_COLORS,
  avatarTextureKey,
  type Accessory,
  type AvatarParts,
  type Hat,
} from '../gfx/avatar.js';
import { merge, painted } from './geometry.js';

/**
 * 3D avatars, assembled from rounded primitives.
 *
 * The same four choices as the 2D builder — skin, outfit, hat, accessory —
 * mapped onto chunky parts: a capsule body, a big round head, stubby arms
 * and feet. Each combination is merged into a single vertex-coloured
 * geometry the first time it is needed, so a character is one draw call.
 * The face is the only texture, drawn on a canvas and shared by everyone.
 */

/** Head centre and radius; the face patch and hats are placed from these. */
export const HEAD_Y = 0.7;
export const HEAD_RADIUS = 0.26;
const HEAD_SQUASH = 0.94;
/**
 * Avatars are modelled about a tile tall and drawn larger: chunky enough to
 * read at phone zoom, the way the 2D sprites stand taller than their tile.
 */
export const AVATAR_SCALE = 1.4;
/** Roughly where the top of a hat ends, drawn size, for name tags and bubbles. */
export const AVATAR_TOP = 1.08 * AVATAR_SCALE;

/** Hair, picked by skin so a crowd is not all one colour. */
const HAIR = [0x6b4f3a, 0x8a6142, 0x4a3c34, 0x5a4033, 0x7d5a6e, 0x56637a, 0x6a7a52, 0x9a7444] as const;

const HAT_COLOR: Record<Exclude<Hat, 'none' | 'bloom'>, number> = {
  cap: PALETTE.roofWarm,
  sunhat: PALETTE.petalCream,
  beanie: PALETTE.petalLilac,
};

const skinShade = { from: 0.9, to: 1.04, bottom: HEAD_Y - HEAD_RADIUS, top: HEAD_Y + HEAD_RADIUS };
const bodyShade = { from: 0.74, to: 1.02, bottom: 0.05, top: 0.5 };

function hair(color: number, withBack: boolean): THREE.BufferGeometry[] {
  const parts = [
    painted(
      new THREE.SphereGeometry(HEAD_RADIUS * 1.06, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42)
        .scale(1, HEAD_SQUASH, 1)
        .translate(0, HEAD_Y, 0),
      color,
      { from: 0.85, to: 1.05, bottom: HEAD_Y, top: HEAD_Y + HEAD_RADIUS },
    ),
  ];
  if (withBack) {
    // Down the back of the head, behind where the face is.
    parts.push(
      painted(
        new THREE.SphereGeometry(HEAD_RADIUS * 1.05, 10, 6, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.42)
          .scale(1, HEAD_SQUASH, 1)
          .translate(0, HEAD_Y, 0),
        color,
        { from: 0.8, to: 1, bottom: HEAD_Y - HEAD_RADIUS, top: HEAD_Y + HEAD_RADIUS },
      ),
    );
  }
  return parts;
}

function hatParts(hat: Hat, hairColor: number): THREE.BufferGeometry[] {
  const top = HEAD_Y + HEAD_RADIUS * HEAD_SQUASH;
  switch (hat) {
    case 'none':
      return hair(hairColor, true);
    case 'cap':
      return [
        ...hair(hairColor, true).slice(1),
        painted(
          new THREE.SphereGeometry(HEAD_RADIUS * 1.09, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.46)
            .translate(0, HEAD_Y + 0.01, 0),
          HAT_COLOR.cap,
          { from: 0.85, to: 1.04, bottom: HEAD_Y, top: top + 0.03 },
        ),
        painted(
          new THREE.CylinderGeometry(0.16, 0.16, 0.025, 16).scale(1, 1, 0.75).translate(0, HEAD_Y + 0.12, 0.2),
          HAT_COLOR.cap,
          { from: 0.8, to: 0.95, bottom: HEAD_Y, top: top },
        ),
        painted(new THREE.SphereGeometry(0.025, 6, 4).translate(0, top + 0.03, 0), PALETTE.wall),
      ];
    case 'sunhat':
      return [
        ...hair(hairColor, true),
        painted(new THREE.CylinderGeometry(0.43, 0.45, 0.03, 24).translate(0, top - 0.02, 0), HAT_COLOR.sunhat, {
          from: 0.86, to: 1, bottom: top - 0.04, top: top,
        }),
        painted(new THREE.CylinderGeometry(0.2, 0.23, 0.15, 18).translate(0, top + 0.06, 0), HAT_COLOR.sunhat, {
          from: 0.9, to: 1.04, bottom: top, top: top + 0.14,
        }),
        painted(new THREE.CylinderGeometry(0.232, 0.234, 0.045, 18).translate(0, top + 0.015, 0), PALETTE.petalRose),
      ];
    case 'beanie':
      return [
        ...hair(hairColor, true).slice(1),
        painted(
          new THREE.SphereGeometry(HEAD_RADIUS * 1.1, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5)
            .scale(1, 1.12, 1)
            .translate(0, HEAD_Y + 0.02, 0),
          HAT_COLOR.beanie,
          { from: 0.86, to: 1.04, bottom: HEAD_Y, top: top + 0.08 },
        ),
        painted(
          new THREE.TorusGeometry(HEAD_RADIUS * 1.08, 0.035, 6, 20).rotateX(Math.PI / 2).translate(0, HEAD_Y + 0.05, 0),
          HAT_COLOR.beanie,
          { from: 0.82, to: 0.92, bottom: HEAD_Y, top: HEAD_Y + 0.1 },
        ),
        painted(new THREE.IcosahedronGeometry(0.07, 1).translate(0, top + 0.1, 0), PALETTE.wall),
      ];
    case 'bloom': {
      const flowers: THREE.BufferGeometry[] = [];
      const petals = [PALETTE.petalRose, PALETTE.petalCream, PALETTE.petalLilac];
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2;
        flowers.push(
          painted(
            new THREE.IcosahedronGeometry(0.055, 0).translate(
              Math.sin(angle) * 0.2,
              HEAD_Y + 0.17 + Math.cos(angle * 2) * 0.01,
              Math.cos(angle) * 0.2,
            ),
            petals[i % 3] as number,
          ),
        );
      }
      return [...hair(hairColor, true), ...flowers];
    }
  }
}

function accessoryParts(accessory: Accessory, shirt: number): THREE.BufferGeometry[] {
  switch (accessory) {
    case 'none':
      return [];
    case 'scarf':
      return [
        painted(new THREE.TorusGeometry(0.15, 0.055, 8, 18).rotateX(Math.PI / 2).translate(0, 0.47, 0.01), PALETTE.roofWarm, {
          from: 0.85, to: 1, bottom: 0.42, top: 0.52,
        }),
        painted(new THREE.BoxGeometry(0.08, 0.16, 0.05).rotateZ(0.15).translate(0.08, 0.38, 0.15), PALETTE.roofWarm, {
          from: 0.8, to: 0.95, bottom: 0.3, top: 0.46,
        }),
      ];
    case 'glasses': {
      // Centred on the eyes painted on the face patch.
      const lens = (x: number): THREE.BufferGeometry =>
        painted(new THREE.TorusGeometry(0.05, 0.011, 6, 16).translate(x, HEAD_Y + 0.02, HEAD_RADIUS + 0.004), PALETTE.ink);
      return [
        lens(-0.058),
        lens(0.058),
        painted(new THREE.BoxGeometry(0.02, 0.01, 0.01).translate(0, HEAD_Y + 0.03, HEAD_RADIUS + 0.008), PALETTE.ink),
      ];
    }
    case 'satchel':
      return [
        painted(new THREE.BoxGeometry(0.15, 0.13, 0.06).translate(0.19, 0.25, 0.06), PALETTE.bench, {
          from: 0.8, to: 1, bottom: 0.18, top: 0.32,
        }),
        painted(new THREE.TorusGeometry(0.23, 0.014, 4, 24).rotateY(Math.PI / 2).rotateX(0.55).translate(0.02, 0.38, 0), PALETTE.benchShade),
      ];
    case 'bowtie': {
      // A contrasting tie, so it does not vanish into the shirt.
      const tie = shirt === PALETTE.roofCool ? PALETTE.roofWarm : PALETTE.roofCool;
      return [
        painted(new THREE.ConeGeometry(0.045, 0.08, 6).rotateZ(Math.PI / 2).translate(-0.04, 0.46, 0.17), tie),
        painted(new THREE.ConeGeometry(0.045, 0.08, 6).rotateZ(-Math.PI / 2).translate(0.04, 0.46, 0.17), tie),
        painted(new THREE.SphereGeometry(0.022, 6, 4).translate(0, 0.46, 0.18), tie),
      ];
    }
  }
}

/** One avatar, merged. Faces +z. */
export function buildAvatarGeometry(parts: AvatarParts): THREE.BufferGeometry {
  const skin = BODY_COLORS[parts.body] ?? BODY_COLORS[0];
  const shirt = SHIRT_COLORS[parts.shirt] ?? SHIRT_COLORS[0];
  const hairColor = HAIR[parts.body] ?? HAIR[0];

  const pieces = [
    // Feet, a little apart.
    painted(new THREE.SphereGeometry(0.075, 10, 6).scale(1, 0.6, 1.3).translate(-0.085, 0.04, 0.02), PALETTE.inkSoft),
    painted(new THREE.SphereGeometry(0.075, 10, 6).scale(1, 0.6, 1.3).translate(0.085, 0.04, 0.02), PALETTE.inkSoft),
    // Body.
    painted(new THREE.CapsuleGeometry(0.17, 0.14, 3, 12).translate(0, 0.3, 0), shirt, bodyShade),
    // Arms and hands.
    painted(new THREE.CapsuleGeometry(0.052, 0.12, 3, 8).rotateZ(0.28).translate(-0.205, 0.31, 0), shirt, bodyShade),
    painted(new THREE.CapsuleGeometry(0.052, 0.12, 3, 8).rotateZ(-0.28).translate(0.205, 0.31, 0), shirt, bodyShade),
    painted(new THREE.SphereGeometry(0.055, 8, 6).translate(-0.235, 0.2, 0.01), skin),
    painted(new THREE.SphereGeometry(0.055, 8, 6).translate(0.235, 0.2, 0.01), skin),
    // Head.
    painted(
      new THREE.SphereGeometry(HEAD_RADIUS, 16, 12).scale(1, HEAD_SQUASH, 1).translate(0, HEAD_Y, 0),
      skin,
      skinShade,
    ),
    ...hatParts(parts.hat, hairColor),
    ...accessoryParts(parts.accessory, shirt),
  ];
  return merge(pieces);
}

/**
 * The face: dot eyes, a small smile and blush, on a transparent canvas.
 * Shared by every avatar, so the whole crowd costs one texture.
 */
export function faceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.fillStyle = 'rgba(243, 166, 170, 0.6)';
    for (const x of [30, 98]) {
      ctx.beginPath();
      ctx.ellipse(x, 40, 11, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4b4033';
    for (const x of [45, 83]) {
      ctx.beginPath();
      ctx.ellipse(x, 28, 6.5, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fdf7ec';
    for (const x of [47, 85]) {
      ctx.beginPath();
      ctx.arc(x, 25, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#4b4033';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(64, 38, 6, Math.PI * 0.15, Math.PI * 0.85);
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
    12,
    6,
    Math.PI / 2 - 0.75,
    1.5,
    Math.PI * 0.36,
    Math.PI * 0.26,
  )
    .scale(1, HEAD_SQUASH, 1)
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
      geometry = buildAvatarGeometry(parts);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
  }
}
