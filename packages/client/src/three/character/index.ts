import * as THREE from 'three';
import { merge } from '../geometry.js';
import { armParts, baseCharacterParts } from './baseCharacter.js';
import { hatParts } from './hat.js';
import { PROPORTIONS as P } from './proportions.js';
import { scarfParts } from './scarf.js';

export { PROPORTIONS, HEAD_TOP, alongArm } from './proportions.js';
export {
  CharacterMaterialCache, DEFAULT_COLORS, PART, characterMaterial, colorKey,
  type CharacterColors,
} from './colors.js';

/**
 * The character has one appearance.
 *
 * The straw hat and the scarf are part of it, not things it puts on, so
 * there is nothing to equip, unequip or choose: no `showHat`, no `showScarf`,
 * no hat or accessory type. Everyone is the same two geometries — a body and
 * an arm — and the only thing that differs between characters is the palette
 * the material tints them with.
 */

let bodyGeometry: THREE.BufferGeometry | null = null;
let armGeometry: THREE.BufferGeometry | null = null;

/**
 * The body: torso, head, hair, ears, shoes, scarf and hat, merged. Built
 * once and shared by every character, whatever their colours.
 */
export function characterBodyGeometry(): THREE.BufferGeometry {
  bodyGeometry ??= merge([...baseCharacterParts(), ...scarfParts(), ...hatParts()]);
  return bodyGeometry;
}

/** One arm, in the arm's own space with the joint at the origin. Shared too. */
export function characterArmGeometry(): THREE.BufferGeometry {
  armGeometry ??= merge(armParts());
  return armGeometry;
}

/** Drop both, so a test can rebuild them. */
export function disposeCharacterGeometry(): void {
  bodyGeometry?.dispose();
  armGeometry?.dispose();
  bodyGeometry = null;
  armGeometry = null;
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
  /** Recolour in place. The geometry is shared and is never rebuilt. */
  readonly setMaterial: (material: THREE.Material) => void;
}

/**
 * Hang the arms off the body.
 *
 * Each arm goes in a group placed at its shoulder joint, which sits inside
 * the upper torso. Rotating that group turns the arm about the joint and
 * nothing else — the sleeve's hemispherical upper end stays buried whatever
 * the angle, so no hole opens at the shoulder even with the arm straight up.
 */
export function assembleCharacter(material: THREE.Material): AssembledCharacter {
  const root = new THREE.Group();
  const body = new THREE.Mesh(characterBodyGeometry(), material);
  body.name = 'body';
  root.add(body);

  const arms = new Map<number, THREE.Group>();
  for (const side of [-1, 1] as const) {
    const group = new THREE.Group();
    group.name = side < 0 ? 'arm-left' : 'arm-right';
    group.position.set(side * P.arm.pivot.x, P.arm.pivot.y, P.arm.pivot.z);
    // Both sides share one geometry. The arm is turned about its own axis, so
    // its mirror image is the same shape rotated — no second geometry, and no
    // negative scale, which would flip the winding and cull the arm away.
    group.add(new THREE.Mesh(characterArmGeometry(), material));
    arms.set(side, group);
    root.add(group);
  }

  const arm = (side: -1 | 1): THREE.Group => arms.get(side) as THREE.Group;
  const poseArm = (side: -1 | 1, pitch = 0, splay: number = P.arm.tilt): void => {
    // Positive splay swings the hand away from the body on either side;
    // positive pitch swings it forward, towards the face.
    arm(side).rotation.set(-pitch, 0, side * splay);
  };
  const setMaterial = (next: THREE.Material): void => {
    body.material = next;
    for (const side of [-1, 1] as const) {
      (arm(side).children[0] as THREE.Mesh).material = next;
    }
  };
  for (const side of [-1, 1] as const) poseArm(side);

  return { root, body, arm, poseArm, setMaterial };
}
