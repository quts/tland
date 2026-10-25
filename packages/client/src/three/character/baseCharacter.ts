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
 *
 * The sweep is a single tilted plane: high at the brow, low at the nape. A
 * plane cutting a sphere leaves a circle, so the hem is one smooth contour
 * from every angle. Blending the two angles column by column instead would
 * drop the hem fastest at the flanks and cut a diagonal across the cheek.
 */
function hairShell(radius: number, hem: number): THREE.BufferGeometry {
  const { brow, fringe, roll } = P.hair;
  const inner = P.head.radius * 1.01;
  const columns = 48;
  const rows = 10;
  // The cutting plane, as y = base + lean * z, through the hem's front and
  // back anchors on the shell.
  const yAt = (theta: number): number => Math.cos(theta) * radius * P.head.squash;
  const lean = (yAt(fringe) - yAt(hem)) / ((Math.sin(fringe) + Math.sin(hem)) * radius);
  const base = yAt(fringe) - lean * Math.sin(fringe) * radius;
  /** Where that plane crosses this meridian, by bisection on the angle. */
  const hemAt = (phi: number): number => {
    let lo = brow;
    let hi = Math.PI * 0.92;
    for (let k = 0; k < 28; k += 1) {
      const mid = (lo + hi) / 2;
      const z = Math.sin(phi) * Math.sin(mid) * radius;
      if (yAt(mid) > base + lean * z) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const index: number[] = [];
  for (let i = 0; i <= columns; i += 1) {
    // phi 0 is the left flank and pi/2 straight ahead, so measure from the face.
    const phi = (i / columns) * Math.PI * 2;
    const bottom = hemAt(phi);
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
  // Dome the whole cut about the head's centre: scaling the crown alone
  // would crack it away from the shell.
  for (const part of parts) {
    part.translate(0, -P.head.y, 0).scale(1, P.hair.lift, 1).translate(0, P.head.y, 0);
  }
  return parts;
}

/**
 * One arm, in its own space: the origin is the shoulder joint and the arm
 * hangs down -y, unrotated.
 *
 * It is never baked into the body. The caller puts it in a group at the
 * joint and turns that group, which is what makes the joint the pivot and
 * leaves each arm free to move on its own.
 */
export function armParts(colors: BaseColors): THREE.BufferGeometry[] {
  const a = P.arm;
  // The ramp starts at the brightness the torso has at the joint's height, so
  // the arm does not step in tone where it meets the body. The arm's colours
  // are baked in its own space and then rotated, so they cannot be keyed to
  // world height the way the torso's are.
  const atJoint = bodyShade.from
    + (bodyShade.to - bodyShade.from)
      * ((a.pivot.y - bodyShade.bottom) / (bodyShade.top - bodyShade.bottom));
  const shade: Shade = { from: 0.86, to: atJoint, bottom: -a.hand.at, top: a.joint };
  return [
    // Shoulder, sleeve and cuff are one turned surface: the top of the
    // profile is the joint's own hemisphere, so there is no cap boundary to
    // see and nothing to come apart when the arm swings. Turned finely, so
    // where it crosses the torso the crease is a smooth curve, not faceted.
    painted(new THREE.LatheGeometry(
      a.sleeve.map(([r, down]) => new THREE.Vector2(r, -down)), 40,
    ), colors.shirt, shade),
    // The hand plugs the cuff: an ellipsoid stretched along the arm, its
    // widest ring just inside the hem, so no wrist shows through it.
    painted(new THREE.SphereGeometry(a.hand.radius, 22, 18)
      .scale(1, a.hand.stretch, 0.95).translate(0, -a.hand.at, 0), colors.skin, shade),
  ];
}

/**
 * The body: everything except the arms — shoes, torso, head, ears, hair.
 * The arms are separate meshes, so they can be posed.
 */
export function baseCharacterParts(
  colors: BaseColors,
  options: { readonly hair?: boolean } = {},
): THREE.BufferGeometry[] {
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
    // Head.
    painted(new THREE.SphereGeometry(P.head.radius, 30, 22)
      .scale(1, P.head.squash, 1).translate(0, P.head.y, 0), colors.skin, skinShade),
    ...[-1, 1].map((side) => painted(new THREE.SphereGeometry(P.ear.radius, 14, 10)
      .scale(ex, ey, ez).translate(side * P.ear.x, P.head.y + P.ear.y, -0.01),
    colors.skin, skinShade)),
    ...(options.hair === false ? [] : hairParts(colors.hair)),
  ];
}
