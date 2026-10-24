import * as THREE from 'three';
import { hashCoords, type TownMap } from '@tland/shared';
import { PALETTE } from '../gfx/palette.js';
import { BUILDING_CELL, buildingPlots } from '../world/buildingLayout.js';
import { merge, painted } from './geometry.js';

/**
 * Instances are grouped into square regions of this many tiles, one
 * InstancedMesh per kind per region. One mesh for the whole island would be
 * a single draw call but could never be culled; one per tile would be
 * thousands. A region is about a screen across, so a frame draws a few.
 */
const REGION = 32;

const PROP_SEED = 0x3d7e;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const tmpColor = new THREE.Color();

function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.55, 6).translate(0, 0.275, 0);
  const crown = new THREE.IcosahedronGeometry(0.44, 1).scale(1, 0.9, 1).translate(0, 0.92, 0);
  const tuft = new THREE.IcosahedronGeometry(0.27, 0).translate(0.1, 1.25, 0.06);
  return merge([
    painted(trunk, PALETTE.trunk, { from: 0.7, to: 1, bottom: 0, top: 0.5 }),
    painted(crown, PALETTE.leafLight, { from: 0.72, to: 1.04, bottom: 0.55, top: 1.3 }),
    painted(tuft, PALETTE.leafLight, { from: 0.9, to: 1.08, bottom: 1.05, top: 1.5 }),
  ]);
}

function flowerGeometry(): THREE.BufferGeometry {
  // Petal colour comes from the instance; the leaves stay green.
  const blooms = [
    [-0.13, 0.12, 0.05],
    [0.12, 0.1, 0.1],
    [0.02, 0.15, -0.12],
  ].map(([x, y, z]) => painted(new THREE.IcosahedronGeometry(0.075, 0).translate(x!, y!, z!), 0xffffff));
  const leaves = painted(
    new THREE.CylinderGeometry(0.2, 0.22, 0.05, 7).translate(0, 0.025, 0),
    PALETTE.grassDeep,
  );
  return merge([...blooms, leaves]);
}

function benchGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(0.72, 0.07, 0.26).translate(0, 0.24, 0);
  const back = new THREE.BoxGeometry(0.72, 0.2, 0.05).translate(0, 0.4, -0.11);
  const legL = new THREE.BoxGeometry(0.07, 0.24, 0.24).translate(-0.3, 0.12, 0);
  const legR = new THREE.BoxGeometry(0.07, 0.24, 0.24).translate(0.3, 0.12, 0);
  return merge([
    painted(seat, PALETTE.bench),
    painted(back, PALETTE.bench),
    painted(legL, PALETTE.benchShade, { from: 0.75, to: 1, bottom: 0, top: 0.24 }),
    painted(legR, PALETTE.benchShade, { from: 0.75, to: 1, bottom: 0, top: 0.24 }),
  ]);
}

function rockGeometry(): THREE.BufferGeometry {
  const rock = new THREE.DodecahedronGeometry(0.28, 0).scale(1, 0.62, 0.86).translate(0, 0.1, 0);
  return merge([painted(rock, PALETTE.rock, { from: 0.72, to: 1.06, bottom: -0.05, top: 0.28 })]);
}

/** One edge of railing, a tile long, running along x. */
function fenceGeometry(): THREE.BufferGeometry {
  const parts = [-0.45, 0.45].map((x) =>
    painted(new THREE.BoxGeometry(0.08, 0.34, 0.08).translate(x, 0.17, 0), PALETTE.bridgePlank, {
      from: 0.75, to: 1, bottom: 0, top: 0.34,
    }),
  );
  parts.push(painted(new THREE.BoxGeometry(1, 0.05, 0.05).translate(0, 0.29, 0), PALETTE.wallAlt));
  parts.push(painted(new THREE.BoxGeometry(1, 0.04, 0.04).translate(0, 0.15, 0), PALETTE.wallAlt));
  return merge(parts);
}

/** A unit block standing on the ground; instances stretch it to a building. */
function wallGeometry(): THREE.BufferGeometry {
  return merge([
    painted(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff, {
      from: 0.78, to: 1, bottom: 0, top: 0.6,
    }),
  ]);
}

/** A square pyramid, aligned to the walls, sitting on y = 0. */
function roofGeometry(): THREE.BufferGeometry {
  const roof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  return merge([painted(roof, 0xffffff, { from: 0.86, to: 1.04, bottom: 0, top: 1 })]);
}

