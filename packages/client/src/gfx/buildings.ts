import type Phaser from 'phaser';
import { TILE_SIZE } from '@tland/shared';
import { GFX_SCALE } from './scale.js';
import { HOUSE_COLORS } from '../world/buildingLayout.js';

const CELL = TILE_SIZE * 4;
export const BUILDING_VARIANTS = HOUSE_COLORS.length;
export const buildingTextureKey = (variant: number): string => 'building-' + variant;
export const buildingHeight = (_variant: number): number => CELL + 22;

/** Front elevation of the same fixed cottage used in 3D, drawn entirely in code. */
export function buildBuildingTextures(scene: Phaser.Scene): void {
  HOUSE_COLORS.forEach(([wall, roof, door], variant) => {
    const key = buildingTextureKey(variant);
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.scaleCanvas(GFX_SCALE, GFX_SCALE);
    const h = buildingHeight(variant);
    const rounded = (x: number, y: number, w: number, hh: number, r: number, color: number): void => {
      g.fillStyle(color); g.fillRoundedRect(x, y, w, hh, r);
    };
    rounded(2, h - 16, 124, 14, 7, 0xb2c780);
    rounded(15, h - 90, 98, 77, 5, wall);
    rounded(12, h - 22, 104, 8, 2, 0xd8cdb2);
    // Broad roof plane, chimney and rounded eaves.
    g.fillStyle(roof); g.beginPath();
    g.moveTo(15, h - 126); g.lineTo(113, h - 126);
    g.lineTo(125, h - 86); g.lineTo(3, h - 86); g.closePath(); g.fillPath();
    rounded(3, h - 90, 122, 7, 3, roof);
    rounded(91, h - 137, 11, 26, 2, 0xf1e2c4);
    rounded(88, h - 139, 17, 6, 2, 0xf8ecd2);
    rounded(51, h - 61, 27, 46, 13, 0xf8ecd2);
    rounded(54, h - 58, 21, 43, 10, door);
    g.lineStyle(1, 0x946838, 0.6);
    for (const x of [59, 65, 71]) g.lineBetween(x, h - 53, x, h - 17);
    g.fillStyle(0xe8bb4c); g.fillCircle(70, h - 36, 2);
    for (const x of [32, 96]) {
      rounded(x - 12, h - 66, 24, 30, 12, 0xf8ecd2);
      rounded(x - 9, h - 63, 18, 25, 9, 0x79adc2);
      g.lineStyle(2, 0xf8ecd2); g.lineBetween(x, h - 62, x, h - 38);
      g.lineBetween(x - 9, h - 49, x + 9, h - 49);
      rounded(x - 15, h - 38, 30, 7, 2, 0xba8249);
      for (let i = -1; i <= 1; i++) {
        g.fillStyle(0x75a354); g.fillCircle(x + i * 8, h - 39, 4);
        g.fillStyle(0xfff8e5); g.fillCircle(x + i * 8, h - 41, 2.4);
        g.fillStyle(0xf3ce55); g.fillCircle(x + i * 8, h - 41, 1);
      }
    }
    rounded(26, h - 80, 76, 15, 5, 0xe9c797);
    rounded(48, h - 17, 33, 5, 2, 0xf8ecd2);
    rounded(44, h - 12, 41, 5, 2, 0xf8ecd2);
    for (const x of [15, 27, 102, 114]) {
      g.fillStyle(0x75a354); g.fillCircle(x, h - 15, x % 2 ? 8 : 6);
    }
    g.generateTexture(key, CELL * GFX_SCALE, h * GFX_SCALE);
    g.destroy();
  });
}
