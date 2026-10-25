import type { TownMap } from '@tland/shared';
import houseData from '../../../shared/src/map/houses.json' with { type: 'json' };

export const HOUSE_DATA = houseData;
export const BUILDING_CELL = 4;
export const HOUSE_NAMES = houseData.houses.map(house => house.name);
export const BUILDING_VARIANTS = 13;

export interface BuildingPlot {
  readonly x: number;
  readonly y: number;
  readonly variant: number;
  readonly name: string;
}

/** Authored plots are shared with collision terrain; names never depend on hash order. */
export function buildingPlots(map: TownMap): BuildingPlot[] {
  return houseData.houses.filter(house => map.terrainAt(house.x, house.y) === 'building');
}

/** One fixed cottage, with the thirteen reference color schemes. */
export const HOUSE_COLORS = [
  [0xf1e2c4, 0xe57768, 0xb77b40],
  [0xe7e8dd, 0x7298c7, 0x6e98b5],
  [0xf1dfbd, 0xf4a064, 0xc58b45],
  [0xe7e2c9, 0x90b08c, 0x7e9b70],
  [0xe9dfe9, 0xaf9acb, 0xa48aba],
  [0xf4ddd3, 0xef9a9f, 0xd78286],
  [0xf5e8bd, 0xf2c456, 0xc5893b],
  [0xe1e0dc, 0x567393, 0x52768e],
  [0xeee1c8, 0xa17b62, 0xb07e40],
  [0xe4ebdb, 0x8dc9bc, 0x64aea1],
  [0xf1ddd0, 0xc96875, 0xb98143],
  [0xe3e2db, 0x777875, 0x72817c],
  [0xf3e5c6, 0xf8ae4e, 0xca8e3d],
] as const;
