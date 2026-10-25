import * as THREE from 'three';
import { painted, type Shade } from '../geometry.js';
import { HEAD_TOP, PROPORTIONS as P, alongArm } from './proportions.js';

/**
 * The character with nothing on: head, hair, ears, torso, shoulders, sleeves,
 * hands and shoes. Hats and scarves are separate components and never change
 * anything in here.
 */

export interface BaseColors {
  readonly skin: number;
  readonly shirt: number;
  readonly hair: number;
  readonly shoe: number;
}

const skinShade: Shade = {
  from: 0.9, to: 1.04,
  bottom: P.head.y - P.head.radius, top: P.head.y + P.head.radius,
};
const bodyShade: Shade = { from: 0.82, to: 1.04, bottom: 0.06, top: P.body.collarY };

/**
 * The hair as a surface swept by hand, rather than a sphere section.
 *
 * A section's hem is a single latitude, so a bowl cut built from them comes
 * out as a staircase. Sweeping the bottom edge per column gives the cut, and
 * rolling the last rows back towards the skull gives the hem thickness — the
 * difference between a mushroom and a hard shell.
 */
function hairShell(radius: number, hem: number): THREE.BufferGeometry {
  const { brow, fringe, roll } = P.hair;
  const inner = P.head.radius * 1.01;
  const columns = 48;
  const rows = 10;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const index: number[] = [];
  for (let i = 0; i <= columns; i += 1) {
    // phi 0 is the left flank and pi/2 straight ahead, so measure from the face.
    const phi = (i / columns) * Math.PI * 2;
    const behind = (1 - Math.cos(phi - Math.PI / 2)) / 2;
    const bottom = fringe + (hem - fringe) * behind;
    for (let j = 0; j <= rows; j += 1) {
      const t = j / rows;
      // Ease the last of the rows inward and a little further round, so the
      // edge curls under instead of ending on a rim.
      const s = Math.max(0, (t - (1 - roll)) / roll);
      const curl = s * s * (3 - 2 * s);
      const theta = brow + (bottom - brow) * t + curl * 0.13;
      const r = radius + (inner - radius) * curl;
      const at = (i * (rows + 1) + j) * 3;
      positions[at] = -Math.cos(phi) * Math.sin(theta) * r;
      positions[at + 1] = Math.cos(theta) * r * P.head.squash + P.head.y;
      positions[at + 2] = Math.sin(phi) * Math.sin(theta) * r;
      if (i < columns && j < rows) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
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
 * The bowl cut: a domed crown and a shell hanging from it, lifted as one so
 * the two never part. `withBack` is false for hats that take the back off.
 */
export function hairParts(color: number, withBack = true): THREE.BufferGeometry[] {
  const shade: Shade = { from: 0.7, to: 1.04, bottom: P.head.y - 0.26, top: HEAD_TOP };
  const r = P.head.radius * P.hair.thickness;
  const parts = [
    painted(
      new THREE.SphereGeometry(r, 36, 14, 0, Math.PI * 2, 0, P.hair.brow + 0.05)
        .scale(1, P.head.squash, 1).translate(0, P.head.y, 0), color, shade,
    ),
    painted(hairShell(r, withBack ? P.hair.nape : Math.PI * 0.52), color, shade),
  ];
  if (withBack) {
    // A soft nape, so the back of the cut is not a hard rim.
    parts.push(painted(new THREE.SphereGeometry(1, 22, 12).scale(0.19, 0.092, 0.145)
      .translate(0, P.head.y - 0.185, -0.135), color, shade));
  }
  // Dome the whole cut about the head's centre: scaling the crown alone
  // would crack it away from the shell.
  for (const part of parts) {
    part.translate(0, -P.head.y, 0).scale(1, P.hair.lift, 1).translate(0, P.head.y, 0);
  }
  return parts;
}

/**
 * One arm, built in its own space with the origin on the shoulder joint and
 * the arm running down -y, then turned about that origin and set on the body.
 *
 * Building it this way is what puts the pivot on the joint rather than in the
 * middle of the sleeve: `tilt` — or any pose angle — rotates the shoulder
 * cap, sleeve, forearm and hand together without moving where they attach.
 */
function armParts(side: number, colors: BaseColors, tilt: number): THREE.BufferGeometry[] {
  const a = P.arm;
  const parts = [
    // Shoulder, sleeve and cuff are one turned surface: see `sleeve` above.
    painted(new THREE.LatheGeometry(
      a.sleeve.map(([r, down]) => new THREE.Vector2(r, -down)), 26,
    ), colors.shirt, bodyShade),
    painted(new THREE.CylinderGeometry(a.forearmRadius, a.forearmRadius, 0.08, 16)
      .translate(0, -0.245, 0), colors.skin, bodyShade),
    painted(new THREE.SphereGeometry(a.hand.radius, 20, 16)
      .scale(1, a.hand.squash, 1).translate(0, -a.hand.at, 0), colors.skin, bodyShade),
  ];
  for (const part of parts) {
    part.rotateZ(side * tilt).translate(side * a.pivot.x, a.pivot.y, a.pivot.z);
  }
  return parts;
}

/**
 * The whole base character. `armTilt` defaults to the resting splay; passing
 * another angle swings both arms about their shoulder joints.
 */
export function baseCharacterParts(
  colors: BaseColors,
  options: { readonly hair?: boolean; readonly armTilt?: number } = {},
): THREE.BufferGeometry[] {
  const tilt = options.armTilt ?? P.arm.tilt;
  const [sx, sy, sz] = P.shoe.scale;
  const [ex, ey, ez] = P.ear.scale;
  return [
    // Shoes, clearly two of them, just clearing the hem of the body.
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(P.shoe.radius, 16, 12)
      .scale(sx, sy, sz).translate(side * P.shoe.x, P.shoe.y, 0.015), colors.shoe)),
    // Torso: turned from a profile rather than scaled from a sphere, so it
    // is still broad where the arms attach. One surface, so no seam to shade.
    painted(new THREE.LatheGeometry(
      P.body.profile.map(([r, y]) => new THREE.Vector2(r, y)), 32,
    ).scale(1, 1, P.body.depth), colors.shirt, bodyShade),
    ...[-1, 1].flatMap((side) => armParts(side, colors, tilt)),
    // Head.
    painted(new THREE.SphereGeometry(P.head.radius, 30, 22)
      .scale(1, P.head.squash, 1).translate(0, P.head.y, 0), colors.skin, skinShade),
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(P.ear.radius, 14, 10)
      .scale(ex, ey, ez).translate(side * P.ear.x, P.head.y + P.ear.y, -0.01),
    colors.skin, skinShade)),
    ...(options.hair === false ? [] : hairParts(colors.hair)),
  ];
}
