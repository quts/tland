import * as THREE from 'three';
import { PALETTE } from '../gfx/palette.js';
import {
  BODY_COLORS,
  BOOT,
  EYE,
  HAIR_COLORS,
  MOUTH,
  SCARF,
  SHIRT_COLORS,
  STRAW,
  avatarTextureKey,
  type Accessory,
  type AvatarParts,
  type Hat,
} from '../gfx/avatar.js';
import { merge, painted } from './geometry.js';

/**
 * 3D avatars, assembled from rounded primitives.
 *
 * The shape is a soft vinyl toy: a head half as tall as the whole figure, a
 * round body right under it with no neck, stubby sleeves ending in bare
 * hands, and two little boots peeking out below. The same four choices as the
 * 2D builder — skin, outfit, hat, accessory — dress that body, and each
 * combination is merged into a single vertex-coloured geometry the first time
 * it is needed, so a character is one draw call. The face is the only
 * texture, drawn on a canvas and shared by everyone.
 */

/** Head centre and radius; the face patch and hats are placed from these. */
export const HEAD_Y = 0.80;
export const HEAD_RADIUS = 0.30;
const HEAD_SQUASH = 0.95;
/** Top of the bare skull — where hair sits and hats are stacked from. */
const HEAD_TOP = HEAD_Y + HEAD_RADIUS * HEAD_SQUASH;
/** The body ball: a wide egg the head rests on, its top at the collar. */
const BODY_Y = 0.30;
const BODY_RADIUS = 0.25;
const COLLAR_Y = BODY_Y + BODY_RADIUS * 1.02;
/**
 * Avatars are modelled about a tile tall and drawn larger: chunky enough to
 * read at phone zoom, the way the 2D sprites stand taller than their tile.
 */
export const AVATAR_SCALE = 1.85;
/** Roughly where the top of a hat ends, drawn size, for name tags and bubbles. */
export const AVATAR_TOP = 1.30 * AVATAR_SCALE;

const HAT_COLOR: Record<Exclude<Hat, 'none' | 'bloom' | 'sunhat'>, number> = {
  cap: PALETTE.roofWarm,
  beanie: PALETTE.petalLilac,
};

const skinShade = { from: 0.9, to: 1.04, bottom: HEAD_Y - HEAD_RADIUS, top: HEAD_Y + HEAD_RADIUS };
const bodyShade = { from: 0.82, to: 1.04, bottom: 0.06, top: COLLAR_Y };

/** Where the bowl cut's hem sits at the front and at the nape, as sphere angles. */
const BROW = Math.PI * 0.25;
const FRINGE = Math.PI * 0.40;
const NAPE = Math.PI * 0.70;

/**
 * A shell over the skull whose hem sweeps down as it goes back: level above
 * the eyes at the front, past the ears at the sides, to the nape behind.
 *
 * It is built by hand rather than from a sphere section because a section's
 * hem is a single latitude — a ring of sections stepping down gives a
 * staircase, while sweeping the bottom edge per column gives a cut.
 */
