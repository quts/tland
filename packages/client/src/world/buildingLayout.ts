import { hashCoords, type TownMap } from '@tland/shared';

const BUILDING_SEED = 0x2f91;

/** Buildings are authored as 4x4 blocks of building tiles. */
export const BUILDING_CELL = 4;

/**
 * How often each building variant appears, out of 100.
 *
 * Towers are landmarks, so they stay rare; a street of them would look like a
 * bug rather than a skyline.
 */
const BUILDING_WEIGHTS = [30, 28, 16, 7, 19] as const;

export const BUILDING_VARIANTS = BUILDING_WEIGHTS.length;

function pickBuildingVariant(roll: number): number {
  let remaining = roll % 100;
  for (let variant = 0; variant < BUILDING_WEIGHTS.length; variant += 1) {
    remaining -= BUILDING_WEIGHTS[variant] as number;
    if (remaining < 0) return variant;
  }
  return 0;
}

export interface BuildingPlot {
  /** Top-left tile of the 4x4 block. */
  readonly x: number;
  readonly y: number;
  readonly variant: number;
}

/**
 * One plot per authored building cell.
 *
 * A 4x4 block of building tiles whose top-left corner falls on a cell boundary
 * marks exactly one building. Shared by both renderers so a given plot is the
 * same kind of building whichever way you look at it.
 */
export function buildingPlots(map: TownMap): BuildingPlot[] {
  const plots: BuildingPlot[] = [];
  for (let y = 0; y < map.height; y += BUILDING_CELL) {
    for (let x = 0; x < map.width; x += BUILDING_CELL) {
      if (map.terrainAt(x, y) !== 'building') continue;
      plots.push({ x, y, variant: pickBuildingVariant(hashCoords(x, y, BUILDING_SEED)) });
    }
  }
  return plots;
}
