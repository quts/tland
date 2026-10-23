import type Phaser from 'phaser';
import { TILE_SIZE } from '@tland/shared';
import { PALETTE } from './palette.js';
import { GFX_SCALE } from './scale.js';

/**
 * Every tile in the world, drawn with primitives and baked into one texture.
 *
 * Nothing here is loaded from a file: the whole tileset is a strip of
 * `TILE_SIZE` squares produced by `Graphics.generateTexture()` at boot.
 */
export const TILESET_KEY = 'town-tiles';

export const TILE = {
  grassA: 0,
  grassB: 1,
  grassC: 2,
  sandA: 3,
  sandB: 4,
  waterDeep: 5,
  waterMid: 6,
  waterSparkle: 7,
  hillLow: 8,
  hillHigh: 9,
  hillRock: 10,
  pathA: 11,
  pathB: 12,
  bridgeAcross: 13,
  bridgeAlong: 14,
  buildingGround: 15,
  flowerRose: 16,
  flowerCream: 17,
  flowerLilac: 18,
  rock: 19,
  bench: 20,
  treeTrunk: 21,
  treeCanopy: 22,
} as const;

const TILE_COUNT = 23;

type Draw = (g: Phaser.GameObjects.Graphics, ox: number, oy: number) => void;

const S = TILE_SIZE;

/**
 * Transparent-free gutter around every tile.
 *
 * At a fractional camera zoom the GPU samples just outside a tile's edge, and
 * with tiles packed edge to edge that pulls in the neighbouring tile — which
 * shows up as thin seams along every tile boundary. Each tile is drawn into a
 * cell PAD pixels larger on each side, with its background extended into that
 * gutter, so whatever the sampler reaches for is the right colour.
 */
const PAD = 2;
const CELL_SPAN = S + PAD * 2;

/** Fill the tile and its gutter. Coordinates are tile-local. */
function fill(g: Phaser.GameObjects.Graphics, color: number, _ox: number): void {
  g.fillStyle(color, 1);
  g.fillRect(-PAD, -PAD, CELL_SPAN, CELL_SPAN);
}

/** Deterministic speckles, so a tile variant looks the same every run. */
function speckle(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  color: number,
  points: ReadonlyArray<readonly [number, number, number]>,
): void {
  g.fillStyle(color, 1);
  for (const [x, y, r] of points) g.fillCircle(ox + x, y, r);
}