function hairShell(radius: number, hem: number): THREE.BufferGeometry {
  const columns = 44;
  const rows = 6;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const index: number[] = [];
  for (let i = 0; i <= columns; i += 1) {
    // phi 0 is the left flank and pi/2 straight ahead, so measure from the face.
    const phi = (i / columns) * Math.PI * 2;
    const behind = (1 - Math.cos(phi - Math.PI / 2)) / 2;
    const bottom = FRINGE + (hem - FRINGE) * behind;
    for (let j = 0; j <= rows; j += 1) {
      const theta = BROW + (bottom - BROW) * (j / rows);
      const at = (i * (rows + 1) + j) * 3;
      positions[at] = -Math.cos(phi) * Math.sin(theta) * radius;
      positions[at + 1] = Math.cos(theta) * radius * HEAD_SQUASH + HEAD_Y;
      positions[at + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      if (i < columns && j < rows) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A bowl cut: a cap over the crown and a shell hanging from the brow.
 * The first piece is the crown alone, so hats that cover the top can drop it.
 */
function hair(color: number, withBack: boolean): THREE.BufferGeometry[] {
  const shade = { from: 0.7, to: 1.04, bottom: HEAD_Y - 0.26, top: HEAD_TOP };
  const r = HEAD_RADIUS * 1.045;
  const parts = [
    painted(
      new THREE.SphereGeometry(r, 30, 12, 0, Math.PI * 2, 0, BROW + 0.04)
        .scale(1, HEAD_SQUASH, 1).translate(0, HEAD_Y, 0), color, shade,
    ),
    painted(hairShell(r, withBack ? NAPE : Math.PI * 0.52), color, shade),
  ];
  if (withBack) {
    // A soft nape, so the back of the cut is not a hard rim.
    parts.push(painted(new THREE.SphereGeometry(1, 20, 10).scale(0.185, 0.09, 0.14)
      .translate(0, HEAD_Y - 0.165, -0.14), color, shade));
  }
  return parts;
}

function hatParts(hat: Hat, hairColor: number): THREE.BufferGeometry[] {
  const top = HEAD_TOP;
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
          new THREE.CylinderGeometry(0.165, 0.165, 0.025, 16).scale(1, 1, 0.75).translate(0, HEAD_Y + 0.13, 0.21),
          HAT_COLOR.cap,
          { from: 0.8, to: 0.95, bottom: HEAD_Y, top: top },
        ),
        painted(new THREE.SphereGeometry(0.025, 6, 4).translate(0, top + 0.03, 0), PALETTE.wall),
      ];
    case 'sunhat': {
      // A straw boater: flat crown, coral band, wide flat brim. Tipped back a
      // little, because the 32-degree game camera must still see the eyes.
      const crown = new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.237, 0),
        new THREE.Vector2(0.237, 0.088), new THREE.Vector2(0.222, 0.108),
        new THREE.Vector2(0.203, 0.115), new THREE.Vector2(0, 0.115),
      ], 36);
      const hat = [
        painted(new THREE.SphereGeometry(1, 36, 12).scale(0.425, 0.021, 0.395),
          STRAW, { from: 0.86, to: 1.04, bottom: -0.021, top: 0.021 }),
        painted(crown, STRAW, { from: 0.9, to: 1.04, bottom: 0, top: 0.115 }),
        painted(new THREE.CylinderGeometry(0.244, 0.248, 0.05, 36).translate(0, 0.034, 0), SCARF),
      ];
      for (const part of hat) part.rotateX(-0.12).translate(0, top - 0.078, -0.02);
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
              Math.sin(angle) * 0.21,
              HEAD_Y + 0.195 + Math.cos(angle * 2) * 0.01,
              Math.cos(angle) * 0.21,
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
    case 'scarf': {
      const shade = { from: 0.84, to: 1, bottom: COLLAR_Y - 0.1, top: COLLAR_Y + 0.05 };
      return [
        painted(new THREE.TorusGeometry(0.196, 0.052, 10, 26).rotateX(Math.PI / 2)
          .translate(0, COLLAR_Y + 0.005, 0.015), SCARF, shade),
        // Knot and a short tail, hanging over one shoulder.
        painted(new THREE.SphereGeometry(0.062, 12, 10).scale(1, 1, 0.85)
          .translate(-0.125, COLLAR_Y - 0.035, 0.155), SCARF, shade),
        painted(new THREE.CapsuleGeometry(0.042, 0.1, 5, 12).scale(1, 1, 0.6).rotateZ(0.14)
          .translate(-0.155, COLLAR_Y - 0.17, 0.16), SCARF,
        { from: 0.78, to: 0.94, bottom: COLLAR_Y - 0.26, top: COLLAR_Y - 0.06 }),
      ];
    }
    case 'glasses': {
      // Centred on the eyes painted on the face patch.
      const lens = (x: number): THREE.BufferGeometry =>
        painted(new THREE.TorusGeometry(0.055, 0.011, 8, 20).rotateX(-0.25).translate(x, HEAD_Y + 0.06, HEAD_RADIUS * 0.96), PALETTE.ink);
      return [
        lens(-0.065),
        lens(0.065),
        painted(new THREE.BoxGeometry(0.022, 0.01, 0.01).translate(0, HEAD_Y + 0.07, HEAD_RADIUS * 0.98), PALETTE.ink),
      ];
    }
    case 'satchel':
      return [
        painted(new THREE.BoxGeometry(0.15, 0.13, 0.06).translate(0.215, 0.26, 0.06), PALETTE.bench, {
          from: 0.8, to: 1, bottom: 0.19, top: 0.33,
        }),
        painted(new THREE.TorusGeometry(0.25, 0.014, 4, 24).rotateY(Math.PI / 2).rotateX(0.55).translate(0.02, 0.4, 0), PALETTE.benchShade),
      ];
    case 'bowtie': {
      // A contrasting tie, so it does not vanish into the shirt.
      const tie = shirt === PALETTE.roofCool ? PALETTE.roofWarm : PALETTE.roofCool;
      const y = COLLAR_Y - 0.035;
      return [
        painted(new THREE.ConeGeometry(0.045, 0.08, 6).rotateZ(Math.PI / 2).translate(-0.04, y, 0.185), tie),
        painted(new THREE.ConeGeometry(0.045, 0.08, 6).rotateZ(-Math.PI / 2).translate(0.04, y, 0.185), tie),
        painted(new THREE.SphereGeometry(0.022, 6, 4).translate(0, y, 0.195), tie),
      ];
    }
  }
}

