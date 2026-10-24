import * as THREE from 'three';

/** Shared sun direction for surface lighting and lightweight ground projections. */
export const SUN_POSITION = { x: -3, y: 7, z: -4 } as const;
export const SHADOW_X = -SUN_POSITION.x / SUN_POSITION.y;
export const SHADOW_Z = -SUN_POSITION.z / SUN_POSITION.y;

export function addTownLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xf5f8ff, 0xc5bda1, 1.75));
  const sun = new THREE.DirectionalLight(0xffefd8, 2.1);
  sun.position.set(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff3df, 1.25);
  fill.position.set(1, 1, 5);
  scene.add(fill);
}

/** Broad satin highlights keep painted props and rounded characters softly sunlit. */
export function townMaterial(character = false): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: !character,
    specular: character ? 0x554938 : 0x393b32,
    shininess: character ? 20 : 18,
  });
}
