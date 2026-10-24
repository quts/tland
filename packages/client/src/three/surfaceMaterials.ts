import * as THREE from 'three';
import type { Terrain, TownMap } from '@tland/shared';
import { PALETTE } from '../gfx/palette.js';

/** One texel per logical tile; filtering never changes walkability. */
export function terrainColorTexture(map: TownMap): THREE.DataTexture {
  const data = new Uint8Array(map.width * map.height * 4);
  const color = new THREE.Color();
  const bases: Record<Terrain, number> = { grass: PALETTE.grass, park: PALETTE.lawn, path: PALETTE.path,
    sand: PALETTE.sand, water: PALETTE.sandAlt, hill: PALETTE.hill, building: PALETTE.pathEdge, bridge: PALETTE.bridge };
  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
    const terrain = map.terrainAt(x, y);
    color.setHex(bases[terrain]);
    const offset = (y * map.width + x) * 4;
    data[offset] = Math.round(color.r * 255);
    data[offset + 1] = Math.round(color.g * 255);
    data[offset + 2] = Math.round(color.b * 255);
    data[offset + 3] = terrain === 'grass' || terrain === 'park' || terrain === 'hill' ? 255 : terrain === 'bridge' ? 128 : 0;
  }
  const texture = new THREE.DataTexture(data, map.width, map.height);
  texture.name = 'terrain-palette';
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const DETAIL_FRAGMENT = `
varying vec3 surfaceWorld;
float surfaceHash(vec2 p) {
  vec3 n = fract(vec3(p.xyx) * 0.1031);
  n += dot(n, n.yzx + 33.33);
  return fract((n.x + n.y) * n.z);
}
float surfaceNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(surfaceHash(cell), surfaceHash(cell + vec2(1.0, 0.0)), f.x),
    mix(surfaceHash(cell + vec2(0.0, 1.0)), surfaceHash(cell + vec2(1.0)), f.x), f.y);
}
`;

/** Keep Lambert lighting and existing geometry; detail is anchored in world space. */
function detailMaterial(fragment: string): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 surfaceWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DETAIL_FRAGMENT)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragment);
  };
  material.customProgramCacheKey = () => fragment;
  return material;
}

/** Soft palette boundaries and tiny clover marks, without adding ground triangles. */
export function groundMaterial(map: TownMap): THREE.MeshLambertMaterial {
  const texture = terrainColorTexture(map);
  const material = detailMaterial(`
vec2 p = surfaceWorld.xz, grid = p - 0.5, base = floor(grid);
vec2 blend = smoothstep(vec2(0.38), vec2(0.62), fract(grid));
vec4 a = texture2D(terrainPalette, (base + vec2(0.5, 0.5)) / terrainSize);
vec4 b = texture2D(terrainPalette, (base + vec2(1.5, 0.5)) / terrainSize);
vec4 c = texture2D(terrainPalette, (base + vec2(0.5, 1.5)) / terrainSize);
vec4 d = texture2D(terrainPalette, (base + vec2(1.5, 1.5)) / terrainSize);

// Neighbouring wood must not bleed into grass or sand; the bridge itself stays crisp.
vec4 nearest = texture2D(terrainPalette, (floor(p) + 0.5) / terrainSize);
if (abs(a.a - 0.502) < 0.01) a.rgb = pathPigment;
if (abs(b.a - 0.502) < 0.01) b.rgb = pathPigment;
if (abs(c.a - 0.502) < 0.01) c.rgb = pathPigment;
if (abs(d.a - 0.502) < 0.01) d.rgb = pathPigment;
vec4 terrain = mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
if (abs(nearest.a - 0.502) < 0.01) terrain = nearest;

float broad = surfaceNoise(p * 0.7), grain = surfaceNoise(p * 24.0);
vec3 pigment = terrain.rgb * (0.96 + broad * 0.065 + (grain - 0.5) * 0.045);
vec2 cell = floor(p / 1.35);
float seed = surfaceHash(cell);
vec2 offset = vec2(surfaceHash(cell + 3.1), surfaceHash(cell + 7.4));
vec2 leaf = (fract(p / 1.35) - (0.25 + offset * 0.5)) * 1.35;
leaf = mat2(0.8, -0.6, 0.6, 0.8) * leaf;
float radius = 0.055 + seed * 0.025;
float clover = min(min(length(leaf - vec2(radius, 0.0)), length(leaf + vec2(radius, 0.0))),
  min(length(leaf - vec2(0.0, radius)), length(leaf + vec2(0.0, radius))));
float motif = (1.0 - smoothstep(radius * 0.72, radius, clover)) * step(0.68, seed) * smoothstep(0.85, 1.0, terrain.a);
pigment *= 1.0 - motif * 0.20;
diffuseColor.rgb *= pigment;
`);
  material.name = 'soft-terrain';
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms['terrainPalette'] = { value: texture };
    shader.uniforms['terrainSize'] = { value: new THREE.Vector2(map.width, map.height) };
    shader.uniforms['pathPigment'] = { value: new THREE.Color(PALETTE.path) };
    shader.fragmentShader = 'uniform sampler2D terrainPalette;\nuniform vec2 terrainSize;\nuniform vec3 pathPigment;\n' + shader.fragmentShader;
  };
  // This palette is a custom uniform, so release it explicitly with the material.
  material.addEventListener('dispose', () => texture.dispose());
  return material;
}


