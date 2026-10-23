/**
 * Draw order.
 *
 * Anything that should be occluded by what is in front of it lives in the
 * y-sorted band: its depth is ENTITY_BASE plus its world y, so a player
 * standing below a building is drawn over it and one standing above is hidden
 * behind it. The bands are spaced far enough apart that world coordinates
 * (up to 3840px) can never spill from one into the next.
 */
export const DEPTH = {
  ground: 0,
  props: 1,
  entityBase: 10,
  /** Tree canopies, above every entity, so players walk behind trees. */
  canopy: 100_000,
  /** Speech bubbles and name labels, above everything in the world. */
  overlay: 200_000,
} as const;
