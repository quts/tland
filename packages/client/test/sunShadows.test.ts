import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getTownMap, MAX_PLAYERS } from '@tland/shared';
import { buildSunShadows } from '../src/three/sunShadows.js';
import { SHADOW_X, SHADOW_Z } from '../src/three/lighting.js';
import { CharacterLayer } from '../src/three/characters.js';

describe('sun projections', () => {
  it('projects away from the sun and clips all triangles to flat land receivers', () => {
    const terrainAt = (x: number, z: number) => x >= 4 ? 'water' as const :
      x === 3 && z === 3 ? 'hill' as const : x === 1 && z === 2 ? 'building' as const : 'grass' as const;
    const map = { ...getTownMap(), width: 8, height: 8, terrainAt };
    const group = buildSunShadows(map, [{ x: 2, z: 2, width: 1.5, depth: 1.5, height: 2, shape: 'box' }]);
    expect(SHADOW_X).toBeGreaterThan(0);
    expect(SHADOW_Z).toBeGreaterThan(0);
    expect(group.children.length).toBeGreaterThan(0);
    let maxZ = 0, softEdge = false;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      const position = mesh.geometry.getAttribute('position'), color = mesh.geometry.getAttribute('color');
      expect(color.itemSize).toBe(4);
      for (let i = 0; i < position.count; i += 3) {
        const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
        const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
        expect(terrainAt(Math.floor(cx), Math.floor(cz))).toBe('grass');
        for (let j = i; j < i + 3; j += 1) {
          expect(position.getX(j)).toBeLessThanOrEqual(4);
          expect(position.getY(j)).toBeCloseTo(0.018);
          expect(color.getW(j)).toBeGreaterThanOrEqual(0);
          expect(color.getW(j)).toBeLessThanOrEqual(1);
          if (color.getW(j) < 1) softEdge = true;
          maxZ = Math.max(maxZ, position.getZ(j));
        }
      }
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    expect(maxZ).toBeGreaterThan(3.5);
    expect(softEdge).toBe(true);
  });

  it('creates no floating projections when the receivers are all water', () => {
    const map = { ...getTownMap(), width: 8, height: 8, terrainAt: () => 'water' as const };
    expect(buildSunShadows(map, [{ x: 2, z: 2, width: 1, depth: 1, height: 2, shape: 'canopy' }]).children).toHaveLength(0);
  });

  it('keeps a full room of contact and directional player shadows within one instance batch', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const layer = new CharacterLayer(new THREE.MeshLambertMaterial(),
      new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial());
    try {
      for (let i = 0; i < MAX_PLAYERS; i += 1) layer.add(String(i),
        { body: 0, shirt: 4, hat: 'sunhat', accessory: 'scarf' }, i * 32, 32, 'down');
      layer.sync();
      const faces = layer.group.getObjectByName('faces') as THREE.InstancedMesh;
      const shadows = layer.group.getObjectByName('character-shadows') as THREE.InstancedMesh;
      expect(faces.count).toBe(MAX_PLAYERS);
      expect(shadows.count).toBe(MAX_PLAYERS * 2);
      const contact = new THREE.Matrix4(), sun = new THREE.Matrix4();
      shadows.getMatrixAt(0, contact);
      shadows.getMatrixAt(1, sun);
      expect(sun.elements[12]).toBeGreaterThan(contact.elements[12]!);
      expect(sun.elements[14]).toBeGreaterThan(contact.elements[14]!);
    } finally {
      layer.dispose();
      vi.unstubAllGlobals();
    }
  });
});
