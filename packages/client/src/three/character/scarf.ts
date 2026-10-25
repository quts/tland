import * as THREE from 'three';
import { SCARF } from '../../gfx/avatar.js';
import { painted, type Shade } from '../geometry.js';
import { PROPORTIONS as P } from './proportions.js';

/**
 * The scarf: a ring round the collar with a knot and a tail over one
 * shoulder. An independent component — it reads the collar height from the
 * proportions and touches nothing on the base character.
 *
 * Carried over unchanged from the approved design; shaping it against the new
 * shoulders is its own pass.
 */
export function scarfParts(): THREE.BufferGeometry[] {
  const collar = P.body.collarY;
  const shade: Shade = { from: 0.84, to: 1, bottom: collar - 0.1, top: collar + 0.05 };
  return [
    painted(new THREE.TorusGeometry(0.196, 0.052, 10, 26).rotateX(Math.PI / 2)
      .translate(0, collar - 0.005, 0.015), SCARF, shade),
    painted(new THREE.SphereGeometry(0.062, 12, 10).scale(1, 1, 0.85)
      .translate(-0.125, collar - 0.045, 0.155), SCARF, shade),
    painted(new THREE.CapsuleGeometry(0.042, 0.1, 5, 12).scale(1, 1, 0.6).rotateZ(0.14)
      .translate(-0.155, collar - 0.18, 0.16), SCARF,
    { from: 0.78, to: 0.94, bottom: collar - 0.27, top: collar - 0.07 }),
  ];
}
