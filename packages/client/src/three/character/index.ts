import * as THREE from 'three';
import {
  BODY_COLORS, BOOT, HAIR_COLORS, SHIRT_COLORS, type AvatarParts,
} from '../../gfx/avatar.js';
import { merge } from '../geometry.js';
import { accessoryParts } from './accessories.js';
import { baseCharacterParts, hairParts, type BaseColors } from './baseCharacter.js';
import { hatParts, hidesCrown } from './hat.js';
import { scarfParts } from './scarf.js';

export { PROPORTIONS, HEAD_TOP, alongArm } from './proportions.js';
export { baseCharacterParts, type BaseColors } from './baseCharacter.js';

/** What to put on the base character. Both default to what the outfit says. */
export interface CharacterOptions {
  readonly showHat?: boolean;
  readonly showScarf?: boolean;
  /** Swing both arms about their shoulder joints; defaults to resting. */
  readonly armTilt?: number;
}

export function colorsFor(parts: AvatarParts): BaseColors {
  return {
    skin: BODY_COLORS[parts.body] ?? BODY_COLORS[0],
    shirt: SHIRT_COLORS[parts.shirt] ?? SHIRT_COLORS[0],
    hair: HAIR_COLORS[parts.body] ?? HAIR_COLORS[0],
    shoe: BOOT,
  };
}

/**
 * One character, merged into a single vertex-coloured geometry.
 *
 * The base character, the scarf and the hat are built by components that know
 * nothing about each other; this only decides which of them to include. A hat
 * that covers the crown asks the hair to leave it off — the only thing a hat
 * is allowed to say about the head.
 */
export function buildCharacterGeometry(
  parts: AvatarParts,
  options: CharacterOptions = {},
): THREE.BufferGeometry {
  const colors = colorsFor(parts);
  const showHat = options.showHat ?? parts.hat !== 'none';
  const showScarf = options.showScarf ?? parts.accessory === 'scarf';
  const hat = showHat ? parts.hat : 'none';
  const covered = showHat && hidesCrown(hat);

  return merge([
    ...baseCharacterParts(colors, { hair: !covered, ...options }),
    // A covered crown still needs the sides and back of the cut.
    ...(covered ? hairParts(colors.hair).slice(1) : []),
    ...(showHat ? hatParts(hat) : []),
    ...(showScarf ? scarfParts() : []),
    ...accessoryParts(parts.accessory, colors.shirt),
  ]);
}