/** One avatar, merged. Faces +z. */
export function buildAvatarGeometry(parts: AvatarParts): THREE.BufferGeometry {
  const skin = BODY_COLORS[parts.body] ?? BODY_COLORS[0];
  const shirt = SHIRT_COLORS[parts.shirt] ?? SHIRT_COLORS[0];
  const hairColor = HAIR_COLORS[parts.body] ?? HAIR_COLORS[0];

  const pieces = [
    // Boots, a little apart, just clearing the hem of the body.
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(0.085, 16, 10)
      .scale(1, 0.62, 1.3).translate(side * 0.095, 0.053, 0.015), BOOT)),
    // Body: one round ball, wider than it is deep.
    painted(new THREE.SphereGeometry(BODY_RADIUS, 26, 18).scale(1, 1.02, 0.88)
      .translate(0, BODY_Y, 0), shirt, bodyShade),
    // Short sleeves ending in bare hands.
    ...[-1, 1].map((side) => painted(new THREE.CapsuleGeometry(0.072, 0.07, 5, 12)
      .rotateZ(side * -0.32).translate(side * 0.247, 0.355, 0.01), shirt, bodyShade)),
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(0.062, 14, 10)
      .translate(side * 0.295, 0.254, 0.02), skin, bodyShade)),
    // Head, resting straight on the body: there is no neck.
    painted(
      new THREE.SphereGeometry(HEAD_RADIUS, 26, 18).scale(1, HEAD_SQUASH, 1).translate(0, HEAD_Y, 0),
      skin,
      skinShade,
    ),
    // Tiny ears break up the round head without adding draw calls.
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(0.048, 12, 8)
      .scale(0.7, 1, 0.7).translate(side * 0.295, HEAD_Y - 0.035, 0), skin, skinShade)),
    ...hatParts(parts.hat, hairColor),
    ...accessoryParts(parts.accessory, shirt),
  ];
  return merge(pieces);
}

/**
 * The face: two big dark eyes with a catchlight and a small smile, on a
 * transparent canvas. Shared by every avatar, so the whole crowd costs one
 * texture.
 */
function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

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
