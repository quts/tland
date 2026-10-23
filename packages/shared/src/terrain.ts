/** Terrain kinds the coarse map grid can hold. */
export const TERRAIN = [
  'grass',
  'sand',
  'water',
  'hill',
  'path',
  'bridge',
  'building',
  'park',
] as const;

export type Terrain = (typeof TERRAIN)[number];

/** Grid characters, as used in the hand-authored map JSON. */
export const TERRAIN_BY_CHAR: Readonly<Record<string, Terrain>> = {
  '.': 'grass',
  ',': 'sand',
  '~': 'water',
  '^': 'hill',
  '=': 'path',
  B: 'bridge',
  '#': 'building',
  '*': 'park',
};

const WALKABLE: ReadonlySet<Terrain> = new Set<Terrain>([
  'grass',
  'sand',
  'path',
  'bridge',
  'park',
]);

export function isWalkableTerrain(terrain: Terrain): boolean {
  return WALKABLE.has(terrain);
}

/** Decorations scattered on top of the terrain. Some of them block movement. */
export const PROPS = ['none', 'tree', 'flower', 'bench', 'rock'] as const;
export type Prop = (typeof PROPS)[number];

const BLOCKING_PROPS: ReadonlySet<Prop> = new Set<Prop>(['tree', 'bench', 'rock']);

export function isBlockingProp(prop: Prop): boolean {
  return BLOCKING_PROPS.has(prop);
}
