import * as THREE from 'three';
import { tinted, type Shade } from '../geometry.js';
import { PART } from './colors.js';
import { PROPORTIONS as P } from './proportions.js';

/**
 * The scarf: one length of cloth, wound once and a bit round the neck so it
 * laps over itself, then carried down the front as a short wide tail.
 *
 * It is a single swept surface, not a ring with something stuck to it. The
 * band's path runs round the neck past its own starting point — that lap is
 * the fabric overlap — and then turns down into the tail, so the tail is
 * where the cloth ends rather than a separate piece. The cross-section is a
 * flattened ellipse throughout, wider than it is thick, which is what keeps
 * it from reading as a tube.
 */

interface Sample {
  /** Centre of the band. */
  readonly at: THREE.Vector3;
  /** Along the band, normalised. */
  readonly along: THREE.Vector3;
  readonly halfWidth: number;
  readonly halfThickness: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The band's centre line.
 *
 * `t` runs 0..1. Up to `lap` it goes round the neck, a little over one full
 * turn; after that it leaves the circle and falls down the front, easing from
 * the tangent it arrived on into straight down so there is no kink where the
 * wrap becomes the tail.
 */
function path(t: number): Sample {
  const s = P.scarf;
  const at = new THREE.Vector3();
  const along = new THREE.Vector3();

  if (t <= s.lap) {
    const turn = (t / s.lap) * s.turns * Math.PI * 2 + s.start;
    // Three slow waves that do not share a period: wound cloth sits
    // unevenly, and a loop of constant radius reads as a rigid donut.
    const waver = 0.62 * Math.sin(turn * 2 + 0.7) + 0.38 * Math.sin(turn * 3 - 1.4);
    const radius = s.radius * (1 + s.waver * waver);
    const rise = Math.sin(turn * 2 - 0.5) * 0.62 + Math.sin(turn - 1.1) * 0.38;
    // The far end of the lap rides a little higher and wider, so where the
    // cloth passes over its own start it sits on top of it rather than in it.
    const lapRise = Math.max(0, (t / s.lap) * s.turns - 0.78) * s.lapLift;
    at.set(
      Math.sin(turn) * (radius + lapRise * 0.5),
      s.y + s.roll * rise + lapRise,
      Math.cos(turn) * (radius + lapRise * 0.5),
    );
    along.set(Math.cos(turn), 0, -Math.sin(turn)).normalize();
    return { at, along, halfWidth: s.width, halfThickness: s.thickness };
  }

  // The tail. It turns down out of the wrap quickly — a scarf end falls, it
  // does not carry on round — and spreads and flattens as it goes.
  const u = (t - s.lap) / (1 - s.lap);
  const turn = s.turns * Math.PI * 2 + s.start;
  // Start at the exact last wrap sample; no gap or step at the overlap.
  const start = path(s.lap).at;
  const tangent = new THREE.Vector3(Math.cos(turn), 0, -Math.sin(turn));
  const end = start.clone().add(new THREE.Vector3(-0.018, -s.tailLength, 0.07));
  const curve = new THREE.CubicBezierCurve3(
    start,
    start.clone().addScaledVector(tangent, 0.035),
    end.clone().add(new THREE.Vector3(0, 0.065, -0.015)),
    end,
  );
  curve.getPoint(u, at);
  curve.getTangent(u, along);
  const ease = u * u * (3 - 2 * u);
  return {
    at,
    along,
    halfWidth: s.width * (1 + s.tailSpread * ease),
    halfThickness: s.thickness * (1 - s.tailFlatten * ease),
  };
}

/**
 * Sweep the band along its path.
 *
 * The frame is carried along rather than rebuilt per sample, so the
 * cross-section does not spin as the path turns, and the two ends are capped
 * with a rounded hem.
 */
function band(): THREE.BufferGeometry {
  const steps = 112;
  const ring = 20;
  const rows = steps + 1;
  const positions = new Float32Array(rows * (ring + 1) * 3);
  const index: number[] = [];
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  // Parallel transport: carry the last frame forward and straighten it
  // against the new direction, rather than rebuilding it from a fixed up
  // vector. Rebuilt, the frame collapses where the path turns vertical —
  // which is exactly where the wrap becomes the tail — and the band folds
  // over on itself.
  const carried = new THREE.Vector3(Math.cos(P.scarf.start), 0, -Math.sin(P.scarf.start))
    .cross(UP).normalize();

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const sample = path(t);
    side.copy(carried).addScaledVector(sample.along, -carried.dot(sample.along)).normalize();
    normal.crossVectors(sample.along, side).normalize();
    if (t > P.scarf.lap) {
      const u = (t - P.scarf.lap) / (1 - P.scarf.lap);
      // Fabric twists gently into a broad, front-facing hanging strap.
      const target = new THREE.Vector3(-1, 0, 0);
      target.addScaledVector(sample.along, -target.dot(sample.along)).normalize();
      if (target.dot(side) < 0) target.negate();
      side.lerp(target, Math.min(1, u * 4)).normalize();
      normal.crossVectors(sample.along, side).normalize();
    }
    carried.copy(side);
    // Round both ends off instead of leaving the cloth cut square.
    const hem = Math.min(1, Math.min(t, 1 - t) * steps / 7);
    const taper = Math.sqrt(1 - (1 - hem) ** 2);
    for (let j = 0; j <= ring; j += 1) {
      const a = (j / ring) * Math.PI * 2;
      const w = Math.cos(a) * sample.halfWidth * taper;
      const h = Math.sin(a) * sample.halfThickness * taper;
      const at = (i * (ring + 1) + j) * 3;
      positions[at] = sample.at.x + side.x * w + normal.x * h;
      positions[at + 1] = sample.at.y + side.y * w + normal.y * h;
      positions[at + 2] = sample.at.z + side.z * w + normal.z * h;
      if (i < steps && j < ring) {
        const p = i * (ring + 1) + j;
        const q = p + ring + 1;
        index.push(p, p + 1, q, q, p + 1, q + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // The UV seam duplicates a vertex; average its normals to remove a hard
  // longitudinal lighting stripe without changing the swept surface.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i <= steps; i += 1) {
    const first = i * (ring + 1);
    const last = first + ring;
    const n = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, n.x, n.y, n.z);
    normals.setXYZ(last, n.x, n.y, n.z);
  }
  return geometry;
}

export function scarfParts(): THREE.BufferGeometry[] {
  const shade: Shade = {
    from: 0.8, to: 1.02,
    bottom: P.scarf.y - P.scarf.tailLength,
    top: P.scarf.y + P.scarf.thickness,
  };
  return [tinted(band(), PART.scarf, shade)];
}
