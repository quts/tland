import * as THREE from 'three';
import { PALETTE } from '../../gfx/palette.js';
import { SCARF, STRAW, type Hat } from '../../gfx/avatar.js';
import { painted } from '../geometry.js';
import { HEAD_TOP, PROPORTIONS as P } from './proportions.js';

/**
 * Hats. Each is an independent component stacked from `HEAD_TOP`: a hat
 * never reshapes the head or the hair, it only says whether the crown of the
 * hair is hidden underneath it.
 *
 * Carried over unchanged from the approved design; fitting each one to the
 * rounder head is its own pass.
 */

const HAT_COLOR: Record<'cap' | 'beanie', number> = {
  cap: PALETTE.roofWarm,
  beanie: PALETTE.petalLilac,
};

/** Whether this hat covers the crown, so the hair can drop it. */
export function hidesCrown(hat: Hat): boolean {
  return hat === 'cap' || hat === 'beanie';
}

export function hatParts(hat: Hat): THREE.BufferGeometry[] {
  const head = P.head;
  switch (hat) {
    case 'none':
      return [];
    case 'cap':
      return [
        painted(
          new THREE.SphereGeometry(head.radius * 1.09, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46)
            .translate(0, head.y + 0.01, 0),
          HAT_COLOR.cap,
          { from: 0.85, to: 1.04, bottom: head.y, top: HEAD_TOP + 0.03 },
        ),
        painted(
          new THREE.CylinderGeometry(0.165, 0.165, 0.025, 16).scale(1, 1, 0.75)
            .translate(0, head.y + 0.13, 0.21),
          HAT_COLOR.cap,
          { from: 0.8, to: 0.95, bottom: head.y, top: HEAD_TOP },
        ),
        painted(new THREE.SphereGeometry(0.025, 6, 4).translate(0, HEAD_TOP + 0.03, 0), PALETTE.wall),
      ];
    case 'sunhat': {
      // A straw boater: flat crown, coral band, wide flat brim. Tipped back a
      // little, because the 32-degree game camera must still see the eyes.
      const crown = new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.237, 0),
        new THREE.Vector2(0.237, 0.088), new THREE.Vector2(0.222, 0.108),
        new THREE.Vector2(0.203, 0.115), new THREE.Vector2(0, 0.115),
      ], 36);
      const parts = [
        painted(new THREE.SphereGeometry(1, 36, 12).scale(0.425, 0.021, 0.395),
          STRAW, { from: 0.86, to: 1.04, bottom: -0.021, top: 0.021 }),
        painted(crown, STRAW, { from: 0.9, to: 1.04, bottom: 0, top: 0.115 }),
        painted(new THREE.CylinderGeometry(0.244, 0.248, 0.05, 36).translate(0, 0.034, 0), SCARF),
      ];
      for (const part of parts) part.rotateX(-0.12).translate(0, HEAD_TOP - 0.078, -0.02);
      return parts;
    }
    case 'beanie':
      return [
        painted(
          new THREE.SphereGeometry(head.radius * 1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)
            .scale(1, 1.12, 1).translate(0, head.y + 0.02, 0),
          HAT_COLOR.beanie,
          { from: 0.86, to: 1.04, bottom: head.y, top: HEAD_TOP + 0.08 },
        ),
        painted(
          new THREE.TorusGeometry(head.radius * 1.08, 0.035, 6, 20).rotateX(Math.PI / 2)
            .translate(0, head.y + 0.05, 0),
          HAT_COLOR.beanie,
          { from: 0.82, to: 0.92, bottom: head.y, top: head.y + 0.1 },
        ),
        painted(new THREE.IcosahedronGeometry(0.07, 1).translate(0, HEAD_TOP + 0.1, 0), PALETTE.wall),
      ];
    case 'bloom': {
      const petals = [PALETTE.petalRose, PALETTE.petalCream, PALETTE.petalLilac];
      return Array.from({ length: 6 }, (_unused, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return painted(
          new THREE.IcosahedronGeometry(0.055, 0).translate(
            Math.sin(angle) * 0.21,
            head.y + 0.21 + Math.cos(angle * 2) * 0.01,
            Math.cos(angle) * 0.21,
          ),
          petals[i % 3] as number,
        );
      });
    }
  }
}
