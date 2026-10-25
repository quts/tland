import { CHARACTER_PALETTES, type CharacterColors } from './characterColors.js';
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
  0xfbe0c6, 0xe8cdb0, 0xc99a74, 0x9a6a4c, 0xf0d6e6, 0xb9d8ef, 0xc7e8c0, 0xf6dd9a,
] as const;

export const SHIRT_COLORS = CHARACTER_PALETTES.map(({ colors }) => Number.parseInt(colors.outfit.slice(1), 16));

/** Hair, picked by skin so a crowd is not all one colour. */
export const HAIR_COLORS = [
  0x5c4232, 0x8a6142, 0x4a3c34, 0x5a4033, 0x7d5a6e, 0x56637a, 0x6a7a52, 0x9a7444,
] as const;

/** Fixed character colours, shared by both views so they dress the same. */
export const SCARF = 0xe0796b;
export const BOOT = 0x4b3a2f;
export const STRAW = 0xf2d58a;
export const EYE = 0x2f2420;
export const MOUTH = 0x5b4237;

/**
 * What a player picks.
 *
 * Colour, and only colour. The straw hat and the scarf are part of the
 * character's design rather than things it wears, so there is nothing to
 * equip or swap: every character is the same shape.
 */
export interface AvatarParts {
  /** Index into BODY_COLORS. */
  body: number;
  /** Index into SHIRT_COLORS. */
  shirt: number;
}

export const DEFAULT_AVATAR: AvatarParts = { body: 0, shirt: 4 };

/** Clamp anything that arrived over the wire into a drawable avatar. */
export function sanitizeAvatar(value: unknown): AvatarParts {
  const source = (value ?? {}) as Partial<Record<keyof AvatarParts, unknown>>;
  const body = Number(source.body);
  const shirt = Number(source.shirt);
  return {
    body: Number.isInteger(body) ? Math.abs(body) % BODY_COLORS.length : 0,
    shirt: Number.isInteger(shirt) ? Math.abs(shirt) % SHIRT_COLORS.length : 0,
  };
}

export function avatarTextureKey(parts: AvatarParts): string {
  return `avatar-${parts.body}-${parts.shirt}`;
}

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** The colours one avatar is drawn with, in both views. */
export function characterColorsFor(parts: AvatarParts): CharacterColors {
  return {
    ...(CHARACTER_PALETTES[parts.shirt] ?? CHARACTER_PALETTES[0])!.colors,
    skin: hex(BODY_COLORS[parts.body] ?? BODY_COLORS[0]),
    hair: hex(HAIR_COLORS[parts.body] ?? HAIR_COLORS[0]),
  };
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
  facing: number,
  headY: number,
  colors: CharacterColors,
): void {
  const straw = Number.parseInt(colors.hat.slice(1), 16);
  const ribbon = Number.parseInt(colors.hatRibbon.slice(1), 16);
  const cx = ox + CX;
  const brow = headY - 4;
  void facing;
  // A straw boater: flat crown, coral band, wide flat brim. It rides high on
  // the skull, the way the 3D one does, so the fringe stays visible.
  outlinedRoundedRect(g, cx - 9, brow - 9.5, 18, 9, 3.5, straw);
  g.fillStyle(ribbon, 1);
  g.fillRect(cx - 9, brow - 7.5, 18, 2);
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(cx, brow - 3, 36, 9);
  g.fillStyle(straw, 1);
  g.fillEllipse(cx, brow - 3, 32, 6);
}

function drawScarf(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  facing: number,
  bodyY: number,
  colors: CharacterColors,
): void {
  const scarf = Number.parseInt(colors.scarf.slice(1), 16);
  const cx = ox + CX;
  outlinedRoundedRect(g, cx - 10, bodyY - 2.5, 20, 6, 3, scarf);
  if (facing === FACING.down) {
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(cx - 7.5, bodyY + 2, 6, 10, 3);
    g.fillStyle(scarf, 1);
    g.fillRoundedRect(cx - 6.5, bodyY + 3, 4, 8, 2);
  }
}

/* Vertical layout, measured down from the top of the frame. */
const FEET_Y = FRAME_HEIGHT - 4;
const BODY_BOTTOM = FEET_Y - 4;
const BODY_TOP = BODY_BOTTOM - 16;
const HEAD_Y = BODY_TOP - 7;
const HEAD_RADIUS = 10.5;

