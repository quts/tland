import type Phaser from 'phaser';
import { TILE_SIZE } from '@tland/shared';
import { PALETTE } from './palette.js';
import { GFX_SCALE } from './scale.js';

/**
 * Generic buildings, drawn in code.
 *
 * Shapes are deliberately plain and invented: a shophouse, a little hall with
 * a curved roof, a tall tower. Nothing here copies a real building, and no
 * real organization's logo, emblem or signage appears on any of them.
 */
const CELL = TILE_SIZE * 4;

export const BUILDING_VARIANTS = 5;

export function buildingTextureKey(variant: number): string {
  return `building-${variant}`;
}

/** Height of each variant's texture; the sprite is anchored at its base. */
const HEIGHTS = [CELL, CELL, CELL + 40, CELL + 72, CELL] as const;

export function buildingHeight(variant: number): number {
  return HEIGHTS[variant % BUILDING_VARIANTS] as number;
}

const ROOFS = [PALETTE.roofWarm, PALETTE.roofCool, PALETTE.roofMint] as const;

function outlineRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fillColor: number,
): void {
  g.fillStyle(PALETTE.ink, 1);
  g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, radius + 3);
  g.fillStyle(fillColor, 1);
  g.fillRoundedRect(x, y, w, h, radius);
}

function windows(
  g: Phaser.GameObjects.Graphics,
  left: number,
  top: number,
  columns: number,
  rows: number,
  gap: number,
): void {
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      g.fillStyle(PALETTE.ink, 1);
      g.fillRoundedRect(left + column * gap - 2, top + row * gap - 2, 18, 18, 6);
      g.fillStyle(PALETTE.roofCool, 1);
      g.fillRoundedRect(left + column * gap, top + row * gap, 14, 14, 4);
    }
  }
}

function door(g: Phaser.GameObjects.Graphics, cx: number, baseY: number): void {
  g.fillStyle(PALETTE.ink, 1);
  g.fillRoundedRect(cx - 14, baseY - 32, 28, 32, 10);
  g.fillStyle(PALETTE.door, 1);
  g.fillRoundedRect(cx - 11, baseY - 29, 22, 29, 8);
  g.fillStyle(PALETTE.petalCream, 1);
  g.fillCircle(cx + 6, baseY - 15, 2.5);
}

type DrawBuilding = (g: Phaser.GameObjects.Graphics, height: number) => void;

