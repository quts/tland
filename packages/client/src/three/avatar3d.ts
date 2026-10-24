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
export const HEAD_Y = 0.76;
export const HEAD_RADIUS = 0.29;
const HEAD_SQUASH = 0.92;
/**
 * Avatars are modelled about a tile tall and drawn larger: chunky enough to
 * read at phone zoom, the way the 2D sprites stand taller than their tile.
 */
export const AVATAR_SCALE = 1.85;
/** Roughly where the top of a hat ends, drawn size, for name tags and bubbles. */
export const AVATAR_TOP = 1.30 * AVATAR_SCALE;

/** Hair, picked by skin so a crowd is not all one colour. */
const HAIR = [0x6b4f3a, 0x8a6142, 0x4a3c34, 0x5a4033, 0x7d5a6e, 0x56637a, 0x6a7a52, 0x9a7444] as const;

const HAT_COLOR: Record<Exclude<Hat, 'none' | 'bloom' | 'sunhat'>, number> = {
  cap: PALETTE.roofWarm,
  beanie: PALETTE.petalLilac,
};

const skinShade = { from: 0.9, to: 1.04, bottom: HEAD_Y - HEAD_RADIUS, top: HEAD_Y + HEAD_RADIUS };
const bodyShade = { from: 0.82, to: 1.04, bottom: 0.07, top: 0.51 };

