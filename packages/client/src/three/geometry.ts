import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Shading ramp for `painted`: brightness `from` at y = bottom up to `to` at y = top. */
export interface Shade {
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  readonly top: number;
}

const color = new THREE.Color();

/**
 * Give a primitive a flat vertex colour, darkened towards its base.
 *
 * That darkening is the whole ambient-occlusion budget for props: the bottom
 * of a trunk, a wall or a rock sits in its own contact shadow.
 */
export function painted(
  geometry: THREE.BufferGeometry,
  hex: number,
  shade: Shade = { from: 1, to: 1, bottom: 0, top: 1 },
): THREE.BufferGeometry {
  const flat = geometry.index === null ? geometry : geometry.toNonIndexed();
  flat.deleteAttribute('uv');
  const position = flat.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  color.setHex(hex);
  for (let i = 0; i < position.count; i += 1) {
    const t = THREE.MathUtils.clamp((position.getY(i) - shade.bottom) / (shade.top - shade.bottom), 0, 1);
    const s = shade.from + (shade.to - shade.from) * t;
    colors[i * 3] = color.r * s;
    colors[i * 3 + 1] = color.g * s;
    colors[i * 3 + 2] = color.b * s;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (merged === null) throw new Error('could not merge geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}
