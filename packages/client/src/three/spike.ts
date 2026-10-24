import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE_SIZE, getTownMap, type TownMap } from '@tland/shared';
import { PALETTE } from '../gfx/palette.js';
import { BODY_COLORS, DEFAULT_AVATAR, SHIRT_COLORS } from '../gfx/avatar.js';
import { WALK_SPEED_PX, moveWithCollision, tileCenter, toTile } from '../world/movement.js';
import { resolutionCap } from '../viewport.js';
import type { Joystick } from '../controls/joystick.js';
import type { Hud } from '../ui/hud.js';
import { buildGround, cornerHeights, WATER_LEVEL } from './ground.js';
import { buildProps } from './props.js';
import {
  CAMERA_FOV_DEG,
  cameraDistance,
  cameraOffset,
  joystickToWorld,
  tilesAcross,
  type Vec2,
  type Vec3,
} from './cameraRig.js';
import { DebugHud } from './debugHud.js';
import { ViewPrompt } from './viewPrompt.js';

/**
 * M0 spike: the whole island in 3D, one local player, no server.
 *
 * Its only job is to answer whether a three.js view of this map holds frame
 * rate on a phone before the client is restructured around it. The pieces
 * meant to outlive it — ground, props, camera arithmetic, the debug readout —
 * live in their own modules.
 */

/** Below this for LOW_FPS_SECONDS in a row, offer the 2D view. */
const LOW_FPS = 30;
const LOW_FPS_SECONDS = 5;
/** Ignore the first moments: shader compilation makes them slow on every device. */
const WARMUP_MS = 3000;
/** How quickly the camera catches up with the player, per second. */
const FOLLOW_RATE = 8;
const TURN_RATE = 14;

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL is not available', { cause });
    this.name = 'WebGLUnavailableError';
  }
}

export interface SpikeOptions {
  /** The element the canvas goes into. */
  readonly parent: HTMLElement;
  /** Where overlays (prompts, the debug readout) are attached. */
  readonly overlay: HTMLElement;
  readonly joystick: Joystick;
  readonly hud: Hud;
  readonly debug: boolean;
  /** Leave the 3D view for the 2D one. */
  switchTo2D(): void;
}

export interface SpikeHandle {
  dispose(): void;
}

declare global {
  interface Window {
    /** Read-only, for the end-to-end test. Mirrors window.__town in spirit. */
    __town3d?: {
      ready(): boolean;
      position(): { x: number; y: number };
      zone(): string | null;
      calls(): number;
      triangles(): number;
    };
  }
}

function blobTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A stand-in avatar until M2 builds the real ones: body, head, two eyes. */
function placeholderAvatar(material: THREE.Material): THREE.Mesh {
  const color = new THREE.Color();
  const paint = (geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const flat = geometry.toNonIndexed();
    flat.deleteAttribute('uv');
    color.setHex(hex);
    const count = flat.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) colors.set([color.r, color.g, color.b], i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.dispose();
    return flat;
  };
  const parts = [
    paint(new THREE.CapsuleGeometry(0.2, 0.2, 4, 10).translate(0, 0.32, 0), SHIRT_COLORS[DEFAULT_AVATAR.shirt] ?? PALETTE.roofCool),
    paint(new THREE.SphereGeometry(0.25, 14, 10).translate(0, 0.78, 0), BODY_COLORS[DEFAULT_AVATAR.body] ?? PALETTE.sand),
    paint(new THREE.SphereGeometry(0.035, 6, 4).translate(-0.085, 0.8, 0.225), PALETTE.ink),
    paint(new THREE.SphereGeometry(0.035, 6, 4).translate(0.085, 0.8, 0.225), PALETTE.ink),
  ];
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (geometry === null) throw new Error('could not build the avatar');
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'player';
  return mesh;
}

/** Dispose everything a scene holds on the GPU, each resource once. */
function disposeScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) materials.add(material);
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    material.dispose();
  }
}

/**
 * Where the player stands at first: the map's spawn, or with `?debug=1`, any
 * walkable tile named by `&at=x,y` — so the heaviest views can be measured
 * on a phone without walking there.
 */
function startTile(map: TownMap, debug: boolean): { x: number; y: number } {
  const at = debug ? new URLSearchParams(location.search).get('at') : null;
  const [x, y] = (at ?? '').split(',').map(Number);
  if (x !== undefined && y !== undefined && map.isWalkable(x, y)) return tileCenter(x, y);
  return tileCenter(map.spawn.x, map.spawn.y);
}