const DRAW: Record<number, Draw> = {
  // All three grass tiles share one base colour: variation lives in the
  // detail, never in the fill, or the map reads as a checkerboard.
  [TILE.grassA]: (g, ox) => {
    fill(g, PALETTE.grass, ox);
    speckle(g, ox, PALETTE.grassAlt, [
      [7, 9, 1.6],
      [22, 20, 1.3],
      [15, 27, 1.1],
    ]);
  },
  [TILE.grassB]: (g, ox) => {
    fill(g, PALETTE.grass, ox);
    speckle(g, ox, PALETTE.grassAlt, [[25, 7, 1.4]]);
    // Little blades of grass.
    g.lineStyle(1.5, PALETTE.grassDeep, 0.55);
    for (const [x, y] of [
      [9, 21],
      [19, 13],
      [24, 26],
    ] as const) {
      g.beginPath();
      g.moveTo(ox + x, y);
      g.lineTo(ox + x - 2, y - 4);
      g.moveTo(ox + x, y);
      g.lineTo(ox + x + 2, y - 4);
      g.strokePath();
    }
  },
  [TILE.grassC]: (g, ox) => {
    fill(g, PALETTE.grass, ox);
    speckle(g, ox, PALETTE.grassAlt, [
      [11, 11, 3],
      [23, 23, 2.4],
    ]);
    speckle(g, ox, PALETTE.grassDeep, [[18, 8, 1.2]]);
  },
  [TILE.sandA]: (g, ox) => {
    fill(g, PALETTE.sand, ox);
    speckle(g, ox, PALETTE.sandAlt, [
      [9, 12, 1.4],
      [21, 22, 1.6],
    ]);
  },
  [TILE.sandB]: (g, ox) => {
    fill(g, PALETTE.sand, ox);
    speckle(g, ox, PALETTE.sandAlt, [
      [14, 9, 2],
      [24, 26, 1.5],
      [6, 24, 1.2],
    ]);
  },
  [TILE.waterDeep]: (g, ox) => fill(g, PALETTE.waterDeep, ox),
  [TILE.waterMid]: (g, ox) => {
    fill(g, PALETTE.water, ox);
    g.lineStyle(2, PALETTE.waterDeep, 0.55);
    g.beginPath();
    g.moveTo(ox + 4, 12);
    g.lineTo(ox + 12, 9);
    g.lineTo(ox + 20, 13);
    g.lineTo(ox + 28, 10);
    g.strokePath();
  },
  [TILE.waterSparkle]: (g, ox) => {
    fill(g, PALETTE.water, ox);
    g.lineStyle(2, PALETTE.waterFoam, 0.8);
    g.beginPath();
    g.moveTo(ox + 6, 20);
    g.lineTo(ox + 14, 18);
    g.moveTo(ox + 19, 26);
    g.lineTo(ox + 27, 24);
    g.strokePath();
  },
  [TILE.hillLow]: (g, ox) => {
    fill(g, PALETTE.hill, ox);
    speckle(g, ox, PALETTE.hillHigh, [
      [11, 11, 4],
      [24, 21, 3.2],
    ]);
  },
  [TILE.hillHigh]: (g, ox) => {
    fill(g, PALETTE.hill, ox);
    speckle(g, ox, PALETTE.hillHigh, [
      [16, 16, 9],
      [8, 24, 4],
    ]);
  },
  [TILE.hillRock]: (g, ox) => {
    fill(g, PALETTE.hill, ox);
    g.fillStyle(PALETTE.hillRock, 1);
    g.fillRoundedRect(ox + 7, 11, 18, 13, 6);
    g.fillStyle(PALETTE.hillHigh, 1);
    g.fillRoundedRect(ox + 10, 13, 10, 6, 3);
  },
  [TILE.pathA]: (g, ox) => {
    fill(g, PALETTE.path, ox);
    speckle(g, ox, PALETTE.pathAlt, [
      [10, 13, 1.5],
      [23, 24, 1.2],
    ]);
  },
  [TILE.pathB]: (g, ox) => {
    fill(g, PALETTE.path, ox);
    speckle(g, ox, PALETTE.pathAlt, [
      [17, 11, 1.8],
      [7, 25, 1.3],
      [27, 6, 1.1],
    ]);
  },
  [TILE.bridgeAcross]: (g, ox) => {
    fill(g, PALETTE.bridge, ox);
    g.fillStyle(PALETTE.bridgePlank, 1);
    // Planks run into the gutter so the pattern lines up across tiles.
    for (let x = 2; x < S; x += 8) g.fillRect(ox + x, -PAD, 4, CELL_SPAN);
    g.fillStyle(PALETTE.ink, 0.25);
    g.fillRect(-PAD, 0, CELL_SPAN, 3);
    g.fillRect(-PAD, S - 3, CELL_SPAN, 3);
  },
  [TILE.bridgeAlong]: (g, ox) => {
    fill(g, PALETTE.bridge, ox);
    g.fillStyle(PALETTE.bridgePlank, 1);
    for (let y = 2; y < S; y += 8) g.fillRect(-PAD, y, CELL_SPAN, 4);
    g.fillStyle(PALETTE.ink, 0.25);
    g.fillRect(0, -PAD, 3, CELL_SPAN);
    g.fillRect(S - 3, -PAD, 3, CELL_SPAN);
  },
  // Footprint under a building: grass with a hint of worn ground, so a
  // building reads as standing in a garden rather than on a tan slab.
  [TILE.buildingGround]: (g, ox) => {
    fill(g, PALETTE.grass, ox);
    speckle(g, ox, PALETTE.grassAlt, [[16, 20, 5]]);
  },
  [TILE.flowerRose]: (g, ox) => drawFlower(g, ox, PALETTE.petalRose),
  [TILE.flowerCream]: (g, ox) => drawFlower(g, ox, PALETTE.petalCream),
  [TILE.flowerLilac]: (g, ox) => drawFlower(g, ox, PALETTE.petalLilac),
  [TILE.rock]: (g, ox) => {
    g.fillStyle(PALETTE.rockShade, 1);
    g.fillEllipse(ox + 16, 24, 20, 9);
    g.fillStyle(PALETTE.rock, 1);
    g.fillRoundedRect(ox + 7, 11, 18, 12, 6);
    g.fillStyle(PALETTE.wall, 0.4);
    g.fillRoundedRect(ox + 11, 13, 7, 4, 2);
  },
  [TILE.bench]: (g, ox) => {
    g.fillStyle(PALETTE.shadow, 0.14);
    g.fillEllipse(ox + 16, 27, 24, 7);
    g.fillStyle(PALETTE.benchShade, 1);
    g.fillRoundedRect(ox + 5, 9, 22, 6, 3);
    g.fillStyle(PALETTE.bench, 1);
    g.fillRoundedRect(ox + 4, 16, 24, 7, 3);
    g.fillStyle(PALETTE.benchShade, 1);
    g.fillRect(ox + 7, 22, 3, 5);
    g.fillRect(ox + 22, 22, 3, 5);
  },
  [TILE.treeTrunk]: (g, ox) => {
    g.fillStyle(PALETTE.shadow, 0.14);
    g.fillEllipse(ox + 16, 27, 22, 8);
    g.fillStyle(PALETTE.trunk, 1);
    g.fillRoundedRect(ox + 12, 8, 8, 18, 3);
    // The canopy's lower edge, so trunk and canopy tiles meet cleanly.
    g.fillStyle(PALETTE.leafDark, 1);
    g.fillEllipse(ox + 16, 6, 28, 16);
  },
  [TILE.treeCanopy]: (g, ox) => {
    g.fillStyle(PALETTE.leafDark, 1);
    g.fillCircle(ox + 16, 22, 14);
    g.fillStyle(PALETTE.leafLight, 1);
    g.fillCircle(ox + 12, 17, 11);
    g.fillCircle(ox + 22, 20, 9);
    g.fillStyle(PALETTE.leafDark, 0.6);
    g.fillCircle(ox + 21, 27, 6);
  },
};