/** Distance to land, filtered on the GPU so shallow water has no tile seams. */
export function shoreDepthTexture(map: TownMap): THREE.DataTexture {
  const { width, height } = map;
  const distance = new Int16Array(width * height).fill(-1);
  const queue: number[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (map.terrainAt(x, y) !== 'water') { distance[y * width + x] = 0; queue.push(y * width + x); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!, x = index % width, y = Math.floor(index / width);
    const next = distance[index]! + 1;
    if (next > 3) continue;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || distance[ny * width + nx] !== -1) continue;
      distance[ny * width + nx] = next;
      queue.push(ny * width + nx);
    }
  }
  const data = new Uint8Array(distance.length);
  for (let i = 0; i < data.length; i += 1) data[i] = distance[i]! < 0 ? 255 : Math.min(distance[i]! / 3, 1) * 255;
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat);
  texture.name = 'shore-depth';
  texture.unpackAlignment = 1;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** One continuous water surface replaces the separate tiled shallows overlay. */
export function waterMaterial(map: TownMap): THREE.MeshLambertMaterial {
  const texture = shoreDepthTexture(map);
  const material = detailMaterial(`
vec2 p = surfaceWorld.xz;
float depth = texture2D(shoreDepth, p / shoreSize).r;
if (p.x < 0.0 || p.y < 0.0 || p.x > shoreSize.x || p.y > shoreSize.y) depth = 1.0;
float shallow = pow(1.0 - depth, 2.0) * 0.38;
diffuseColor.rgb = mix(diffuseColor.rgb, foamPigment, shallow);
float bend = surfaceNoise(p * 0.8);
float wave = sin(p.x * 7.0 + p.y * 4.0 + bend * 9.0);
float crest = smoothstep(0.93, 1.0, wave) * smoothstep(0.4, 0.65, surfaceNoise(p * 2.0));
diffuseColor.rgb *= 0.98 + surfaceNoise(p * 0.8) * 0.04;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18, crest * 0.28);
`);
  material.name = 'continuous-water';
  material.vertexColors = false;
  material.color.setHex(PALETTE.water);
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms['shoreDepth'] = { value: texture };
    shader.uniforms['shoreSize'] = { value: new THREE.Vector2(map.width, map.height) };
    shader.uniforms['foamPigment'] = { value: new THREE.Color(PALETTE.waterFoam) };
    shader.fragmentShader = 'uniform sampler2D shoreDepth;\nuniform vec2 shoreSize;\nuniform vec3 foamPigment;\n' + shader.fragmentShader;
  };
  material.addEventListener('dispose', () => texture.dispose());
  return material;
}
