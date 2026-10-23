import type Phaser from 'phaser';
import { PALETTE } from './palette.js';
import { GFX_SCALE } from './scale.js';

/**
 * Avatars, assembled from original parts drawn in code.
 *
 * Three frames per avatar — facing down, up, and to the side — with the side
 * frame mirrored for the fourth direction. Walking is a bob tween rather than
 * extra frames, which keeps texture generation cheap enough to do on the fly
 * for every player who joins.
 */
/** Frame size in world units. The texture itself is GFX_SCALE times larger. */
export const FRAME_WIDTH = 36;
export const FRAME_HEIGHT = 52;
export const TEXTURE_FRAME_WIDTH = FRAME_WIDTH * GFX_SCALE;
export const TEXTURE_FRAME_HEIGHT = FRAME_HEIGHT * GFX_SCALE;

export const FACING = { down: 0, up: 1, side: 2 } as const;
export type Facing = keyof typeof FACING;

/** Skin-neutral, friendly body colours. */
export const BODY_COLORS = [
  0xf4b9a0, 0xe8cdb0, 0xc99a74, 0x9a6a4c, 0xf0d6e6, 0xb9d8ef, 0xc7e8c0, 0xf6dd9a,
] as const;

export const SHIRT_COLORS = [
  0xf3b8bf, 0x8fb8d9, 0x90c9ae, 0xfbe8a6, 0xc9b6e4, 0xf0a978, 0xa9c6f0, 0xe9e2d4,
] as const;

export const HATS = ['none', 'cap', 'sunhat', 'beanie', 'bloom'] as const;
export type Hat = (typeof HATS)[number];

export const ACCESSORIES = ['none', 'scarf', 'glasses', 'satchel', 'bowtie'] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export interface AvatarParts {
  /** Index into BODY_COLORS. */
  body: number;
  /** Index into SHIRT_COLORS. */
  shirt: number;
  hat: Hat;
  accessory: Accessory;
}

export const DEFAULT_AVATAR: AvatarParts = {
  body: 0,
  shirt: 0,
  hat: 'none',
  accessory: 'none',
};

/** Clamp anything that arrived over the wire into a drawable avatar. */
export function sanitizeAvatar(value: unknown): AvatarParts {
  const source = (value ?? {}) as Partial<Record<keyof AvatarParts, unknown>>;
  const body = Number(source.body);
  const shirt = Number(source.shirt);
  const hat = source.hat as Hat;
  const accessory = source.accessory as Accessory;
  return {
    body: Number.isInteger(body) ? Math.abs(body) % BODY_COLORS.length : 0,
    shirt: Number.isInteger(shirt) ? Math.abs(shirt) % SHIRT_COLORS.length : 0,
    hat: HATS.includes(hat) ? hat : 'none',
    accessory: ACCESSORIES.includes(accessory) ? accessory : 'none',
  };
}

export function avatarTextureKey(parts: AvatarParts): string {
  return `avatar-${parts.body}-${parts.shirt}-${parts.hat}-${parts.accessory}`;
}

const CX = FRAME_WIDTH / 2;
const OUTLINE = PALETTE.ink;

function outlinedCircle(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(x, y, radius + 2);
  g.fillStyle(color, 1);
  g.fillCircle(x, y, radius);
}

function outlinedRoundedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  color: number,
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, radius + 2);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x, y, w, h, radius);
}

