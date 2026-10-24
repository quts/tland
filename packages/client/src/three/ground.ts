import * as THREE from 'three';
import { hashCoords, type Terrain, type TownMap } from '@tland/shared';
import { PALETTE } from '../gfx/palette.js';

/** The riverbed and sea floor, below the water surface. */
export const WATER_FLOOR = -0.45;
/** The water surface. Walkable ground is at zero, so this sits just under it. */
export const WATER_LEVEL = -0.12;

/** Square chunks, so the camera frustum can skip the parts it cannot see. */
const CHUNK = 32;
const VARIATION_SEED = 0x51a7;
const HILL_STEP = 0.3;
const HILL_MAX_STEPS = 7;

/**
 * Terrain heights at tile corners.
 *
 * The one rule that matters: any corner touching ground a player can stand
 * on is at exactly zero. So every walkable tile is flat, and walkability is
 * the grid's business, never the renderer's. Hills rise only from tiles that
 * were already impassable, by how far they are from the nearest flat ground.
 */
export function cornerHeights(map: TownMap): Float32Array {
  const { width, height } = map;

  // Distance, in tiles, from each hill tile to the nearest tile that is not hill.
  const distance = new Int16Array(width * height).fill(-1);
  const queue: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (map.terrainAt(x, y) !== 'hill') {
        distance[y * width + x] = 0;
        queue.push(y * width + x);
      }
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] as number;
    const x = index % width;
    const y = (index - x) / width;
    const next = (distance[index] as number) + 1;
    if (x > 0 && distance[index - 1] === -1) { distance[index - 1] = next; queue.push(index - 1); }
    if (x < width - 1 && distance[index + 1] === -1) { distance[index + 1] = next; queue.push(index + 1); }
    if (y > 0 && distance[index - width] === -1) { distance[index - width] = next; queue.push(index - width); }
    if (y < height - 1 && distance[index + width] === -1) { distance[index + width] = next; queue.push(index + width); }
  }

  const tileHeight = (x: number, y: number): number => {
    const steps = Math.min(distance[y * width + x] as number, HILL_MAX_STEPS);
    // A little per-tile wobble so the slopes are not perfectly terraced.
    const wobble = ((hashCoords(x, y, 0x41) % 100) / 100 - 0.5) * 0.18;
    return steps * HILL_STEP + wobble;
  };

  const stride = width + 1;
  const heights = new Float32Array(stride * (height + 1));
  for (let cy = 0; cy <= height; cy += 1) {
    for (let cx = 0; cx <= width; cx += 1) {
      let flat = false;
      let water = 0;
      let hills = 0;
      let sum = 0;
      for (let dy = -1; dy <= 0; dy += 1) {
        for (let dx = -1; dx <= 0; dx += 1) {
          const terrain = map.terrainAt(cx + dx, cy + dy);
          if (terrain === 'water') water += 1;
          else if (terrain === 'hill') {
            hills += 1;
            sum += tileHeight(cx + dx, cy + dy);
          } else flat = true;
        }
      }
      // Flat ground wins outright; a hill meeting water comes down to the bank.
      let value = 0;
      if (!flat && water === 4) value = WATER_FLOOR;
      else if (!flat && water === 0) value = sum / hills;
      heights[cy * stride + cx] = value;
    }
  }
  return heights;
}

const scratch = new THREE.Color();

function terrainColor(map: TownMap, terrain: Terrain, x: number, y: number, out: THREE.Color): THREE.Color {
  const roll = hashCoords(x, y, VARIATION_SEED) % 100;
  switch (terrain) {
    case 'grass':
      return out.setHex(roll < 14 ? PALETTE.grassAlt : PALETTE.grass);
    case 'sand':
      return out.setHex(roll < 35 ? PALETTE.sandAlt : PALETTE.sand);
    case 'water':
      // Only the banks show above the surface; let them read as wet sand.
      return out.setHex(PALETTE.sandAlt).multiplyScalar(0.92);
    case 'hill':
      return out.setHex(roll < 8 ? PALETTE.hillRock : roll < 50 ? PALETTE.hillHigh : PALETTE.hill);
    case 'path':
      return out.setHex(roll < 40 ? PALETTE.pathAlt : PALETTE.path);
    case 'bridge':
      return out.setHex(map.terrainAt(x - 1, y) === 'bridge' || map.terrainAt(x + 1, y) === 'bridge'
        ? PALETTE.bridge : PALETTE.bridgePlank);
    case 'park':
      return out.setHex(roll < 35 ? PALETTE.lawnAlt : PALETTE.lawn);
    case 'building':
      return out.setHex(PALETTE.pathEdge);
  }
}

