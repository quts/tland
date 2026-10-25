import * as THREE from 'three';
import {
  BODY_COLORS, BOOT, HAIR_COLORS, SHIRT_COLORS, type AvatarParts,
} from '../../gfx/avatar.js';
import { merge } from '../geometry.js';
import { accessoryParts } from './accessories.js';
import { armParts, baseCharacterParts, hairParts, type BaseColors } from './baseCharacter.js';
import { hatParts, hidesCrown } from './hat.js';
import { PROPORTIONS as P } from './proportions.js';
import { scarfParts } from './scarf.js';

export { PROPORTIONS, HEAD_TOP, alongArm } from './proportions.js';
export { armParts, baseCharacterParts, type BaseColors } from './baseCharacter.js';

/** What to put on the base character. Both default to what the outfit says. */
export interface CharacterOptions {
  readonly showHat?: boolean;
  readonly showScarf?: boolean;
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
 * The body, merged into a single vertex-coloured geometry: everything but the
 * arms, which are their own meshes so they can be posed.
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
    ...baseCharacterParts(colors, { hair: !covered }),
    // A covered crown still needs the sides and back of the cut.
    ...(covered ? hairParts(colors.hair).slice(1) : []),
    ...(showHat ? hatParts(hat) : []),
    ...(showScarf ? scarfParts() : []),
    ...accessoryParts(parts.accessory, colors.shirt),
  ]);
}

/** One arm, merged, in the arm's own space with the joint at the origin. */
export function buildArmGeometry(parts: AvatarParts): THREE.BufferGeometry {
  return merge(armParts(colorsFor(parts)));
}

/** A character assembled from a body mesh and two independently posed arms. */
export interface AssembledCharacter {
  /** Put this where the character stands; it carries the whole figure. */
  readonly root: THREE.Group;
  readonly body: THREE.Mesh;
  /** Indexed by side: -1 is the character's left, +1 its right. */
  readonly arm: (side: -1 | 1) => THREE.Group;
  /**
   * Swing one arm, in radians from hanging straight down: `pitch` forward
   * about the shoulder, `splay` outward. Defaults back to the resting splay.
   */
  readonly poseArm: (side: -1 | 1, pitch?: number, splay?: number) => void;
}

/**
 * Hang the arms off the body.
 *
 * Each arm goes in a group placed at its shoulder joint, which sits inside
 * the upper torso. Rotating that group turns the arm about the joint and
 * nothing else — the sleeve's hemispherical upper end stays buried whatever
 * the angle, so no hole opens at the shoulder even with the arm straight up.
 */
export function assembleCharacter(
  bodyGeometry: THREE.BufferGeometry,
  armGeometry: THREE.BufferGeometry,
  material: THREE.Material,
): AssembledCharacter {
  const root = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry, material);
  body.name = 'body';
  root.add(body);

  const groups = new Map<number, THREE.Group>();
  for (const side of [-1, 1] as const) {
    const group = new THREE.Group();
    group.name = side < 0 ? 'arm-left' : 'arm-right';
    group.position.set(side * P.arm.pivot.x, P.arm.pivot.y, P.arm.pivot.z);
    // Both sides share one geometry. The arm is turned about its own axis, so
    // its mirror image is the same shape rotated — no second geometry, and no
    // negative scale, which would flip the winding and cull the arm away.
    group.add(new THREE.Mesh(armGeometry, material));
    groups.set(side, group);
    root.add(group);
  }

  const arm = (side: -1 | 1): THREE.Group => groups.get(side) as THREE.Group;
  const poseArm = (side: -1 | 1, pitch = 0, splay: number = P.arm.tilt): void => {
    // Positive splay swings the hand away from the body on either side;
    // positive pitch swings it forward, towards the face.
    arm(side).rotation.set(-pitch, 0, side * splay);
  };
  for (const side of [-1, 1] as const) poseArm(side);

  return { root, body, arm, poseArm };
}