function drawHat(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  hat: Hat,
  facing: number,
  headY: number,
): void {
  const cx = ox + CX;
  // Where the hat sits on the skull.
  const brow = headY - 4;

  switch (hat) {
    case 'none':
      return;
    case 'cap':
      outlinedRoundedRect(g, cx - 9.5, brow - 7, 19, 9, 4.5, PALETTE.roofCool);
      if (facing !== FACING.up) {
        g.fillStyle(OUTLINE, 1);
        g.fillRoundedRect(cx - 3, brow + 1, 15, 5, 2.5);
        g.fillStyle(PALETTE.roofCool, 1);
        g.fillRoundedRect(cx - 2, brow + 2, 13, 3, 1.5);
      }
      return;
    case 'sunhat':
      g.fillStyle(OUTLINE, 1);
      g.fillEllipse(cx, brow + 1, 32, 11);
      g.fillStyle(PALETTE.petalCream, 1);
      g.fillEllipse(cx, brow + 1, 28, 7.5);
      outlinedRoundedRect(g, cx - 8, brow - 8, 16, 10, 5, PALETTE.petalCream);
      return;
    case 'beanie':
      outlinedRoundedRect(g, cx - 9.5, brow - 7, 19, 11, 6, PALETTE.petalLilac);
      outlinedCircle(g, cx, brow - 9, 2.6, PALETTE.wall);
      return;
    case 'bloom':
      for (const [dx, color] of [
        [-6.5, PALETTE.petalRose],
        [0, PALETTE.petalCream],
        [6.5, PALETTE.petalLilac],
      ] as const) {
        g.fillStyle(color, 1);
        for (let i = 0; i < 5; i += 1) {
          const angle = (i / 5) * Math.PI * 2;
          g.fillCircle(
            cx + dx + Math.cos(angle) * 2.6,
            brow - 3 + Math.sin(angle) * 2.6,
            2.1,
          );
        }
        g.fillStyle(PALETTE.petalCore, 1);
        g.fillCircle(cx + dx, brow - 3, 1.8);
      }
      return;
  }
}

function drawAccessory(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  accessory: Accessory,
  facing: number,
  bodyY: number,
  headY: number,
): void {
  const cx = ox + CX;
  switch (accessory) {
    case 'none':
      return;
    case 'scarf':
      outlinedRoundedRect(g, cx - 9.5, bodyY - 2.5, 19, 6, 3, PALETTE.roofWarm);
      if (facing === FACING.down) {
        g.fillStyle(OUTLINE, 1);
        g.fillRoundedRect(cx + 1.5, bodyY + 2, 6, 10, 3);
        g.fillStyle(PALETTE.roofWarm, 1);
        g.fillRoundedRect(cx + 2.5, bodyY + 3, 4, 8, 2);
      }
      return;
    case 'glasses':
      if (facing === FACING.up) return;
      g.lineStyle(1.6, OUTLINE, 1);
      if (facing === FACING.down) {
        g.strokeCircle(cx - 3.6, headY + 3, 3.2);
        g.strokeCircle(cx + 3.6, headY + 3, 3.2);
        g.beginPath();
        g.moveTo(cx - 0.4, headY + 3);
        g.lineTo(cx + 0.4, headY + 3);
        g.strokePath();
      } else {
        g.strokeCircle(cx + 3.8, headY + 3, 3.2);
      }
      return;
    case 'satchel':
      outlinedRoundedRect(g, cx + 5, bodyY + 6, 8, 9, 3, PALETTE.bridge);
      g.lineStyle(1.8, OUTLINE, 1);
      g.beginPath();
      g.moveTo(cx + 9, bodyY + 6);
      g.lineTo(cx - 2, bodyY);
      g.strokePath();
      return;
    case 'bowtie':
      if (facing === FACING.up) return;
      g.fillStyle(OUTLINE, 1);
      g.fillTriangle(cx - 8, bodyY - 1, cx - 1, bodyY + 2.5, cx - 8, bodyY + 6);
      g.fillTriangle(cx + 8, bodyY - 1, cx + 1, bodyY + 2.5, cx + 8, bodyY + 6);
      g.fillStyle(PALETTE.roofWarm, 1);
      g.fillTriangle(cx - 6, bodyY + 0.5, cx - 2, bodyY + 2.5, cx - 6, bodyY + 4.5);
      g.fillTriangle(cx + 6, bodyY + 0.5, cx + 2, bodyY + 2.5, cx + 6, bodyY + 4.5);
      return;
  }
}