/** A door and two windows on the south face, which is the one the camera sees. */
function frontGeometry(): THREE.BufferGeometry {
  return merge([
    painted(new THREE.BoxGeometry(0.16, 0.26, 0.04).translate(0, 0.13, 0.5), PALETTE.door),
    painted(new THREE.BoxGeometry(0.16, 0.14, 0.04).translate(-0.3, 0.5, 0.5), PALETTE.roofCool),
    painted(new THREE.BoxGeometry(0.16, 0.14, 0.04).translate(0.3, 0.5, 0.5), PALETTE.roofCool),
  ]);
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

interface Placement {
  x: number;
  y: number;
  z: number;
  rotation: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/** Several InstancedMeshes of one kind, one per occupied region. */
function instanced(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  group: THREE.Group,
): void {
  const byRegion = new Map<number, Placement[]>();
  for (const placement of placements) {
    const key = Math.floor(placement.z / REGION) * 1000 + Math.floor(placement.x / REGION);
    let list = byRegion.get(key);
    if (list === undefined) {
      list = [];
      byRegion.set(key, list);
    }
    list.push(placement);
  }

  for (const [key, list] of byRegion) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = `${name}-${key}`;
    list.forEach((p, i) => {
      position.set(p.x, p.y, p.z);
      quaternion.setFromAxisAngle(up, p.rotation);
      scale.set(p.sx, p.sy, p.sz);
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      mesh.setColorAt(i, tmpColor.setHex(p.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
}

/** A deterministic number in [0, 1) for a tile and a purpose. */
function roll(x: number, y: number, salt: number): number {
  return (hashCoords(x, y, PROP_SEED + salt) % 10_000) / 10_000;
}

/** Slight per-instance tint, so a stand of trees is not one colour. */
function tint(base: number, x: number, y: number, amount: number): number {
  const t = (roll(x, y, 7) - 0.5) * amount;
  return tmpColor.setHex(base).offsetHSL(0, -Math.abs(t) * 0.4, t).getHex();
}

/** Share of hill tiles that carry a tree. */
const HILL_TREE_CHANCE = 0.3;

const BUILDING_HEIGHTS = [1.5, 1.9, 2.3, 4.2, 1.3] as const;
const ROOFS = [PALETTE.roofWarm, PALETTE.roofCool, PALETTE.roofMint] as const;
const WALLS = [PALETTE.wall, PALETTE.wallAlt] as const;

export interface BuiltProps {
  readonly group: THREE.Group;
  /** Blob shadows, as the same instanced quads the player's shadow uses. */
  readonly shadows: THREE.Group;
}

/**
 * Everything standing on the ground, read straight from the shared map.
 *
 * Nothing here decides where a prop goes: the shared map already did, and
 * the server agrees with it. This only chooses how each one looks.
 */
export function buildProps(
  map: TownMap,
  heights: Float32Array,
  material: THREE.Material,
  shadowGeometry: THREE.BufferGeometry,
  shadowMaterial: THREE.Material,
): BuiltProps {
  const group = new THREE.Group();
  group.name = 'props';
  const shadowGroup = new THREE.Group();
  shadowGroup.name = 'prop-shadows';

  const trees: Placement[] = [];
  const flowers: Placement[] = [];
  const benches: Placement[] = [];
  const rocks: Placement[] = [];
  const fences: Placement[] = [];
  const shadows: Placement[] = [];
  const petals = [PALETTE.petalRose, PALETTE.petalCream, PALETTE.petalLilac];
  const stride = map.width + 1;
  const groundAt = (x: number, y: number): number =>
    ((heights[y * stride + x] as number) + (heights[y * stride + x + 1] as number) +
      (heights[(y + 1) * stride + x] as number) + (heights[(y + 1) * stride + x + 1] as number)) / 4;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const cx = x + 0.5;
      const cz = y + 0.5;
      switch (map.propAt(x, y)) {
        case 'tree': {
          const s = 0.85 + roll(x, y, 1) * 0.3;
          trees.push({ x: cx, y: 0, z: cz, rotation: roll(x, y, 2) * Math.PI * 2, sx: s, sy: s * (0.9 + roll(x, y, 3) * 0.25), sz: s, color: tint(0xffffff, x, y, 0.12) });
          shadows.push({ x: cx, y: 0, z: cz + 0.08, rotation: 0, sx: 1.25 * s, sy: 1, sz: 1.05 * s, color: 0xffffff });
          break;
        }
        case 'flower':
          flowers.push({ x: cx, y: 0, z: cz, rotation: roll(x, y, 4) * Math.PI * 2, sx: 1, sy: 1, sz: 1, color: petals[hashCoords(x, y, 0x51a8) % 3] as number });
          break;
        case 'bench':
          benches.push({ x: cx, y: 0, z: cz, rotation: 0, sx: 1, sy: 1, sz: 1, color: 0xffffff });
          shadows.push({ x: cx, y: 0, z: cz, rotation: 0, sx: 0.95, sy: 1, sz: 0.5, color: 0xffffff });
          break;
        case 'rock':
          rocks.push({ x: cx, y: 0, z: cz, rotation: roll(x, y, 5) * Math.PI * 2, sx: 1, sy: 0.8 + roll(x, y, 6) * 0.5, sz: 1, color: 0xffffff });
          shadows.push({ x: cx, y: 0, z: cz, rotation: 0, sx: 0.7, sy: 1, sz: 0.6, color: 0xffffff });
          break;
        case 'none':
          break;
      }

      // Woods on the hills. Hill tiles are impassable already, so these are
      // scenery only: the grid, and the server's idea of where you can walk,
      // are exactly what they were.
      if (map.terrainAt(x, y) === 'hill' && roll(x, y, 8) < HILL_TREE_CHANCE) {
        const s = 0.8 + roll(x, y, 9) * 0.45;
        trees.push({ x: cx + (roll(x, y, 10) - 0.5) * 0.3, y: groundAt(x, y) - 0.05, z: cz + (roll(x, y, 11) - 0.5) * 0.3, rotation: roll(x, y, 2) * Math.PI * 2, sx: s, sy: s * (0.9 + roll(x, y, 3) * 0.3), sz: s, color: tint(0xf2fbf4, x, y, 0.16) });
      }

      // Railings along both sides of every bridge, where the deck meets water.
      if (map.terrainAt(x, y) === 'bridge') {
        const edges: ReadonlyArray<readonly [number, number, number, number, number]> = [
          [0, -1, cx, y + 0.06, 0],
          [0, 1, cx, y + 0.94, 0],
          [-1, 0, x + 0.06, cz, Math.PI / 2],
          [1, 0, x + 0.94, cz, Math.PI / 2],
        ];
        for (const [dx, dy, fx, fz, rotation] of edges) {
          if (map.terrainAt(x + dx, y + dy) !== 'water') continue;
          fences.push({ x: fx, y: 0, z: fz, rotation, sx: 1, sy: 1, sz: 1, color: 0xffffff });
        }
      }
    }
  }

  const walls: Placement[] = [];
  const roofs: Placement[] = [];
  const fronts: Placement[] = [];
  for (const plot of buildingPlots(map)) {
    const footprint = BUILDING_CELL - 0.5;
    const cx = plot.x + BUILDING_CELL / 2;
    const cz = plot.y + BUILDING_CELL / 2;
    const h = BUILDING_HEIGHTS[plot.variant] ?? 1.6;
    const r = hashCoords(plot.x, plot.y, 0x2f92);
    walls.push({ x: cx, y: 0, z: cz, rotation: 0, sx: footprint, sy: h, sz: footprint, color: WALLS[r % 2] as number });
    // Towers get a low cap; houses get a proper roof.
    roofs.push({ x: cx, y: h, z: cz, rotation: 0, sx: footprint * 1.12, sy: plot.variant === 3 ? 0.5 : 1.15, sz: footprint * 1.12, color: ROOFS[(r >>> 3) % 3] as number });
    fronts.push({ x: cx, y: 0, z: cz, rotation: 0, sx: footprint, sy: Math.min(h, 2), sz: footprint, color: 0xffffff });
  }

  instanced('trees', treeGeometry(), material, trees, group);
  instanced('flowers', flowerGeometry(), material, flowers, group);
  instanced('benches', benchGeometry(), material, benches, group);
  instanced('rocks', rockGeometry(), material, rocks, group);
  instanced('fences', fenceGeometry(), material, fences, group);
  instanced('walls', wallGeometry(), material, walls, group);
  instanced('roofs', roofGeometry(), material, roofs, group);
  instanced('fronts', frontGeometry(), material, fronts, group);
  instanced('shadows', shadowGeometry, shadowMaterial, shadows, shadowGroup);

  return { group, shadows: shadowGroup };
}