function drawFlower(g: Phaser.GameObjects.Graphics, ox: number, petal: number): void {
  for (const [cx, cy, r] of [
    [11, 18, 3.4],
    [22, 23, 2.8],
  ] as const) {
    g.fillStyle(petal, 1);
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      g.fillCircle(ox + cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, r * 0.72);
    }
    g.fillStyle(PALETTE.petalCore, 1);
    g.fillCircle(ox + cx, cy, r * 0.62);
  }
}

/**
 * Margin, spacing and source tile size the tilemap needs to address the strip.
 * All three are in texture pixels, which are GFX_SCALE times world units.
 */
export const TILESET_MARGIN = PAD * GFX_SCALE;
export const TILESET_SPACING = PAD * 2 * GFX_SCALE;
export const TILESET_SOURCE_SIZE = S * GFX_SCALE;

/** Build the tileset texture. Safe to call more than once. */
export function buildTileset(scene: Phaser.Scene): void {
  if (scene.textures.exists(TILESET_KEY)) return;

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let index = 0; index < TILE_COUNT; index += 1) {
    const draw = DRAW[index];
    if (draw === undefined) throw new Error(`tile ${index} has no draw function`);
    // Each tile draws in its own 0,0-based space; the gutter is negative.
    graphics.save();
    graphics.scaleCanvas(GFX_SCALE, GFX_SCALE);
    graphics.translateCanvas(index * CELL_SPAN + PAD, PAD);
    draw(graphics, 0, 0);
    graphics.restore();
  }
  graphics.generateTexture(
    TILESET_KEY,
    TILE_COUNT * CELL_SPAN * GFX_SCALE,
    CELL_SPAN * GFX_SCALE,
  );
  graphics.destroy();
}
