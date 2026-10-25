import * as THREE from 'three';
import { PALETTE } from '../../gfx/palette.js';
import type { Accessory } from '../../gfx/avatar.js';
import { painted } from '../geometry.js';
import { PROPORTIONS as P } from './proportions.js';

/** The accessories that are not the scarf; the scarf is its own component. */
export function accessoryParts(accessory: Accessory, shirt: number): THREE.BufferGeometry[] {
  const head = P.head;
  switch (accessory) {
    case 'none':
    case 'scarf':
      return [];
    case 'glasses': {
      // Centred on the eyes painted on the face patch.
      const lens = (x: number): THREE.BufferGeometry =>
        painted(new THREE.TorusGeometry(0.055, 0.011, 8, 20).rotateX(-0.25)
          .translate(x, head.y + 0.06, head.radius * 0.96), PALETTE.ink);
      return [
        lens(-0.065),
        lens(0.065),
        painted(new THREE.BoxGeometry(0.022, 0.01, 0.01)
          .translate(0, head.y + 0.07, head.radius * 0.98), PALETTE.ink),
      ];
    }
    case 'satchel':
      return [
        // In front of the hip: the arm hangs where this used to sit.
        painted(new THREE.BoxGeometry(0.14, 0.13, 0.06).rotateY(-0.3)
          .translate(0.185, 0.235, 0.15), PALETTE.bench, {
          from: 0.8, to: 1, bottom: 0.17, top: 0.3,
        }),
        painted(new THREE.TorusGeometry(0.25, 0.014, 4, 24).rotateY(Math.PI / 2)
          .rotateX(0.75).translate(0.02, 0.4, 0.04), PALETTE.benchShade),
      ];
    case 'bowtie': {
      // A contrasting tie, so it does not vanish into the shirt.
      const tie = shirt === PALETTE.roofCool ? PALETTE.roofWarm : PALETTE.roofCool;
      const y = P.body.collarY - 0.045;
      return [
        painted(new THREE.ConeGeometry(0.045, 0.08, 6).rotateZ(Math.PI / 2).translate(-0.04, y, 0.175), tie),
        painted(new THREE.ConeGeometry(0.045, 0.08, 6).rotateZ(-Math.PI / 2).translate(0.04, y, 0.175), tie),
        painted(new THREE.SphereGeometry(0.022, 6, 4).translate(0, y, 0.185), tie),
      ];
    }
  }
}
