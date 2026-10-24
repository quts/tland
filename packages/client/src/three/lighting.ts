import * as THREE from 'three';

/** Shared sun direction for Lambert lighting and lightweight ground projections. */
export const SUN_POSITION = { x: -3, y: 7, z: -4 } as const;
export const SHADOW_X = -SUN_POSITION.x / SUN_POSITION.y;
export const SHADOW_Z = -SUN_POSITION.z / SUN_POSITION.y;

export function addTownLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xf1f8ff, 0x9fae89, 1.65));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.9);
  sun.position.set(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff8ec, 0.5);
  fill.position.set(1, 2, 4);
  scene.add(fill);
}
