import * as THREE from 'three';
import type { TownMap } from '@tland/shared';
import { SHADOW_X, SHADOW_Z } from './lighting.js';

export interface ShadowCaster {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly shape: 'box' | 'canopy';
}
interface Point { x: number; z: number; alpha: number }
const REGION = 32;

/** Monotone convex hull of the footprint and its projection away from the sun. */
function silhouette(caster: ShadowCaster): Point[] {
  const points: Point[] = [];
  if (caster.shape === 'box') {
    for (const lift of [0, caster.height]) for (const x of [-1, 1]) for (const z of [-1, 1]) {
      points.push({ x: caster.x + x * caster.width / 2 + lift * SHADOW_X,
        z: caster.z + z * caster.depth / 2 + lift * SHADOW_Z, alpha: 1 });
    }
  } else {
    for (let i = 0; i < 12; i += 1) {
      const angle = i * Math.PI / 6;
      points.push({ x: caster.x + Math.cos(angle) * caster.width / 2 + caster.height * SHADOW_X,
        z: caster.z + Math.sin(angle) * caster.depth / 2 + caster.height * SHADOW_Z, alpha: 1 });
    }
    points.push({ x: caster.x - 0.06, z: caster.z, alpha: 1 }, { x: caster.x + 0.06, z: caster.z, alpha: 1 });
  }
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const lower: Point[] = [], upper: Point[] = [];
  for (const p of points) {
    while (lower.length > 1 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...points].reverse()) {
    while (upper.length > 1 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Clip one triangle to one receiver tile, preserving the soft edge's vertex alpha. */
function clip(input: Point[], axis: 'x' | 'z', boundary: number, keepGreater: boolean): Point[] {
  const output: Point[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const a = input[i]!, b = input[(i + 1) % input.length]!;
    const aIn = keepGreater ? a[axis] >= boundary : a[axis] <= boundary;
    const bIn = keepGreater ? b[axis] >= boundary : b[axis] <= boundary;
    if (aIn) output.push(a);
    if (aIn !== bIn) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      output.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        alpha: a.alpha + (b.alpha - a.alpha) * t });
    }
  }
  return output;
}

/**
 * Soft static projections, clipped to flat land and batched by region.
 * No shadow framebuffer, extra scene traversal or per-frame geometry work.
 */
export function buildSunShadows(map: TownMap, casters: readonly ShadowCaster[]): THREE.Group {
  const buckets = new Map<number, { positions: number[]; colors: number[] }>();
  const ink = new THREE.Color(0x536451);
  const append = (triangle: Point[]): void => {
    const minX = Math.max(0, Math.floor(Math.min(...triangle.map(p => p.x))));
    const maxX = Math.min(map.width - 1, Math.floor(Math.max(...triangle.map(p => p.x))));
    const minZ = Math.max(0, Math.floor(Math.min(...triangle.map(p => p.z))));
    const maxZ = Math.min(map.height - 1, Math.floor(Math.max(...triangle.map(p => p.z))));
    for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
      const terrain = map.terrainAt(x, z);
      if (terrain === 'water' || terrain === 'hill' || terrain === 'building') continue;
      let polygon = clip(triangle, 'x', x, true);
      polygon = clip(polygon, 'x', x + 1, false);
      polygon = clip(polygon, 'z', z, true);
      polygon = clip(polygon, 'z', z + 1, false);
      if (polygon.length < 3) continue;
      const key = Math.floor(z / REGION) * 1000 + Math.floor(x / REGION);
      let bucket = buckets.get(key);
      if (bucket === undefined) { bucket = { positions: [], colors: [] }; buckets.set(key, bucket); }
      for (let i = 1; i < polygon.length - 1; i += 1) {
        const a = polygon[0]!, b = polygon[i + 1]!, c = polygon[i]!;
        if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-8) continue;
        for (const p of [a, b, c]) {
          bucket.positions.push(p.x, 0.018, p.z);
          bucket.colors.push(ink.r, ink.g, ink.b, p.alpha);
        }
      }
    }
  };
  for (const caster of casters) {
    const hull = silhouette(caster);
    const center: Point = { x: hull.reduce((s, p) => s + p.x, 0) / hull.length,
      z: hull.reduce((s, p) => s + p.z, 0) / hull.length, alpha: 1 };
    const feather = caster.shape === 'box' ? 0.28 : 0.30;
    const outer = hull.map(p => {
      const length = Math.hypot(p.x - center.x, p.z - center.z);
      return { x: p.x + (p.x - center.x) / length * feather,
        z: p.z + (p.z - center.z) / length * feather, alpha: 0 };
    });
    for (let i = 0; i < hull.length; i += 1) {
      const j = (i + 1) % hull.length;
      append([center, hull[i]!, hull[j]!]);
      append([hull[i]!, outer[i]!, outer[j]!]);
      append([hull[i]!, outer[j]!, hull[j]!]);
    }
  }
  const group = new THREE.Group();
  group.name = 'sun-shadows';
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
    opacity: 0.24, depthWrite: false });
  for (const [key, bucket] of buckets) {
    if (bucket.positions.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 4));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'sun-shadow-' + key;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  if (group.children.length === 0) material.dispose();
  return group;
}