/** Raised or obstructing ground darkens the flat ground at its foot. */
function occluder(terrain: Terrain): number {
  if (terrain === 'hill') return 1;
  if (terrain === 'building') return 0.8;
  return 0;
}

/**
 * Fake ambient occlusion for a corner, baked into its vertex colour.
 *
 * Flat corners darken next to hills and buildings; hill corners darken in
 * the hollows and brighten towards the tops. No screen-space pass needed.
 */
function cornerShade(map: TownMap, heights: Float32Array, cx: number, cy: number): number {
  const stride = map.width + 1;
  const h = heights[cy * stride + cx] as number;
  if (h > 0) return 0.82 + Math.min(h / (HILL_STEP * HILL_MAX_STEPS), 1) * 0.22;

  let blocked = 0;
  for (let dy = -2; dy <= 1; dy += 1) {
    for (let dx = -2; dx <= 1; dx += 1) {
      const weight = dx >= -1 && dx <= 0 && dy >= -1 && dy <= 0 ? 1 : 0.35;
      blocked += occluder(map.terrainAt(cx + dx, cy + dy)) * weight;
    }
  }
  if (map.propAt(cx - 1, cy - 1) === 'tree' || map.propAt(cx, cy - 1) === 'tree' ||
      map.propAt(cx - 1, cy) === 'tree' || map.propAt(cx, cy) === 'tree') blocked += 0.6;
  return 1 - Math.min(blocked, 4) * 0.06;
}

/**
 * The ground as a handful of merged meshes, one per chunk.
 *
 * Each tile is its own quad so colours stay crisp per tile, with corners
 * shared by height. Tiles entirely under the water are left out: the opaque
 * water plane hides them anyway, and they are most of the island's frame.
 */
export function buildGround(map: TownMap, heights: Float32Array, material: THREE.Material): THREE.Group {
  const stride = map.width + 1;
  const shade = new Float32Array(heights.length);
  for (let cy = 0; cy <= map.height; cy += 1) {
    for (let cx = 0; cx <= map.width; cx += 1) {
      shade[cy * stride + cx] = cornerShade(map, heights, cx, cy);
    }
  }

  const group = new THREE.Group();
  group.name = 'ground';

  for (let chunkY = 0; chunkY < map.height; chunkY += CHUNK) {
    for (let chunkX = 0; chunkX < map.width; chunkX += CHUNK) {
      const positions: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];

      for (let y = chunkY; y < Math.min(chunkY + CHUNK, map.height); y += 1) {
        for (let x = chunkX; x < Math.min(chunkX + CHUNK, map.width); x += 1) {
          const corners = [
            [x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1],
          ] as const;
          const h = corners.map(([cx, cy]) => heights[cy * stride + cx] as number);
          if (h.every((value) => value === WATER_FLOOR)) continue;

          terrainColor(map, map.terrainAt(x, y), x, y, scratch);
          const base = positions.length / 3;
          corners.forEach(([cx, cy], i) => {
            positions.push(cx, h[i] as number, cy);
            const s = shade[cy * stride + cx] as number;
            colors.push(scratch.r * s, scratch.g * s, scratch.b * s);
          });
          // Split along the diagonal that follows the slope, so ridges stay ridges.
          if (Math.abs((h[0] as number) - (h[3] as number)) > Math.abs((h[1] as number) - (h[2] as number))) {
            indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
          } else {
            indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
          }
        }
      }

      if (indices.length === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `ground-${chunkX}-${chunkY}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  return group;
}