function drawFrame(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  parts: AvatarParts,
  facing: number,
): void {
  const colors = characterColorsFor(parts);
  const skin = BODY_COLORS[parts.body] ?? (BODY_COLORS[0] as number);
  const shirt = SHIRT_COLORS[parts.shirt] ?? (SHIRT_COLORS[0] as number);
  const cx = ox + CX;

  // Contact shadow.
  g.fillStyle(PALETTE.shadow, 0.16);
  g.fillEllipse(cx, FEET_Y + 1, 21, 7);

  // Boots.
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(cx - 8.5, FEET_Y - 5.5, 8, 7.5, 3.5);
  g.fillRoundedRect(cx + 0.5, FEET_Y - 5.5, 8, 7.5, 3.5);
  g.fillStyle(Number.parseInt(colors.shoes.slice(1), 16), 1);
  g.fillRoundedRect(cx - 7.5, FEET_Y - 4.5, 6, 5.5, 2.5);
  g.fillRoundedRect(cx + 1.5, FEET_Y - 4.5, 6, 5.5, 2.5);

  // Arms: a sleeve hanging from the collar with a bare hand at its end,
  // drawn behind the torso so the shoulder sinks into the body.
  for (const side of [-1, 1] as const) {
    outlinedRoundedRect(g, cx + side * 10 - 3, BODY_TOP + 2.5, 6, 10, 3, shirt);
    outlinedCircle(g, cx + side * 11.5, BODY_TOP + 12, 3.1, skin);
  }

  // Torso: one round ball, the head sitting straight on it.
  outlinedRoundedRect(g, cx - 10, BODY_TOP, 20, 17, 9, shirt);

  drawScarf(g, ox, facing, BODY_TOP, colors);

  // Head.
  outlinedCircle(g, cx, HEAD_Y, HEAD_RADIUS, skin);

  // Hair: a bowl cut — a full cap, with the face painted back in below the
  // fringe. From behind there is no face to cut out, so the cap stands alone.
  const hair = HAIR_COLORS[parts.body] ?? (HAIR_COLORS[0] as number);
  const r = HEAD_RADIUS - 0.5;
  g.fillStyle(hair, 1);
  g.fillCircle(cx, HEAD_Y, r);
  if (facing !== FACING.up) {
    // The fringe line, just above the eyes.
    const drop = -0.5;
    const half = Math.sqrt(r * r - drop * drop);
    g.fillStyle(skin, 1);
    g.beginPath();
    g.moveTo(cx - half, HEAD_Y - drop);
    g.lineTo(cx + half, HEAD_Y - drop);
    g.arc(cx, HEAD_Y, r, Math.atan2(-drop, half), Math.atan2(-drop, -half), false);
    g.closePath();
    g.fillPath();
  }
  g.fillStyle(hair, 1);
  if (facing === FACING.side) {
    // The back of the cut, hanging past the ear.
    g.fillCircle(cx - 5.5, HEAD_Y + 2, 4.4);
  } else if (facing === FACING.down) {
    // The sides of the bowl, framing the face past the ears.
    g.fillCircle(cx - 7, HEAD_Y + 2, 3);
    g.fillCircle(cx + 7, HEAD_Y + 2, 3);
  }

  // Face: big dark eyes with a catchlight, and a small smile.
  if (facing !== FACING.up) {
    const eyes = facing === FACING.down ? ([-1, 1] as const) : ([1] as const);
    for (const side of eyes) {
      g.fillStyle(EYE, 1);
      g.fillCircle(cx + side * 4.6, HEAD_Y + 4, 2.2);
      g.fillStyle(PALETTE.wall, 1);
      g.fillCircle(cx + side * 4.6 - 0.8, HEAD_Y + 3.2, 0.85);
    }
    if (facing === FACING.down) {
      g.lineStyle(1.2, MOUTH, 1);
      g.beginPath();
      g.arc(cx, HEAD_Y + 6.2, 2.1, Math.PI * 0.14, Math.PI * 0.86);
      g.strokePath();
    }
  }

  drawHat(g, ox, facing, HEAD_Y, colors);
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
