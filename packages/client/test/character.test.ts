import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PROPORTIONS, alongArm } from '../src/three/character/proportions.js';
import { buildCharacterGeometry } from '../src/three/character/index.js';

const OUTFIT = { body: 0, shirt: 4, hat: 'sunhat', accessory: 'scarf' } as const;

/** The vertices of one geometry, as a set of rounded "x,y,z" keys. */
function points(geometry: THREE.BufferGeometry): Set<string> {
  const position = geometry.getAttribute('position');
  const set = new Set<string>();
  for (let i = 0; i < position.count; i += 1) {
    set.add([position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => v.toFixed(4)).join(','));
  }
  return set;
}

describe('character components', () => {
  it('leaves the hat and the scarf out when they are toggled off', () => {
    const dressed = points(buildCharacterGeometry(OUTFIT));
    const bare = points(buildCharacterGeometry(OUTFIT, { showHat: false, showScarf: false }));
    expect(bare.size).toBeLessThan(dressed.size);
    // Whatever the base character is made of survives both ways.
    for (const point of bare) expect(dressed.has(point)).toBe(true);
  });

  it('toggles the hat and the scarf independently', () => {
    const hatOnly = points(buildCharacterGeometry(OUTFIT, { showScarf: false }));
    const scarfOnly = points(buildCharacterGeometry(OUTFIT, { showHat: false }));
    const bare = points(buildCharacterGeometry(OUTFIT, { showHat: false, showScarf: false }));
    expect(hatOnly.size).toBeGreaterThan(bare.size);
    expect(scarfOnly.size).toBeGreaterThan(bare.size);
    expect(hatOnly).not.toEqual(scarfOnly);
  });

  it('swings the arm about the shoulder joint, not the middle of the sleeve', () => {
    const { pivot, tilt } = PROPORTIONS.arm;
    // The pivot is the one point on the arm's axis that a change of tilt
    // leaves alone; everything below it moves.
    const atPivot = alongArm(1, 0);
    expect(atPivot).toEqual([pivot.x, pivot.y, pivot.z]);

    const resting = buildCharacterGeometry(OUTFIT, { showHat: false, showScarf: false });
    const raised = buildCharacterGeometry(OUTFIT, {
      showHat: false, showScarf: false, armTilt: tilt + 0.5,
    });
    resting.computeBoundingBox();
    raised.computeBoundingBox();
    // Swinging the arms out widens the figure without lifting or dropping it.
    expect(raised.boundingBox!.max.x).toBeGreaterThan(resting.boundingBox!.max.x);
    expect(raised.boundingBox!.max.y).toBeCloseTo(resting.boundingBox!.max.y, 5);
    expect(raised.boundingBox!.min.y).toBeCloseTo(resting.boundingBox!.min.y, 5);
    // The hand rides a circle centred on the pivot, so however the arm is
    // turned its distance from the joint is the length of the arm.
    const [handX, handY] = alongArm(1, PROPORTIONS.arm.hand.at);
    expect(Math.hypot(handX - pivot.x, handY - pivot.y))
      .toBeCloseTo(PROPORTIONS.arm.hand.at, 10);
  });

  it('is symmetric left to right', () => {
    const bare = buildCharacterGeometry(OUTFIT, { showHat: false, showScarf: false });
    const position = bare.getAttribute('position');
    // Everything clear of the middle, split into the two sides and sorted the
    // same way: mirrored arms line up term for term, a shifted one does not.
    const side = (sign: number): number[][] => {
      const rows: number[][] = [];
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        if (Math.sign(x) !== sign || Math.abs(x) < 0.12) continue;
        rows.push([Math.abs(x), position.getY(i), position.getZ(i)]);
      }
      rows.sort((a, b) => a[1]! - b[1]! || a[2]! - b[2]! || a[0]! - b[0]!);
      return rows;
    };
    const left = side(-1);
    const right = side(1);
    expect(left.length).toBeGreaterThan(500);
    expect(right.length).toBe(left.length);
    for (let i = 0; i < left.length; i += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(left[i]![axis]!, `vertex ${i} axis ${axis}`)
          .toBeCloseTo(right[i]![axis]!, 6);
      }
    }
  });
});
