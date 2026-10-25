import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PROPORTIONS } from '../src/three/character/proportions.js';
import {
  assembleCharacter, buildArmGeometry, buildCharacterGeometry,
} from '../src/three/character/index.js';

const OUTFIT = { body: 0, shirt: 4, hat: 'sunhat', accessory: 'scarf' } as const;
const BARE = { showHat: false, showScarf: false } as const;

/** The vertices of one geometry, as rounded "x,y,z" keys. */
function pointsOf(geometry: THREE.BufferGeometry): string[] {
  const position = geometry.getAttribute('position');
  const keys: string[] = [];
  for (let i = 0; i < position.count; i += 1) {
    keys.push([position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => v.toFixed(4)).join(','));
  }
  return keys;
}

function points(geometry: THREE.BufferGeometry): Set<string> {
  return new Set(pointsOf(geometry));
}

function figure(): ReturnType<typeof assembleCharacter> {
  return assembleCharacter(
    buildCharacterGeometry(OUTFIT, BARE),
    buildArmGeometry(OUTFIT),
    new THREE.MeshBasicMaterial(),
  );
}

/** Where the hand ends up in the character's own space, for a given pose. */
function handAt(side: -1 | 1, pitch: number, splay: number): THREE.Vector3 {
  const assembled = figure();
  assembled.poseArm(side, pitch, splay);
  assembled.root.updateMatrixWorld(true);
  const hand = new THREE.Vector3(0, -PROPORTIONS.arm.hand.at, 0);
  return assembled.arm(side).localToWorld(hand);
}

