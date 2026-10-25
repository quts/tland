import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { merge, painted } from './geometry.js';
import { HOUSE_COLORS, type BuildingPlot } from '../world/buildingLayout.js';

const CREAM = 0xf8ecd2;
const WOOD = 0xba8249;
const GREEN = 0x75a354;

/** Arch lies on the XY plane, with a flat base and semicircular head. */
function arch(width: number, height: number): THREE.Shape {
  const r = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, height - r);
  shape.absarc(0, height - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return shape;
}

function relief(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 2, steps: 1,
    bevelSize: 0.018, bevelThickness: 0.018, curveSegments: 12,
  });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.04): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 1, radius).translate(x, y, z);
}

function windowParts(): THREE.BufferGeometry[] {
  const frame = arch(0.62, 0.83);
  const hole = arch(0.47, 0.67);
  // Shape holes are offset above the sill, leaving an even cream border.
  const path = new THREE.Path(hole.getPoints().map(p => p.add(new THREE.Vector2(0, 0.07))));
  frame.holes.push(path);
  const parts = [
    painted(relief(frame, 0.065), CREAM),
    painted(relief(arch(0.47, 0.67), 0.025).translate(0, 0.07, -0.006), 0x79adc2),
    painted(box(0.035, 0.69, 0.045, 0, 0.4, 0.065, 0.008), CREAM),
    painted(box(0.5, 0.035, 0.045, 0, 0.41, 0.065, 0.008), CREAM),
    painted(box(0.77, 0.17, 0.26, 0, -0.04, 0.12), WOOD),
    painted(box(0.8, 0.06, 0.29, 0, 0.065, 0.12, 0.02), 0xce9859),
  ];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.14;
    parts.push(painted(new THREE.SphereGeometry(0.105, 8, 5).scale(1, 0.65, 0.8).translate(x, 0.12, 0.13), GREEN));
    for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5;
      parts.push(painted(new THREE.SphereGeometry(0.037, 5, 4).scale(1, 0.65, 1)
        .translate(x + Math.cos(a) * 0.045, 0.17, 0.17 + Math.sin(a) * 0.04), 0xfff8e5));
    }
    parts.push(painted(new THREE.SphereGeometry(0.028, 6, 4).translate(x, 0.185, 0.17), 0xf3ce55));
  }
  return parts;
}

/** Fixed reference cottage; palettes change color only, never its silhouette. */
export function houseGeometry(variant: number): THREE.BufferGeometry {
  const [wall, roof, door] = HOUSE_COLORS[variant % HOUSE_COLORS.length]!;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: number): void => { parts.push(painted(g, color)); };
  add(box(3.88, 0.14, 3.88, 0, 0.07, 0, 0.13), 0xb2c780);
  add(box(2.98, 0.19, 2.72, 0, 0.21, -0.15), 0xd8cdb2);
  // Extrude the complete gabled wall as one surface, avoiding a seam at the eaves.
  const shell = new THREE.Shape();
  shell.moveTo(-1.3, 0); shell.lineTo(1.3, 0);
  shell.lineTo(1.3, 1.98); shell.lineTo(0, 2.92);
  shell.lineTo(-1.3, 1.98); shell.closePath();
  add(new THREE.ExtrudeGeometry(shell, {
    depth: 2.83, bevelEnabled: true, bevelSegments: 3,
    bevelSize: 0.035, bevelThickness: 0.035, steps: 1,
  }).rotateY(Math.PI / 2).translate(-1.415, 0.28, -0.15), wall);
  const slope = Math.atan2(0.98, 1.52);
  for (const side of [-1, 1]) {
    const panel = box(3.3, 0.13, 1.9, 0, 0, 0, 0.055)
      .rotateX(side * slope).translate(0, 2.73, -0.15 + side * 0.76);
    add(panel, roof);
  }
  add(box(3.3, 0.15, 0.16, 0, 3.23, -0.15), roof);
  // Hollow chimney, including its dark opening and four rounded rim pieces.
  add(box(0.34, 0.68, 0.35, 0.92, 3.12, -0.6), wall);
  add(box(0.27, 0.015, 0.27, 0.92, 3.47, -0.6, 0.008), 0x80735a);
  for (const offset of [-0.18, 0.18]) {
    add(box(0.43, 0.1, 0.075, 0.92, 3.5, -0.6 + offset, 0.022), CREAM);
    add(box(0.075, 0.1, 0.36, 0.92 + offset, 3.5, -0.6, 0.022), CREAM);
  }
  // Arched door surround and inset, with plank seams and a brass handle.
  add(relief(arch(0.92, 1.35), 0.075).translate(0, 0.28, 1.17), CREAM);
  add(relief(arch(0.73, 1.19), 0.035).translate(0, 0.3, 1.25), door);
  for (const x of [-0.22, -0.075, 0.075, 0.22]) {
    add(box(0.012, 0.91, 0.012, x, 0.79, 1.298, 0.003), 0x946838);
  }
  add(new THREE.SphereGeometry(0.055, 10, 7).scale(1, 1, 0.6).translate(0.23, 0.85, 1.33), 0xe8bb4c);
  add(box(1.18, 0.13, 0.37, 0, 0.21, 1.38, 0.025), CREAM);
  add(box(1.35, 0.09, 0.38, 0, 0.14, 1.64, 0.025), CREAM);
  // Two front windows and one on each side, with actual frames and flowerboxes.
  for (const x of [-0.99, 0.99]) {
    parts.push(...windowParts().map(g => g.translate(x, 0.72, 1.19)));
  }
  for (const side of [-1, 1]) {
    parts.push(...windowParts().map(g => g.rotateY(side * Math.PI / 2).translate(side * 1.48, 0.86, -0.15)));
  }
  // A rounded wooden name plaque. Text uses one shared atlas across the town.
  add(box(2.22, 0.34, 0.12, 0, 1.94, 1.22, 0.08), 0xe9c797);
  for (const [x, z] of [[-1.55, 1.36], [1.55, 1.36], [-1.55, -1.44], [1.55, -1.44]]) {
    for (const [dx, dy, dz, r] of [[0, 0.3, 0, 0.29], [0.22, 0.22, 0.08, 0.21], [-0.18, 0.2, 0.12, 0.19]]) {
      add(new THREE.SphereGeometry(r!, 9, 6).scale(1, 1.1, 1).translate(x! + dx!, dy!, z! + dz!), GREEN);
    }
  }
  return merge(parts);
}

/** Build all house name labels into one texture, avoiding fifteen textures/materials. */
export function houseSigns(plots: readonly BuildingPlot[]): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#513821';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const parts: THREE.BufferGeometry[] = [];
  plots.forEach((plot, index) => {
    const col = index % 4, row = Math.floor(index / 4);
    let size = 28;
    ctx.font = 'bold ' + size + 'px sans-serif';
    while (ctx.measureText(plot.name).width > 238 && size > 15) {
      ctx.font = 'bold ' + --size + 'px sans-serif';
    }
    ctx.fillText(plot.name, col * 256 + 128, row * 32 + 16);
    const g = new THREE.PlaneGeometry(2.12, 0.3);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (col + uv.getX(i)) / 4, 1 - (row + 1 - uv.getY(i)) / 4);
    }
    g.translate(plot.x + 2, 1.94, plot.y + 2 + 1.289);
    parts.push(g);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false,
  }));
  mesh.name = 'house-names';
  return mesh;
}
