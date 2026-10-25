import * as THREE from 'three';
import { SCARF } from '../../gfx/avatar.js';
import { painted, type Shade } from '../geometry.js';
import { PROPORTIONS as P } from './proportions.js';

/**
 * The scarf: a thick loop wound round the lower neck, and one short tail
 * hanging down the front of it.
 *
 * An independent component. It reads its measurements from `PROPORTIONS` and
 * touches nothing on the base character — where it meets the head, the
 * shoulders or the chest it simply overlaps them, and the base geometry is
 * not reshaped to accommodate it. It is merged into the body mesh like every
 * other fixed part, so it costs no draw call of its own.
 */

const shade: Shade = {
  from: 0.82, to: 1.02,
  bottom: P.scarf.tail.topY - P.scarf.tail.length,
  top: P.scarf.wrap.y + P.scarf.wrap.thickness,
};

/**
 * How far the loop wanders at a given angle round the neck, as multipliers on
 * its radius and thickness and an offset in height.
 *
 * Three slow waves that do not share a period, so the loop never repeats
 * itself as it goes round and never closes back into a circle. This is what
 * keeps it from reading as a torus: a torus is the one shape fabric wound
 * round a neck never makes.
 */
function waver(angle: number): { radius: number; thickness: number; rise: number } {
  const w = P.scarf.wrap.waver;
  return {
    radius: 1 + w * (0.62 * Math.sin(angle * 2 + 0.7) + 0.38 * Math.sin(angle * 3 - 1.4)),
    thickness: 1 + w * (0.5 * Math.sin(angle * 3 + 2.1) + 0.5 * Math.sin(angle * 5 + 0.3)),
    rise: Math.sin(angle * 2 - 0.5) * 0.62 + Math.sin(angle - 1.1) * 0.38,
  };
}

/**
 * The loop, as a tube swept round the neck.
 *
 * Its inner half is inside the head, which is the point: that is what hides
 * the head-to-torso junction without putting anything in front of the face.
 */
function neckWrap(): THREE.BufferGeometry {
  const { y, radius, thickness, roll } = P.scarf.wrap;
  const around = 72;
  const tube = 14;
  const positions = new Float32Array((around + 1) * (tube + 1) * 3);
  const index: number[] = [];
  for (let i = 0; i <= around; i += 1) {
    const angle = (i / around) * Math.PI * 2;
    const wave = waver(angle);
    const centre = radius * wave.radius;
    const height = y + roll * wave.rise;
    const r = thickness * wave.thickness;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);
    for (let j = 0; j <= tube; j += 1) {
      // v = 0 points straight out from the neck, so the tube closes on itself.
      const v = (j / tube) * Math.PI * 2;
      const out = Math.cos(v) * r;
      const at = (i * (tube + 1) + j) * 3;
      positions[at] = dirX * (centre + out);
      positions[at + 1] = height + Math.sin(v) * r;
      positions[at + 2] = dirZ * (centre + out);
      if (i < around && j < tube) {
        const a = i * (tube + 1) + j;
        const b = a + tube + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The tail: a soft strap, wider than it is deep, with a rounded bottom. Its
 * top starts inside the loop, so the two read as one piece of cloth.
 */
function tail(): THREE.BufferGeometry {
  const t = P.scarf.tail;
  const straight = t.length - t.round * 2;
  const { radius } = P.scarf.wrap;
  // Sit it on the loop: in front, at the angle where the loop passes this x.
  const z = Math.sqrt(Math.max(0, radius * radius - t.x * t.x));
  return new THREE.CapsuleGeometry(t.round, straight, 6, 20)
    .scale(t.width / t.round, 1, t.depth / t.round)
    .rotateX(t.lean)
    .translate(t.x, t.topY - t.length / 2, z);
}

export function scarfParts(): THREE.BufferGeometry[] {
  return [
    painted(neckWrap(), SCARF, shade),
    painted(tail(), SCARF, shade),
  ];
}