export function startSpike(options: SpikeOptions): SpikeHandle {
  const { parent, overlay, joystick, hud } = options;
  const map = getTownMap();

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    throw new WebGLUnavailableError(error);
  }
  renderer.setPixelRatio(resolutionCap());
  renderer.setSize(Math.max(1, parent.clientWidth), Math.max(1, parent.clientHeight));
  parent.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.water);

  // Sky and bounce light do most of the work; the sun only gives the faces
  // a direction. No shadow maps: contact shadows are baked or blobs.
  scene.add(new THREE.HemisphereLight(0xeef8ff, 0xb7cfa4, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2df, 1.6);
  sun.position.set(-0.6, 1, 0.45);
  scene.add(sun);

  const surface = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  surface.name = 'surface';

  const heights = cornerHeights(map);
  const ground = buildGround(map, heights, surface);
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width + 400, map.height + 400).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.name = 'water';
  water.position.set(map.width / 2, WATER_LEVEL, map.height / 2);
  water.updateMatrix();
  water.matrixAutoUpdate = false;
  scene.add(water);

  const shadowGeometry = new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    color: PALETTE.shadow,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const props = buildProps(map, heights, surface, shadowGeometry, shadowMaterial);
  scene.add(props.group, props.shadows);

  const player = new THREE.Group();
  const avatar = placeholderAvatar(surface);
  const playerShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  playerShadow.scale.set(1, 1, 0.8);
  player.add(avatar, playerShadow);
  scene.add(player);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.5, 400);
  const offset: Vec3 = { x: 0, y: 0, z: 0 };
  const target = new THREE.Vector3();

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  const start = startTile(map, options.debug);
  let px = start.x;
  let py = start.y;
  let heading = 0;
  let walkPhase = 0;
  let zone: string | null = null;
  let lastTime = 0;
  let paused = false;
  let disposed = false;
  const direction: Vec2 = { x: 0, y: 0 };
  const keys = { up: false, down: false, left: false, right: false };

  player.position.set(px / TILE_SIZE, 0, py / TILE_SIZE);
  target.copy(player.position);

  const emitZone = (): void => {
    const tile = toTile(px, py);
    const next = map.zoneAt(tile.x, tile.y);
    if (next === zone) return;
    zone = next;
    hud.showZone(zone);
  };
  emitZone();

  /* ---------------------------------------------------------------- */
  /* Sizing                                                            */
  /* ---------------------------------------------------------------- */

  const resize = (): void => {
    const width = Math.max(1, Math.round(parent.clientWidth));
    const height = Math.max(1, Math.round(parent.clientHeight));
    renderer.setPixelRatio(resolutionCap());
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    cameraOffset(cameraDistance(tilesAcross(width), camera.aspect), offset);
    // The orientation never changes; only the position follows the player.
    camera.position.set(offset.x, offset.y, offset.z);
    camera.lookAt(0, 0, 0);
  };
  resize();

  // Safari reports stale sizes mid-rotation; measure once, on the next frame.
  let resizeFrame = 0;
  const scheduleResize = (): void => {
    if (resizeFrame !== 0) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  };
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                          */
  /* ---------------------------------------------------------------- */

  const KEYMAP: Record<string, keyof typeof keys> = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };
  const onKey = (event: KeyboardEvent): void => {
    const key = KEYMAP[event.code];
    if (key === undefined) return;
    if (event.target instanceof HTMLInputElement) return;
    keys[key] = event.type === 'keydown';
    // Arrow keys would otherwise scroll the page on desktop.
    event.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const releaseKeys = (): void => {
    keys.up = keys.down = keys.left = keys.right = false;
  };
  window.addEventListener('blur', releaseKeys);

  /* ---------------------------------------------------------------- */
  /* Prompts, debug, frame-rate watchdog                               */
  /* ---------------------------------------------------------------- */

  const prompt = new ViewPrompt(overlay);
  let loseContext: WEBGL_lose_context | null = null;
  const debugHud = options.debug
    ? new DebugHud(overlay, [
        {
          label: '模擬失去畫面',
          run: () => {
            loseContext = renderer.getContext().getExtension('WEBGL_lose_context');
            loseContext?.loseContext();
            window.setTimeout(() => loseContext?.restoreContext(), 2000);
          },
        },
      ])
    : null;

  let watchSince = 0;
  let watchFrames = 0;
  let lowSeconds = 0;
  let askedAboutFps = false;
  const startedAt = performance.now();

  const watchFrameRate = (now: number): void => {
    if (askedAboutFps || now - startedAt < WARMUP_MS) return;
    if (watchSince === 0) watchSince = now;
    watchFrames += 1;
    if (now - watchSince < 1000) return;
    const fps = (watchFrames * 1000) / (now - watchSince);
    watchSince = now;
    watchFrames = 0;
    lowSeconds = fps < LOW_FPS ? lowSeconds + 1 : 0;
    if (lowSeconds < LOW_FPS_SECONDS) return;
    askedAboutFps = true;
    prompt.show(`3D 畫面在這台裝置上跑得有點吃力（約 ${Math.round(fps)} fps）。要改用 2D 畫面嗎？`, [
      { label: '改用 2D', primary: true, run: options.switchTo2D },
      { label: '繼續用 3D', run: () => undefined },
    ]);
  };

  // A hidden tab stops drawing; its first frame back is not a slow frame.
  const onVisibility = (): void => {
    lastTime = 0;
    watchSince = 0;
    watchFrames = 0;
    lowSeconds = 0;
    if (document.hidden) releaseKeys();
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  const frame = (time: number): void => {
    if (paused) return;
    const cpuStart = performance.now();
    const deltaMs = lastTime === 0 ? 16.7 : time - lastTime;
    lastTime = time;
    const seconds = Math.min(deltaMs, 50) / 1000;

    let sx = joystick.vector.x + (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let sy = joystick.vector.y + (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    const magnitude = Math.hypot(sx, sy);
    let moving = false;
    if (magnitude > 0) {
      const clamp = Math.min(magnitude, 1) / magnitude;
      sx *= clamp;
      sy *= clamp;
      joystickToWorld(sx, sy, direction);
      const distance = WALK_SPEED_PX * seconds;
      const result = moveWithCollision(map, px, py, direction.x * distance, direction.y * distance);
      moving = result.x !== px || result.y !== py;
      px = result.x;
      py = result.y;
      const want = Math.atan2(direction.x, direction.y);
      let turn = want - heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      heading += turn * Math.min(1, seconds * TURN_RATE);
    }

    walkPhase = moving ? walkPhase + seconds * 14 : 0;
    player.position.set(px / TILE_SIZE, 0, py / TILE_SIZE);
    avatar.rotation.y = heading;
    avatar.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.06 : 0;

    const follow = 1 - Math.exp(-seconds * FOLLOW_RATE);
    target.x += (player.position.x - target.x) * follow;
    target.z += (player.position.z - target.z) * follow;
    camera.position.set(target.x + offset.x, offset.y, target.z + offset.z);

    if (moving) emitZone();
    renderer.render(scene, camera);

    const now = performance.now();
    debugHud?.sample(now, { deltaMs, cpuMs: now - cpuStart }, renderer);
    if (!document.hidden) watchFrameRate(now);
  };
  renderer.setAnimationLoop(frame);

  /* ---------------------------------------------------------------- */
  /* Losing the GPU                                                    */
  /* ---------------------------------------------------------------- */

  let restoreTimer = 0;
  const onContextLost = (event: Event): void => {
    // Tell the browser we will handle restoration ourselves.
    event.preventDefault();
    paused = true;
    prompt.show('畫面暫時中斷了，正在恢復…');
    restoreTimer = window.setTimeout(() => {
      prompt.show('畫面沒辦法自動恢復。', [
        { label: '重新載入', primary: true, run: () => location.reload() },
        { label: '改用 2D', run: options.switchTo2D },
      ]);
    }, 5000);
  };
  const onContextRestored = (): void => {
    window.clearTimeout(restoreTimer);
    paused = false;
    lastTime = 0;
    prompt.hide();
    // three.js rebuilds its GL state on restore; geometry and textures are
    // re-uploaded from the copies it still holds. The loop needs a nudge.
    renderer.setAnimationLoop(frame);
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  window.__town3d = {
    ready: () => !disposed,
    position: () => ({ x: px, y: py }),
    zone: () => zone,
    calls: () => renderer.info.render.calls,
    triangles: () => renderer.info.render.triangles,
  };

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      window.clearTimeout(restoreTimer);
      if (resizeFrame !== 0) cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', scheduleResize);
      window.removeEventListener('orientationchange', scheduleResize);
      window.visualViewport?.removeEventListener('resize', scheduleResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', releaseKeys);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      prompt.hide();
      debugHud?.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
      delete window.__town3d;
    },
  };
}