/* Vertical layout, measured down from the top of the frame. */
const FEET_Y = FRAME_HEIGHT - 4;
const BODY_BOTTOM = FEET_Y - 4;
const BODY_TOP = BODY_BOTTOM - 17;
const HEAD_Y = BODY_TOP - 8;
const HEAD_RADIUS = 9.5;

function drawFrame(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  parts: AvatarParts,
  facing: number,
): void {
  const skin = BODY_COLORS[parts.body] ?? (BODY_COLORS[0] as number);
  const shirt = SHIRT_COLORS[parts.shirt] ?? (SHIRT_COLORS[0] as number);
  const cx = ox + CX;

  // Contact shadow.
  g.fillStyle(PALETTE.shadow, 0.16);
  g.fillEllipse(cx, FEET_Y + 1, 21, 7);

  // Shoes.
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(cx - 8, FEET_Y - 5, 7.5, 7, 3);
  g.fillRoundedRect(cx + 0.5, FEET_Y - 5, 7.5, 7, 3);

  // Arms, behind the torso so the sleeves tuck in neatly.
  for (const side of [-1, 1] as const) {
    outlinedRoundedRect(
      g,
      cx + side * 11 - 2.5,
      BODY_TOP + 3,
      5,
      11,
      2.5,
      shirt,
    );
    // Hand.
    outlinedCircle(g, cx + side * 11, BODY_TOP + 15, 2.6, skin);
  }

  // Torso.
  outlinedRoundedRect(g, cx - 9.5, BODY_TOP, 19, 17, 7, shirt);

  drawAccessory(g, ox, parts.accessory, facing, BODY_TOP, HEAD_Y);

  // Head.
  outlinedCircle(g, cx, HEAD_Y, HEAD_RADIUS, skin);

  // Hair: a cap of colour that reads from every angle.
  g.fillStyle(PALETTE.inkSoft, 1);
  if (facing === FACING.up) {
    g.fillCircle(cx, HEAD_Y, HEAD_RADIUS - 0.5);
  } else {
    g.beginPath();
    g.arc(cx, HEAD_Y, HEAD_RADIUS - 0.5, Math.PI, Math.PI * 2);
    g.closePath();
    g.fillPath();
  }

  // Face.
  if (facing === FACING.down) {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(cx - 3.6, HEAD_Y + 3, 1.7);
    g.fillCircle(cx + 3.6, HEAD_Y + 3, 1.7);
    g.fillStyle(PALETTE.petalRose, 0.7);
    g.fillCircle(cx - 6.8, HEAD_Y + 5.5, 2.1);
    g.fillCircle(cx + 6.8, HEAD_Y + 5.5, 2.1);
  } else if (facing === FACING.side) {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(cx + 3.8, HEAD_Y + 3, 1.7);
    g.fillStyle(PALETTE.petalRose, 0.7);
    g.fillCircle(cx + 6.8, HEAD_Y + 5.5, 2.1);
  }

  drawHat(g, ox, parts.hat, facing, HEAD_Y);
}

/**
 * Generate (or reuse) the texture for one avatar. Returns the texture key.
 */
export function buildAvatarTexture(scene: Phaser.Scene, parts: AvatarParts): string {
  const key = avatarTextureKey(parts);
  if (scene.textures.exists(key)) return key;

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.scaleCanvas(GFX_SCALE, GFX_SCALE);
  for (const facing of [FACING.down, FACING.up, FACING.side]) {
    drawFrame(graphics, facing * FRAME_WIDTH, parts, facing);
  }
  graphics.generateTexture(
    key,
    TEXTURE_FRAME_WIDTH * 3,
    TEXTURE_FRAME_HEIGHT,
  );
  graphics.destroy();

  // Re-register as a spritesheet so the three frames are addressable.
  const texture = scene.textures.get(key);
  for (const facing of [FACING.down, FACING.up, FACING.side]) {
    texture.add(
      facing,
      0,
      facing * TEXTURE_FRAME_WIDTH,
      0,
      TEXTURE_FRAME_WIDTH,
      TEXTURE_FRAME_HEIGHT,
    );
  }
  return key;
}