describe('character components', () => {
  it('leaves the hat and the scarf out when they are toggled off', () => {
    const dressed = points(buildCharacterGeometry(OUTFIT));
    const bare = points(buildCharacterGeometry(OUTFIT, BARE));
    expect(bare.size).toBeLessThan(dressed.size);
    // Whatever the base character is made of survives both ways.
    for (const point of bare) expect(dressed.has(point)).toBe(true);
  });

  it('toggles the hat and the scarf independently', () => {
    const hatOnly = points(buildCharacterGeometry(OUTFIT, { showScarf: false }));
    const scarfOnly = points(buildCharacterGeometry(OUTFIT, { showHat: false }));
    const bare = points(buildCharacterGeometry(OUTFIT, BARE));
    expect(hatOnly.size).toBeGreaterThan(bare.size);
    expect(scarfOnly.size).toBeGreaterThan(bare.size);
    expect(hatOnly).not.toEqual(scarfOnly);
  });

  it('keeps the arms out of the body mesh, in a group on each shoulder', () => {
    const body = buildCharacterGeometry(OUTFIT, BARE);
    body.computeBoundingBox();
    // The body alone is narrower than the figure: no arm is baked into it.
    const assembled = figure();
    assembled.root.updateMatrixWorld(true);
    const whole = new THREE.Box3().setFromObject(assembled.root);
    expect(whole.max.x).toBeGreaterThan(body.boundingBox!.max.x);

    for (const side of [-1, 1] as const) {
      const group = assembled.arm(side);
      expect(group.parent).toBe(assembled.root);
      expect(group.position.x).toBeCloseTo(side * PROPORTIONS.arm.pivot.x, 10);
      expect(group.position.y).toBeCloseTo(PROPORTIONS.arm.pivot.y, 10);
    }
  });

  it('swings each arm about its shoulder joint, independently', () => {
    const { pivot, hand, tilt } = PROPORTIONS.arm;
    const joint = new THREE.Vector3(pivot.x, pivot.y, pivot.z);

    // However the arm is posed, the hand stays one arm's length from the
    // joint: the group rotates about the joint, so nothing else can move.
    for (const [pitch, splay] of [[0, tilt], [0, Math.PI / 2], [Math.PI / 2, 0], [-0.6, 1.1]]) {
      const reach = handAt(1, pitch!, splay!).distanceTo(joint);
      expect(reach, `pitch ${pitch} splay ${splay}`).toBeCloseTo(hand.at, 6);
    }

    // Raising one arm leaves the other where it was.
    const assembled = figure();
    assembled.root.updateMatrixWorld(true);
    const before = assembled.arm(-1).matrixWorld.clone();
    assembled.poseArm(1, Math.PI / 2);
    assembled.root.updateMatrixWorld(true);
    expect(assembled.arm(-1).matrixWorld.equals(before)).toBe(true);

    // Splay sends the hand outward on both sides, pitch forward on both.
    expect(handAt(1, 0, 1.1).x).toBeGreaterThan(handAt(1, 0, 0).x);
    expect(handAt(-1, 0, 1.1).x).toBeLessThan(handAt(-1, 0, 0).x);
    for (const side of [-1, 1] as const) {
      expect(handAt(side, 0.8, 0).z).toBeGreaterThan(handAt(side, 0, 0).z);
    }
  });

  it('keeps the shoulder a sphere about the pivot, so no pose can open it', () => {
    const { joint } = PROPORTIONS.arm;
    const position = buildArmGeometry(OUTFIT).getAttribute('position');
    let onTheBall = 0;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y <= 0) continue;
      // Above the joint, the arm may not reach past the joint's own radius.
      // Everything there is therefore inside one sphere centred on the pivot,
      // and a sphere about its centre is unmoved by rotation — so turning the
      // arm cannot uncover anything the resting pose was covering.
      const distance = Math.hypot(position.getX(i), y, position.getZ(i));
      expect(distance, `vertex ${i}`).toBeLessThanOrEqual(joint + 1e-6);
      if (distance > joint - 1e-6) onTheBall += 1;
    }
    // And it is the ball, not merely inside it: the sleeve's top *is* that
    // hemisphere, so there is no separate cap with a boundary of its own.
    expect(onTheBall).toBeGreaterThan(100);
  });

  it('keeps the shoulder joint inside the torso', () => {
    const { pivot, radius } = PROPORTIONS.arm;
    // The torso's radius at the joint's height, from the profile it is turned
    // from. The joint has to be inside it, or the sleeve's rounded upper end
    // stands proud and shows a rim when the arm swings.
    const profile = PROPORTIONS.body.profile;
    let torsoRadius = 0;
    for (let i = 1; i < profile.length; i += 1) {
      const [r0, y0] = profile[i - 1] as readonly [number, number];
      const [r1, y1] = profile[i] as readonly [number, number];
      if (pivot.y >= y0 && pivot.y <= y1) {
        torsoRadius = r0 + ((r1 - r0) * (pivot.y - y0)) / (y1 - y0);
        break;
      }
    }
    expect(torsoRadius).toBeGreaterThan(0);
    expect(pivot.x).toBeLessThan(torsoRadius);
    // And far enough in that the whole cap is swallowed, from any angle.
    expect(pivot.x + radius).toBeGreaterThan(torsoRadius);
    expect(radius).toBeGreaterThan(torsoRadius - pivot.x);
  });

  it('winds the scarf unevenly, and rests it on the shoulders', () => {
    const { wrap, tail } = PROPORTIONS.scarf;
    const { pivot, joint } = PROPORTIONS.arm;
    const bare = buildCharacterGeometry(OUTFIT, BARE);
    const scarfed = buildCharacterGeometry(OUTFIT, { showHat: false });
    // The scarf is merged into the body like every other fixed part, so it
    // adds geometry and no draw call of its own.
    expect(scarfed.getAttribute('position').count)
      .toBeGreaterThan(bare.getAttribute('position').count);

    // Whatever the scarf added, measured around the neck: a loop of constant
    // radius is a torus, which is the one shape wound fabric never makes.
    const added = new Set(pointsOf(bare));
    const radii = new Map<number, { min: number; max: number }>();
    const position = scarfed.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)]
        .map((v) => v.toFixed(4)).join(',');
      if (added.has(key)) continue;
      const y = position.getY(i);
      if (Math.abs(y - wrap.y) > 0.01) continue;
      const bucket = Math.round(Math.atan2(position.getX(i), position.getZ(i)) * 6);
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      const seen = radii.get(bucket) ?? { min: Infinity, max: -Infinity };
      radii.set(bucket, { min: Math.min(seen.min, radius), max: Math.max(seen.max, radius) });
    }
    const outer = [...radii.values()].map((r) => r.max);
    expect(outer.length).toBeGreaterThan(8);
    expect(Math.max(...outer) - Math.min(...outer)).toBeGreaterThan(0.01);

    // It rests on the shoulders: the top of the shoulder ball passes inside
    // the loop's thickness rather than through its surface.
    expect(wrap.y - wrap.thickness).toBeLessThan(pivot.y + joint);
    expect(wrap.radius + wrap.thickness).toBeGreaterThan(pivot.x + joint);
    // The tail is a strap, not a rope, and short enough to leave the torso.
    expect(tail.width).toBeGreaterThan(tail.depth * 2);
    expect(tail.length).toBeLessThan(PROPORTIONS.body.collarY / 2);
  });

  it('is symmetric left to right', () => {
    const bare = buildCharacterGeometry(OUTFIT, BARE);
    const position = bare.getAttribute('position');
    // Everything clear of the middle, split into the two sides and sorted the
    // same way: a mirrored pair lines up term for term, a shifted one does not.
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