function hair(color: number, withBack: boolean): THREE.BufferGeometry[] {
  const shade = { from: 0.78, to: 1.04, bottom: HEAD_Y - 0.12, top: HEAD_Y + HEAD_RADIUS };
  const parts = [
    painted(
      new THREE.SphereGeometry(HEAD_RADIUS * 1.035, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.3)
        .scale(1, HEAD_SQUASH, 1).translate(0, HEAD_Y, 0), color, shade,
    ),
    // Broad swept fringe, above the eyes rather than covering the face.
    painted(new THREE.SphereGeometry(1, 20, 12).scale(0.235, 0.075, 0.075)
      .rotateZ(-0.1).translate(-0.025, HEAD_Y + 0.185, 0.19), color, shade),
    painted(new THREE.SphereGeometry(1, 16, 10).scale(0.09, 0.105, 0.065)
      .rotateZ(0.22).translate(0.205, HEAD_Y + 0.13, 0.135), color, shade),
  ];
  if (withBack) {
    parts.push(
      painted(new THREE.SphereGeometry(HEAD_RADIUS * 1.035, 20, 12, Math.PI, Math.PI,
        Math.PI * 0.24, Math.PI * 0.43).scale(1, HEAD_SQUASH, 1)
        .translate(0, HEAD_Y, 0), color, shade),
      ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(1, 12, 8)
        .scale(0.045, 0.105, 0.09).translate(side * 0.27, HEAD_Y + 0.035, -0.015), color, shade)),
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
          new THREE.SphereGeometry(HEAD_RADIUS * 1.09, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46)
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
    case 'sunhat': {
      // Lift and tip the brim back: the 45-degree game camera must see the eyes.
      const straw = 0xf5d98b;
      const crown = new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.22, 0),
        new THREE.Vector2(0.22, 0.025), new THREE.Vector2(0.195, 0.15),
        new THREE.Vector2(0.175, 0.17), new THREE.Vector2(0, 0.17),
      ], 32);
      const hat = [
        painted(new THREE.SphereGeometry(1, 32, 12).scale(0.39, 0.022, 0.305),
          straw, { from: 0.84, to: 1.04, bottom: -0.025, top: 0.025 }),
        painted(crown, straw, { from: 0.88, to: 1.04, bottom: 0, top: 0.17 }),
        painted(new THREE.CylinderGeometry(0.217, 0.223, 0.042, 32)
          .translate(0, 0.038, 0), 0xd98599),
      ];
      for (const part of hat) part.rotateX(-0.18).translate(0, top + 0.005, -0.035);
      return [...hair(hairColor, true), ...hat];
    }
    case 'beanie':
      return [
        ...hair(hairColor, true).slice(1),
        painted(
          new THREE.SphereGeometry(HEAD_RADIUS * 1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)
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
        painted(new THREE.TorusGeometry(0.183, 0.047, 10, 24).rotateX(Math.PI / 2).translate(0, 0.505, 0.025), 0xdf8e96, {
          from: 0.85, to: 1, bottom: 0.46, top: 0.56,
        }),
        painted(new THREE.CapsuleGeometry(0.038, 0.115, 4, 12).scale(1, 1, 0.55).rotateZ(0.12).translate(0.095, 0.395, 0.19), 0xdf8e96, {
          from: 0.8, to: 0.95, bottom: 0.3, top: 0.46,
        }),
      ];
    case 'glasses': {
      // Centred on the eyes painted on the face patch.
      const lens = (x: number): THREE.BufferGeometry =>
        painted(new THREE.TorusGeometry(0.05, 0.011, 8, 20).rotateX(-0.25).translate(x, HEAD_Y + 0.1, HEAD_RADIUS * 0.96), PALETTE.ink);
      return [
        lens(-0.058),
        lens(0.058),
        painted(new THREE.BoxGeometry(0.02, 0.01, 0.01).translate(0, HEAD_Y + 0.11, HEAD_RADIUS * 0.98), PALETTE.ink),
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
    painted(new THREE.SphereGeometry(0.075, 16, 10).scale(1, 0.6, 1.3).translate(-0.085, 0.04, 0.02), PALETTE.inkSoft),
    painted(new THREE.SphereGeometry(0.075, 16, 10).scale(1, 0.6, 1.3).translate(0.085, 0.04, 0.02), PALETTE.inkSoft),
    // Body.
    painted(new THREE.SphereGeometry(0.205, 24, 16).scale(1, 1.1, 0.86).translate(0, 0.29, 0), shirt, bodyShade),
    // Arms and hands.
    painted(new THREE.CapsuleGeometry(0.06, 0.075, 5, 12).rotateZ(0.28).translate(-0.22, 0.345, 0), shirt, bodyShade),
    painted(new THREE.CapsuleGeometry(0.06, 0.075, 5, 12).rotateZ(-0.28).translate(0.22, 0.345, 0), shirt, bodyShade),
    painted(new THREE.SphereGeometry(0.052, 14, 10).translate(-0.245, 0.235, 0.02), skin),
    painted(new THREE.SphereGeometry(0.052, 14, 10).translate(0.245, 0.235, 0.02), skin),
    // Head.
    painted(
      new THREE.SphereGeometry(HEAD_RADIUS, 24, 18).scale(1, HEAD_SQUASH, 1).translate(0, HEAD_Y, 0),
      skin,
      skinShade,
    ),
    // Tiny ears break up the round head without adding draw calls.
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(0.048, 12, 8)
      .scale(0.7, 1, 0.7).translate(side * 0.285, HEAD_Y - 0.025, 0), skin, skinShade)),
    ...hatParts(parts.hat, hairColor),
    ...accessoryParts(parts.accessory, shirt),
  ];
  return merge(pieces);
}

/**
 * The face: warm eyes with two highlights, a small smile and soft blush, on a transparent canvas.
 * Shared by every avatar, so the whole crowd costs one texture.
 */
export function faceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    for (const x of [51, 205]) {
      const blush = ctx.createRadialGradient(x, 82, 2, x, 82, 23);
      blush.addColorStop(0, 'rgba(232, 133, 139, 0.55)');
      blush.addColorStop(1, 'rgba(232, 133, 139, 0)');
      ctx.fillStyle = blush;
      ctx.beginPath();
      ctx.ellipse(x, 82, 23, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const x of [89, 167]) {
      ctx.fillStyle = '#392c29';
      ctx.beginPath();
      ctx.ellipse(x, 52, 13, 19, -0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#835941';
      ctx.beginPath();
      ctx.ellipse(x, 60, 8, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8ed';
      ctx.beginPath();
      ctx.ellipse(x - 4, 45, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 4, 59, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#674537';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 79, 12, Math.PI * 0.12, Math.PI * 0.88);
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
    Math.PI / 2 - 0.75,
    1.5,
    Math.PI * 0.28,
    Math.PI * 0.30,
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
