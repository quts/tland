import * as THREE from 'three';
import { tinted } from '../geometry.js';
import { PART } from './colors.js';
import { HEAD_TOP, PROPORTIONS as P } from './proportions.js';

/**
 * The straw hat: a short cylindrical crown with rounded edges, a fixed
 * ribbon band, and a wide brim with real thickness and a rounded rim.
 *
 * There is only one hat. It is part of the character rather than something
 * the character puts on, so it has no variants and nothing to choose. It is
 * stacked from `HEAD_TOP`, sitting on the hair without reshaping it.
 */
export function hatParts(): THREE.BufferGeometry[] {
  const h = P.hat;
  // Crown: turned from a profile, so the top edge is a bevel rather than a
  // rim, and the side is the short cylinder the reference has.
  const crown = new THREE.LatheGeometry(
    h.crown.map(([r, y]) => new THREE.Vector2(r, y)), 40,
  );
  // Brim: turned too, so it has thickness and the outer edge rolls over
  // instead of ending on a knife edge.
  const brim = new THREE.LatheGeometry(
    h.brim.map(([r, y]) => new THREE.Vector2(r, y)), 48,
  );
  const ribbon = new THREE.CylinderGeometry(h.ribbonRadius, h.ribbonRadius * 1.02, h.ribbonHeight, 40)
    .translate(0, h.ribbonY, 0);
  const parts = [
    tinted(brim, PART.hat, { from: 0.88, to: 1.04, bottom: -0.03, top: 0.03 }),
    tinted(crown, PART.hat, { from: 0.92, to: 1.04, bottom: 0, top: h.crownTop }),
    tinted(ribbon, PART.hatRibbon),
  ];
  // Tipped back a little, because the 32-degree game camera must see the eyes.
  for (const part of parts) part.rotateX(h.tip).translate(0, HEAD_TOP + h.lift, h.back);
  return parts;
}