const DRAW: readonly DrawBuilding[] = [
  // 0 — shophouse with a flat awning.
  (g, h) => {
    outlineRect(g, 10, h - 86, CELL - 20, 86, 10, PALETTE.wall);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(4, h - 100, CELL - 8, 20, 8);
    g.fillStyle(ROOFS[0], 1);
    g.fillRoundedRect(7, h - 97, CELL - 14, 14, 6);
    windows(g, 24, h - 72, 2, 1, 40);
    door(g, CELL / 2, h - 4);
  },
  // 1 — two-storey house with a pitched roof.
  (g, h) => {
    outlineRect(g, 14, h - 78, CELL - 28, 78, 10, PALETTE.wallAlt);
    g.fillStyle(PALETTE.ink, 1);
    g.beginPath();
    g.moveTo(CELL / 2, h - 122);
    g.lineTo(CELL - 4, h - 74);
    g.lineTo(4, h - 74);
    g.closePath();
    g.fillPath();
    g.fillStyle(ROOFS[1], 1);
    g.beginPath();
    g.moveTo(CELL / 2, h - 116);
    g.lineTo(CELL - 12, h - 78);
    g.lineTo(12, h - 78);
    g.closePath();
    g.fillPath();
    windows(g, 30, h - 64, 2, 1, 36);
    door(g, CELL / 2, h - 4);
  },
  // 2 — a little hall with a curved, upturned roof.
  (g, h) => {
    outlineRect(g, 16, h - 76, CELL - 32, 76, 8, PALETTE.wall);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(0, h - 104, CELL, 30, 14);
    g.fillStyle(ROOFS[0], 1);
    g.fillRoundedRect(4, h - 100, CELL - 8, 22, 11);
    // Upturned eaves, as two small wedges.
    g.fillStyle(ROOFS[0], 1);
    g.fillTriangle(0, h - 82, 18, h - 92, 18, h - 78);
    g.fillTriangle(CELL, h - 82, CELL - 18, h - 92, CELL - 18, h - 78);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(CELL / 2 - 20, h - 118, 40, 16, 7);
    g.fillStyle(ROOFS[2], 1);
    g.fillRoundedRect(CELL / 2 - 16, h - 115, 32, 10, 5);
    door(g, CELL / 2, h - 4);
  },
  // 3 — a tall tower, tapering as it rises.
  (g, h) => {
    const segments = 5;
    for (let i = 0; i < segments; i += 1) {
      const inset = 18 + i * 7;
      const top = h - 48 - i * 34;
      outlineRect(
        g,
        inset,
        top,
        CELL - inset * 2,
        34,
        8,
        i % 2 === 0 ? PALETTE.wall : PALETTE.wallAlt,
      );
    }
    outlineRect(g, 14, h - 52, CELL - 28, 52, 10, PALETTE.wallAlt);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(CELL / 2 - 5, h - 48 - segments * 34 - 18, 10, 20, 5);
    g.fillStyle(ROOFS[2], 1);
    g.fillCircle(CELL / 2, h - 48 - segments * 34 - 20, 7);
    door(g, CELL / 2, h - 4);
  },
  // 4 — a small market stall: a counter under a striped awning.
  (g, h) => {
    // Posts first, so the counter and awning sit in front of them.
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(16, h - 70, 6, 62, 3);
    g.fillRoundedRect(CELL - 22, h - 70, 6, 62, 3);

    outlineRect(g, 12, h - 34, CELL - 24, 30, 6, PALETTE.wallAlt);
    g.fillStyle(PALETTE.bridge, 1);
    g.fillRoundedRect(16, h - 30, CELL - 32, 7, 3);

    // Crates and baskets of goods on the counter.
    for (const [x, color] of [
      [26, PALETTE.roofWarm],
      [52, PALETTE.petalCream],
      [78, PALETTE.roofMint],
    ] as const) {
      g.fillStyle(PALETTE.ink, 1);
      g.fillRoundedRect(x - 2, h - 48, 20, 16, 5);
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, h - 46, 16, 12, 4);
    }

    // Striped awning with a scalloped hem.
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(4, h - 78, CELL - 8, 20, 7);
    const stripe = (CELL - 14) / 6;
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle(i % 2 === 0 ? ROOFS[0] : PALETTE.wall, 1);
      g.fillRect(7 + i * stripe, h - 75, stripe, 14);
    }
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle(i % 2 === 0 ? ROOFS[0] : PALETTE.wall, 1);
      g.fillCircle(7 + i * stripe + stripe / 2, h - 61, stripe / 2);
    }
  },
];

/** Build every building texture. Safe to call more than once. */
export function buildBuildingTextures(scene: Phaser.Scene): void {
  for (let variant = 0; variant < BUILDING_VARIANTS; variant += 1) {
    const key = buildingTextureKey(variant);
    if (scene.textures.exists(key)) continue;

    const height = buildingHeight(variant);
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.scaleCanvas(GFX_SCALE, GFX_SCALE);
    // A soft contact shadow keeps the building from floating on the grass.
    graphics.fillStyle(PALETTE.shadow, 0.13);
    graphics.fillEllipse(CELL / 2, height - 4, CELL - 10, 18);
    (DRAW[variant] as DrawBuilding)(graphics, height);
    graphics.generateTexture(key, CELL * GFX_SCALE, height * GFX_SCALE);
    graphics.destroy();
  }
}
