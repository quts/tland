import type Phaser from 'phaser';
import { TILE_SIZE, getTownMap, hashCoords, type TownMap } from '@tland/shared';
import {
  TILE,
  TILESET_KEY,
  TILESET_MARGIN,
  TILESET_SOURCE_SIZE,
  TILESET_SPACING,
  buildTileset,
} from '../gfx/tileset.js';
import { GFX_SCALE } from '../gfx/scale.js';
import {
  buildBuildingTextures,
  buildingHeight,
  buildingTextureKey,
} from '../gfx/buildings.js';

const VARIATION_SEED = 0x51a7;
const BUILDING_SEED = 0x2f91;

/**
 * How often each building variant appears, out of 100.
 *
 * Towers are landmarks, so they stay rare; a street of them would look like a
 * bug rather than a skyline.
 */
const BUILDING_WEIGHTS = [30, 28, 16, 7, 19] as const;

function pickBuildingVariant(roll: number): number {
  let remaining = roll % 100;
  for (let variant = 0; variant < BUILDING_WEIGHTS.length; variant += 1) {
    remaining -= BUILDING_WEIGHTS[variant] as number;
    if (remaining < 0) return variant;
  }
  return 0;
}

const EMPTY = -1;

/** Pick a terrain tile, varying it per position so large areas are not flat. */
function groundTile(map: TownMap, x: number, y: number): number {
  const roll = hashCoords(x, y, VARIATION_SEED) % 100;

  switch (map.terrainAt(x, y)) {
    case 'grass':
      if (roll < 12) return TILE.grassB;
      if (roll < 24) return TILE.grassC;
      return TILE.grassA;
    case 'sand':
      return roll < 35 ? TILE.sandB : TILE.sandA;
    case 'water': {
      // Keep the shallows lighter than the middle of the river.
      const nearLand =
        map.terrainAt(x - 1, y) !== 'water' ||
        map.terrainAt(x + 1, y) !== 'water' ||
        map.terrainAt(x, y - 1) !== 'water' ||
        map.terrainAt(x, y + 1) !== 'water';
      if (nearLand) return TILE.waterSparkle;
      return roll < 30 ? TILE.waterMid : TILE.waterDeep;
    }
    case 'hill':
      if (roll < 10) return TILE.hillRock;
      return roll < 50 ? TILE.hillHigh : TILE.hillLow;
    case 'path':
      return roll < 40 ? TILE.pathB : TILE.pathA;
    case 'bridge': {
      // Planks run across the direction of travel.
      const eastWest =
        map.terrainAt(x - 1, y) === 'bridge' || map.terrainAt(x + 1, y) === 'bridge';
      return eastWest ? TILE.bridgeAcross : TILE.bridgeAlong;
    }
    case 'building':
      return TILE.buildingGround;
  }
}

function propTile(map: TownMap, x: number, y: number): number {
  switch (map.propAt(x, y)) {
    case 'none':
      return EMPTY;
    case 'tree':
      return TILE.treeTrunk;
    case 'bench':
      return TILE.bench;
    case 'rock':
      return TILE.rock;
    case 'flower': {
      const roll = hashCoords(x, y, VARIATION_SEED + 1) % 3;
      if (roll === 0) return TILE.flowerRose;
      return roll === 1 ? TILE.flowerCream : TILE.flowerLilac;
    }
  }
}

export interface BuiltWorld {
  readonly map: TownMap;
  readonly ground: Phaser.Tilemaps.TilemapLayer;
  readonly props: Phaser.Tilemaps.TilemapLayer;
  /** Tree canopies, drawn above the players so they can walk behind a tree. */
  readonly canopy: Phaser.Tilemaps.TilemapLayer;
  readonly widthPixels: number;
  readonly heightPixels: number;
}

/**
 * Build the world from the shared map data.
 *
 * Three tilemap layers rather than loose sprites: Phaser culls tilemap layers
 * to the camera, which is what keeps a 160x120 world at 60fps on a phone.
 */
export function buildWorld(scene: Phaser.Scene, depths: {
  ground: number;
  props: number;
  buildings: number;
  canopy: number;
}): BuiltWorld {
  buildTileset(scene);
  buildBuildingTextures(scene);

  const map = getTownMap();
  const groundData: number[][] = [];
  const propData: number[][] = [];
  const canopyData: number[][] = [];

  for (let y = 0; y < map.height; y += 1) {
    const groundRow = new Array<number>(map.width);
    const propRow = new Array<number>(map.width);
    const canopyRow = new Array<number>(map.width);
    for (let x = 0; x < map.width; x += 1) {
      groundRow[x] = groundTile(map, x, y);
      propRow[x] = propTile(map, x, y);
      // A trunk one tile below means this tile holds that tree's canopy.
      canopyRow[x] = map.propAt(x, y + 1) === 'tree' ? TILE.treeCanopy : EMPTY;
    }
    groundData.push(groundRow);
    propData.push(propRow);
    canopyData.push(canopyRow);
  }

  const make = (data: number[][], depth: number): Phaser.Tilemaps.TilemapLayer => {
    // The tilemap is built at texture resolution and then scaled back down,
    // so a tile covers TILE_SIZE world units while being drawn from a
    // GFX_SCALE-times-larger source image.
    const tilemap = scene.make.tilemap({
      data,
      tileWidth: TILESET_SOURCE_SIZE,
      tileHeight: TILESET_SOURCE_SIZE,
    });
    const tileset = tilemap.addTilesetImage(
      TILESET_KEY,
      TILESET_KEY,
      TILESET_SOURCE_SIZE,
      TILESET_SOURCE_SIZE,
      TILESET_MARGIN,
      TILESET_SPACING,
    );
    if (tileset === null) throw new Error('could not attach the tileset');
    const layer = tilemap.createLayer(0, tileset, 0, 0);
    if (layer === null) throw new Error('could not create a tilemap layer');
    layer.setOrigin(0, 0);
    layer.setScale(1 / GFX_SCALE);
    layer.setDepth(depth);
    return layer;
  };

  const ground = make(groundData, depths.ground);
  const props = make(propData, depths.props);
  const canopy = make(canopyData, depths.canopy);

  placeBuildings(scene, map, depths.buildings);

  return {
    map,
    ground,
    props,
    canopy,
    widthPixels: map.width * TILE_SIZE,
    heightPixels: map.height * TILE_SIZE,
  };
}

/**
 * One sprite per authored building cell.
 *
 * Buildings are authored on the coarse grid, so a 4x4 block of building tiles
 * whose top-left corner falls on a cell boundary marks exactly one building.
 * Their depth follows their base, so a player behind one is drawn behind it.
 */
function placeBuildings(scene: Phaser.Scene, map: TownMap, depthBase: number): void {
  const cell = 4;
  for (let cy = 0; cy < map.height; cy += cell) {
    for (let cx = 0; cx < map.width; cx += cell) {
      if (map.terrainAt(cx, cy) !== 'building') continue;

      const variant = pickBuildingVariant(hashCoords(cx, cy, BUILDING_SEED));
      const baseY = (cy + cell) * TILE_SIZE;
      const sprite = scene.add.image(
        cx * TILE_SIZE,
        baseY - buildingHeight(variant),
        buildingTextureKey(variant),
      );
      sprite.setOrigin(0, 0);
      // Drawn at texture resolution, displayed at world resolution.
      sprite.setScale(1 / GFX_SCALE);
      sprite.setDepth(depthBase + baseY);
    }
  }
}
