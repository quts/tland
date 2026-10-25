import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PROPORTIONS } from '../src/three/character/proportions.js';
import {
  CharacterMaterialCache, DEFAULT_COLORS, PART, assembleCharacter,
  characterArmGeometry, characterBodyGeometry, colorKey,
} from '../src/three/character/index.js';

const OTHER = { ...DEFAULT_COLORS, outfit: '#90c9ae', scarf: '#f0a978' };

function material(): THREE.Material {
  return new THREE.MeshBasicMaterial();
}

/** Where the hand ends up in the character's own space, for a given pose. */
function handAt(side: -1 | 1, pitch: number, splay: number): THREE.Vector3 {
  const assembled = assembleCharacter(material());
  assembled.poseArm(side, pitch, splay);
  assembled.root.updateMatrixWorld(true);
  return assembled.arm(side).localToWorld(new THREE.Vector3(0, -PROPORTIONS.arm.hand.at, 0));
}

describe('the character', () => {
  it('is one geometry, whatever the colours', () => {
    const body = characterBodyGeometry();
    const arm = characterArmGeometry();
    // Asking again gives the same objects: colour never rebuilds a shape.
    expect(characterBodyGeometry()).toBe(body);
    expect(characterArmGeometry()).toBe(arm);

    const a = assembleCharacter(material());
    const b = assembleCharacter(material());
    expect(b.body.geometry).toBe(a.body.geometry);
    for (const side of [-1, 1] as const) {
      expect((b.arm(side).children[0] as THREE.Mesh).geometry)
        .toBe((a.arm(side).children[0] as THREE.Mesh).geometry);
    }
  });

  it('recolours by swapping the material, never the geometry', () => {
    const palettes = new CharacterMaterialCache();
    const character = assembleCharacter(palettes.get(DEFAULT_COLORS));
    const before = character.body.geometry;
    character.setMaterial(palettes.get(OTHER));
    expect(character.body.geometry).toBe(before);
    expect(character.body.material).toBe(palettes.get(OTHER));
    for (const side of [-1, 1] as const) {
      expect((character.arm(side).children[0] as THREE.Mesh).material)
        .toBe(palettes.get(OTHER));
    }
    palettes.dispose();
  });

  it('allocates one material per palette, not per character', () => {
    const palettes = new CharacterMaterialCache();
    for (let i = 0; i < 10; i += 1) assembleCharacter(palettes.get(DEFAULT_COLORS));
    expect(palettes.size).toBe(1);
    assembleCharacter(palettes.get(OTHER));
    expect(palettes.size).toBe(2);
    expect(colorKey(DEFAULT_COLORS)).not.toBe(colorKey(OTHER));
    palettes.dispose();
  });

  it('wears the hat and the scarf always, with nothing to toggle', () => {
    const position = characterBodyGeometry().getAttribute('position');
    const parts = characterBodyGeometry().getAttribute('partId');
    expect(parts.count).toBe(position.count);
    const present = new Set<number>();
    for (let i = 0; i < parts.count; i += 1) present.add(parts.getX(i));
    // Every slot of the palette is actually used by the one fixed outfit.
    for (const slot of Object.values(PART)) {
      expect(present.has(slot), `part ${slot}`).toBe(true);
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
    const character = assembleCharacter(material());
    character.root.updateMatrixWorld(true);
    const before = character.arm(-1).matrixWorld.clone();
    character.poseArm(1, Math.PI / 2);
    character.root.updateMatrixWorld(true);
    expect(character.arm(-1).matrixWorld.equals(before)).toBe(true);

    // Splay sends the hand outward on both sides, pitch forward on both.
    expect(handAt(1, 0, 1.1).x).toBeGreaterThan(handAt(1, 0, 0).x);
    expect(handAt(-1, 0, 1.1).x).toBeLessThan(handAt(-1, 0, 0).x);
    for (const side of [-1, 1] as const) {
      expect(handAt(side, 0.8, 0).z).toBeGreaterThan(handAt(side, 0, 0).z);
    }
  });

  it('keeps the shoulder a sphere about the pivot, so no pose can open it', () => {
    const { joint } = PROPORTIONS.arm;
    const position = characterArmGeometry().getAttribute('position');
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
    expect(onTheBall).toBeGreaterThan(100);
  });

  it('winds the scarf unevenly, and rests it on the shoulders', () => {
    const s = PROPORTIONS.scarf;
    const { pivot, joint } = PROPORTIONS.arm;
    const position = characterBodyGeometry().getAttribute('position');
    const parts = characterBodyGeometry().getAttribute('partId');
    // The scarf's radius where it passes the neck, bucketed by direction: a
    // loop of constant radius is a torus, which wound cloth never makes.
    const radii = new Map<number, number>();
    for (let i = 0; i < position.count; i += 1) {
      if (parts.getX(i) !== PART.scarf) continue;
      if (Math.abs(position.getY(i) - s.y) > 0.012) continue;
      const bucket = Math.round(Math.atan2(position.getX(i), position.getZ(i)) * 5);
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      radii.set(bucket, Math.max(radii.get(bucket) ?? 0, radius));
    }
    const outer = [...radii.values()];
    expect(outer.length).toBeGreaterThan(8);
    expect(Math.max(...outer) - Math.min(...outer)).toBeGreaterThan(0.01);

    // It goes round more than once, so the cloth laps over its own start.
    expect(s.turns).toBeGreaterThan(1);
    // It rests on the shoulders: where the cloth is at its widest it reaches
    // further out than the shoulder ball does, so the top of the shoulder
    // passes inside the scarf rather than through its surface.
    expect(s.radius + s.width).toBeGreaterThan(pivot.x + joint);
    // And the tail is a band, not a rope.
    expect(s.width).toBeGreaterThan(s.thickness);
  });

  it('is symmetric left to right, apart from the scarf', () => {
    const position = characterBodyGeometry().getAttribute('position');
    const parts = characterBodyGeometry().getAttribute('partId');
    const side = (sign: number): number[][] => {
      const rows: number[][] = [];
      for (let i = 0; i < position.count; i += 1) {
        // The scarf is wound and hangs to one side; nothing else is.
        if (parts.getX(i) === PART.scarf) continue;
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
