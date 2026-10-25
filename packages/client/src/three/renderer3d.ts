import * as THREE from 'three';
import { TILE_SIZE, type Point } from '@tland/shared';
import { PALETTE } from '../gfx/palette.js';
import type { AvatarParts } from '../gfx/avatar.js';
import { resolutionCap } from '../viewport.js';
import type { AvatarImage, Renderer, RendererContext, RendererStats } from '../render/renderer.js';
import type { RemoteMotion } from '../world/remoteMotion.js';
import { buildGround, cornerHeights, heightSampler, maxHeight, WATER_LEVEL } from './ground.js';
import { buildProps } from './props.js';
import { CharacterLayer } from './characters.js';
import { AVATAR_TOP } from './avatar3d.js';
import { WorldOverlay } from './overlay.js';
import {
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CAMERA_NEAR,
  CAMERA_TAG_HEADROOM,
  cameraBasis,
  cameraOffset,
  cssToNdc,
  joystickToWorld,
  ndcToCss,
  viewportFrame,
  screenToTerrain,
  worldToScreen,
  type CameraBasis,
  type Vec2,
  type Vec3,
} from './cameraRig.js';
import { DebugHud } from './debugHud.js';
import { groundMaterial, waterMaterial } from './surfaceMaterials.js';
import { ViewPrompt } from './viewPrompt.js';
import { addTownLights, townMaterial } from './lighting.js';

/** Below this for LOW_FPS_SECONDS in a row, offer the 2D view. */
const LOW_FPS = 30;
const LOW_FPS_SECONDS = 5;
/** Ignore the first moments: shader compilation makes them slow on every device. */
const WARMUP_MS = 3000;
/** How quickly the camera catches up with the player, per second. */
const FOLLOW_RATE = 8;
/** A tap that moves less than this, and ends quickly, is a tap and not a drag. */
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 400;
const MARKER_MS = 650;
/** The local player's key in the character and overlay layers. */
const SELF = '#self';
/** The join-screen preview, in device pixels; the canvas is half this in CSS. */
const PREVIEW_WIDTH = 288;
const PREVIEW_HEIGHT = 368;

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

/** Dispose everything a scene holds on the GPU, each resource once. */
function disposeScene(scene: THREE.Object3D): void {
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
 * The 3D view of the shared world: a soft low-poly diorama under a fixed,
 * angled camera.
 *
 * It draws exactly what ClientWorld holds, on exactly the same grid; nothing
 * about movement, routing or who can hear whom is decided here. The camera
 * never rotates, so up on the joystick is always up on the screen.
 */
export class Renderer3D implements Renderer {
  readonly kind = '3d' as const;
  readonly ready: Promise<void>;

  private readonly context: RendererContext;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
  private readonly characters: CharacterLayer;
  private readonly overlay: WorldOverlay;
  private readonly prompt: ViewPrompt;
  private readonly debugHud: DebugHud | null;
  private readonly marker: THREE.Mesh;
  private readonly surface: THREE.MeshPhongMaterial;
  private readonly characterMaterial: THREE.MeshPhongMaterial;
  private readonly unlisten: () => void;

  // Camera state, reused every frame.
  private readonly offset: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly target = new THREE.Vector3();
  private readonly cameraPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly view: { position: Vec3; basis: CameraBasis; halfWidth: number; halfHeight: number; near: number };
  /** Terrain height under a point, and its peak, for picking taps on hills. */
  private heightAt: (x: number, z: number) => number = () => 0;
  private peak = 0;
  private width = 1;
  private height = 1;

  // Input.
  private readonly keys = { up: false, down: false, left: false, right: false };
  private readonly worldInput: Vec2 = { x: 0, y: 0 };
  private pointerDown = { x: 0, y: 0, time: 0, id: -1 };

  // Frame bookkeeping.
  private lastTime = 0;
  private frameSeconds = 0;
  private paused = false;
  private disposed = false;
  private markerStartedAt = -1;
  private resizeFrame = 0;
  private restoreTimer = 0;
  private watchSince = 0;
  private watchFrames = 0;
  private lowSeconds = 0;
  private askedAboutFps = false;
  private readonly startedAt = performance.now();
  private loseContext: WEBGL_lose_context | null = null;

  // Preview.
  private previewTarget: THREE.WebGLRenderTarget | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewPixels: Uint8Array | null = null;

  constructor(context: RendererContext) {
    this.context = context;
    const { parent, world } = context;

    // First, and before touching the page: if this throws, there is no
    // WebGL and the caller falls back to 2D with the page as it was.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(resolutionCap());
    this.renderer.setSize(Math.max(1, parent.clientWidth), Math.max(1, parent.clientHeight));
    parent.append(this.renderer.domElement);
    try {
      this.view = {
        position: this.cameraPosition,
        basis: cameraBasis(),
        halfWidth: 1,
        halfHeight: 1,
        near: CAMERA_NEAR,
      };

      /* -------------------------------------------------------------- */
      /* The world                                                       */
      /* -------------------------------------------------------------- */

      const map = world.map;
      this.scene.background = new THREE.Color(PALETTE.water);
      // A light haze towards the top of the screen, where the view runs far.
      this.scene.fog = new THREE.Fog(PALETTE.water, CAMERA_DISTANCE + 12, CAMERA_DISTANCE + 70);
      // Shared warm sun, soft sky bounce and a restrained front fill.
      addTownLights(this.scene);

      this.surface = townMaterial();
      this.surface.name = 'surface';
      // Characters are round; smooth shading keeps them soft.
      this.characterMaterial = townMaterial(true);
      this.characterMaterial.name = 'characters';

      const heights = cornerHeights(map);
      this.heightAt = heightSampler(map, heights);
      this.peak = maxHeight(heights);
      this.scene.add(buildGround(map, heights, groundMaterial(map)));

      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(map.width + 400, map.height + 400).rotateX(-Math.PI / 2),
        waterMaterial(map),
      );
      water.name = 'water';
      water.position.set(map.width / 2, WATER_LEVEL, map.height / 2);
      water.updateMatrix();
      water.matrixAutoUpdate = false;
      this.scene.add(water);

      const shadowGeometry = new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: blobTexture(),
        color: PALETTE.shadow,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      const props = buildProps(map, heights, this.surface, shadowGeometry, shadowMaterial);
      this.scene.add(props.group, props.shadows);

      this.characters = new CharacterLayer(shadowGeometry, shadowMaterial);
      this.scene.add(this.characters.group);

      this.marker = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.42, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: PALETTE.wall, transparent: true, depthWrite: false }),
      );
      this.marker.name = 'tap-marker';
      this.marker.visible = false;
      this.scene.add(this.marker);

      /* -------------------------------------------------------------- */
      /* Overlays                                                        */
      /* -------------------------------------------------------------- */

      this.overlay = new WorldOverlay(parent);
      this.prompt = new ViewPrompt(context.overlay);
      this.debugHud = context.debug
        ? new DebugHud(context.overlay, [{ label: '模擬失去畫面', run: () => this.simulateContextLoss() }])
        : null;

      /* -------------------------------------------------------------- */
      /* Following the world                                             */
      /* -------------------------------------------------------------- */

      const self = world.self;
      this.characters.add(SELF, self.avatar, self.x, self.y, self.facing);
      this.overlay.add(SELF, self.nickname);
      this.target.set(self.x / TILE_SIZE, 0, self.y / TILE_SIZE);
      for (const remote of world.others.values()) this.addRemote(remote);

      this.unlisten = world.listen({
        identityChanged: (nickname, avatar) => {
          this.characters.setAvatar(SELF, avatar);
          this.overlay.setNickname(SELF, nickname);
        },
        selfPlaced: (x, y) => {
          this.target.set(x / TILE_SIZE, 0, y / TILE_SIZE);
        },
        remoteAdded: (remote) => this.addRemote(remote),
        remoteRemoved: (id) => {
          this.characters.remove(id);
          this.overlay.remove(id);
        },
        said: (id, text) => this.overlay.say(this.keyFor(id), text),
        emoted: (id, kind) => this.overlay.emote(this.keyFor(id), kind),
        routeStarted: (goal) => this.showMarker(goal),
        routeCleared: () => {
          this.marker.visible = false;
          this.markerStartedAt = -1;
        },
      });

      /* -------------------------------------------------------------- */
      /* Events                                                          */
      /* -------------------------------------------------------------- */

      this.resize();
      window.addEventListener('resize', this.scheduleResize);
      window.addEventListener('orientationchange', this.scheduleResize);
      window.visualViewport?.addEventListener('resize', this.scheduleResize);
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKey);
      window.addEventListener('blur', this.releaseKeys);
      document.addEventListener('visibilitychange', this.onVisibility);
      const canvas = this.renderer.domElement;
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointerup', this.onPointerUp);
      canvas.addEventListener('webglcontextlost', this.onContextLost);
      canvas.addEventListener('webglcontextrestored', this.onContextRestored);

      this.renderer.setAnimationLoop(this.frame);
    } catch (error) {
      // Leave the page as we found it, so the 2D fallback starts clean.
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      this.renderer.domElement.remove();
      document.querySelector('.world-overlay')?.remove();
      throw error;
    }
    this.ready = Promise.resolve();
  }

  /* ---------------------------------------------------------------- */
  /* Renderer                                                          */
  /* ---------------------------------------------------------------- */

  renderAvatarPreview(parts: AvatarParts): AvatarImage | null {
    if (this.disposed || this.renderer.getContext().isContextLost()) return null;
    if (this.previewTarget === null) {
      this.previewTarget = new THREE.WebGLRenderTarget(PREVIEW_WIDTH, PREVIEW_HEIGHT, { samples: 4 });
      this.previewTarget.texture.colorSpace = THREE.SRGBColorSpace;
      this.previewCanvas = document.createElement('canvas');
      this.previewCanvas.width = PREVIEW_WIDTH;
      this.previewCanvas.height = PREVIEW_HEIGHT;
      this.previewPixels = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4);
    }
    const canvas = this.previewCanvas as HTMLCanvasElement;
    const pixels = this.previewPixels as Uint8Array;

    const stage = new THREE.Scene();
    addTownLights(stage);
    const avatar = this.characters.previewMesh(parts);
    // A three-quarter turn reads as a figure rather than a badge.
    avatar.rotation.y = -0.4;
    stage.add(avatar);
    const camera = new THREE.PerspectiveCamera(22, PREVIEW_WIDTH / PREVIEW_HEIGHT, 0.1, 20);
    camera.position.set(0, 1.05, 3.7);
    camera.lookAt(0, 0.63, 0);

    const previousClear = this.renderer.getClearAlpha();
    this.renderer.setClearAlpha(0);
    this.renderer.setRenderTarget(this.previewTarget);
    this.renderer.clear();
    this.renderer.render(stage, camera);
    this.renderer.readRenderTargetPixels(this.previewTarget, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT, pixels);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearAlpha(previousClear);

    // WebGL rows run bottom-up, and soft edges come back premultiplied.
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    const image = ctx.createImageData(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const rowBytes = PREVIEW_WIDTH * 4;
    for (let y = 0; y < PREVIEW_HEIGHT; y += 1) {
      const from = (PREVIEW_HEIGHT - 1 - y) * rowBytes;
      const to = y * rowBytes;
      for (let i = 0; i < rowBytes; i += 4) {
        const a = pixels[from + i + 3] as number;
        const k = a > 0 && a < 255 ? 255 / a : 1;
        image.data[to + i] = Math.min(255, (pixels[from + i] as number) * k);
        image.data[to + i + 1] = Math.min(255, (pixels[from + i + 1] as number) * k);
        image.data[to + i + 2] = Math.min(255, (pixels[from + i + 2] as number) * k);
        image.data[to + i + 3] = a;
      }
    }
    ctx.putImageData(image, 0, 0);
    return { source: canvas, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  tileToScreen(tileX: number, tileY: number): { x: number; y: number } | null {
    const out: Vec2 = { x: 0, y: 0 };
    if (!worldToScreen({ x: tileX + 0.5, y: 0, z: tileY + 0.5 }, this.view, out)) return null;
    ndcToCss(out.x, out.y, this.width, this.height, out);
    if (out.x < 0 || out.y < 0 || out.x > this.width || out.y > this.height) return null;
    return out;
  }

  stats(): RendererStats {
    const info = this.renderer.info.render;
    return { fps: this.debugHud?.currentFps ?? 0, drawCalls: info.calls, triangles: info.triangles };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.unlisten();
    window.clearTimeout(this.restoreTimer);
    if (this.resizeFrame !== 0) cancelAnimationFrame(this.resizeFrame);
    window.removeEventListener('resize', this.scheduleResize);
    window.removeEventListener('orientationchange', this.scheduleResize);
    window.visualViewport?.removeEventListener('resize', this.scheduleResize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.releaseKeys);
    document.removeEventListener('visibilitychange', this.onVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.prompt.hide();
    this.debugHud?.dispose();
    this.overlay.dispose();
    this.characters.dispose();
    disposeScene(this.scene);
    this.previewTarget?.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Players                                                           */
  /* ---------------------------------------------------------------- */

  private keyFor(id: string): string {
    return id === this.context.world.localId ? SELF : id;
  }

  private addRemote(remote: RemoteMotion): void {
    this.characters.add(remote.id, remote.avatar, remote.x, remote.y, remote.dir);
    this.overlay.add(remote.id, remote.nick);
  }

  private showMarker(goal: Point): void {
    this.marker.position.set(goal.x + 0.5, 0.02, goal.y + 0.5);
    this.marker.visible = true;
    this.markerStartedAt = performance.now();
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private readonly frame = (time: number): void => {
    if (this.paused) return;
    const cpuStart = performance.now();
    const deltaMs = this.lastTime === 0 ? 16.7 : time - this.lastTime;
    this.lastTime = time;
    const seconds = Math.min(deltaMs, 50) / 1000;
    const world = this.context.world;

    this.readInput();
    world.update(time, deltaMs, this.worldInput);

    const self = world.self;
    this.frameSeconds = seconds;
    this.characters.place(SELF, self.x, self.y, self.facing, self.walking, seconds);
    world.others.forEach(this.placeRemote);
    this.characters.sync();

    const follow = 1 - Math.exp(-seconds * FOLLOW_RATE);
    this.target.x += (self.x / TILE_SIZE - this.target.x) * follow;
    this.target.z += (self.y / TILE_SIZE - this.target.z) * follow;
    this.cameraPosition.x = this.target.x + this.offset.x;
    this.cameraPosition.y = this.offset.y;
    this.cameraPosition.z = this.target.z + this.offset.z;
    this.camera.position.set(this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z);

    this.animateMarker(cpuStart);

    // Tags float over each head, wherever the head is this frame.
    this.placeTag(SELF);
    world.others.forEach(this.placeRemoteTag);

    this.renderer.render(this.scene, this.camera);

    const now = performance.now();
    this.debugHud?.sample(now, { deltaMs, cpuMs: now - cpuStart }, this.renderer);
    if (!document.hidden) this.watchFrameRate(now);
  };

  // Bound once, so the per-frame loops allocate nothing.
  private readonly placeRemote = (remote: RemoteMotion): void => {
    this.characters.place(remote.id, remote.x, remote.y, remote.dir, remote.walking, this.frameSeconds);
  };

  private readonly placeRemoteTag = (_remote: RemoteMotion, id: string): void => {
    this.placeTag(id);
  };

  private placeTag(id: string): void {
    const at = this.characters.positionOf(id);
    if (at === undefined) return;
    this.overlay.place(id, at.x, AVATAR_TOP + CAMERA_TAG_HEADROOM, at.z, this.view, this.width, this.height);
  }

  private animateMarker(now: number): void {
    if (this.markerStartedAt < 0) return;
    const t = (now - this.markerStartedAt) / MARKER_MS;
    if (t >= 1) {
      this.marker.visible = false;
      this.markerStartedAt = -1;
      return;
    }
    const eased = 1 - (1 - t) * (1 - t);
    const s = 0.55 + 0.6 * eased;
    this.marker.scale.set(s, 1, s);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 1 - eased;
  }

  /** Joystick and keyboard, combined, clamped, and turned into world axes. */
  private readInput(): void {
    let sx = this.context.joystick.vector.x;
    let sy = this.context.joystick.vector.y;
    if (!this.context.isTyping()) {
      sx += (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      sy += (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
    }
    const magnitude = Math.hypot(sx, sy);
    if (magnitude === 0) {
      this.worldInput.x = 0;
      this.worldInput.y = 0;
      return;
    }
    const clamp = Math.min(magnitude, 1) / magnitude;
    joystickToWorld(sx * clamp, sy * clamp, this.worldInput);
  }

  private watchFrameRate(now: number): void {
    if (this.askedAboutFps || now - this.startedAt < WARMUP_MS) return;
    if (this.watchSince === 0) this.watchSince = now;
    this.watchFrames += 1;
    if (now - this.watchSince < 1000) return;
    const fps = (this.watchFrames * 1000) / (now - this.watchSince);
    this.watchSince = now;
    this.watchFrames = 0;
    this.lowSeconds = fps < LOW_FPS ? this.lowSeconds + 1 : 0;
    if (this.lowSeconds < LOW_FPS_SECONDS) return;
    this.askedAboutFps = true;
    this.prompt.show(`3D 畫面在這台裝置上跑得有點吃力（約 ${Math.round(fps)} fps）。要改用 2D 畫面嗎？`, [
      { label: '改用 2D', primary: true, run: () => this.context.switchTo2D() },
      { label: '繼續用 3D', run: () => undefined },
    ]);
  }

  /* ---------------------------------------------------------------- */
  /* Sizing                                                            */
  /* ---------------------------------------------------------------- */

  private resize(): void {
    const parent = this.context.parent;
    this.width = Math.max(1, Math.round(parent.clientWidth));
    this.height = Math.max(1, Math.round(parent.clientHeight));
    this.renderer.setPixelRatio(resolutionCap());
    this.renderer.setSize(this.width, this.height);
    // Orthographic: the frame, not a distance, decides how much town is in view.
    viewportFrame(this.width, this.height, this.view);
    this.camera.left = -this.view.halfWidth;
    this.camera.right = this.view.halfWidth;
    this.camera.top = this.view.halfHeight;
    this.camera.bottom = -this.view.halfHeight;
    this.camera.updateProjectionMatrix();
    cameraOffset(CAMERA_DISTANCE, this.offset);
    // The orientation never changes; only the position follows the player.
    this.camera.position.set(this.offset.x, this.offset.y, this.offset.z);
    this.camera.lookAt(0, 0, 0);
  }

  /** Safari reports stale sizes mid-rotation; measure once, on the next frame. */
  private readonly scheduleResize = (): void => {
    if (this.resizeFrame !== 0) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
    });
  };

  /* ---------------------------------------------------------------- */
  /* Input events                                                      */
  /* ---------------------------------------------------------------- */

  private readonly onKey = (event: KeyboardEvent): void => {
    const key = KEYMAP[event.code];
    if (key === undefined) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    this.keys[key] = event.type === 'keydown';
    // Arrow keys would otherwise scroll the page on desktop.
    event.preventDefault();
  };

  private readonly releaseKeys = (): void => {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerDown.id) return;
    const movedBy = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
    const heldFor = performance.now() - this.pointerDown.time;
    if (movedBy > TAP_SLOP_PX || heldFor > TAP_MAX_MS) return;
    const tile = this.pickTile(event.clientX, event.clientY);
    if (tile !== null) this.context.world.walkToTile(tile);
  };

  /** The tile under a point on screen, by casting onto the terrain, hills included. */
  private pickTile(clientX: number, clientY: number): Point | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = cssToNdc(clientX - rect.left, clientY - rect.top, rect.width, rect.height, { x: 0, y: 0 });
    const hit: Vec3 = { x: 0, y: 0, z: 0 };
    if (!screenToTerrain(ndc.x, ndc.y, this.view, this.heightAt, this.peak, hit)) return null;
    return { x: Math.floor(hit.x), y: Math.floor(hit.z) };
  }

  /* ---------------------------------------------------------------- */
  /* Visibility and the GPU                                            */
  /* ---------------------------------------------------------------- */

  /** A hidden tab stops drawing; its first frame back is not a slow frame. */
  private readonly onVisibility = (): void => {
    this.lastTime = 0;
    this.watchSince = 0;
    this.watchFrames = 0;
    this.lowSeconds = 0;
    if (document.hidden) this.releaseKeys();
  };

  private simulateContextLoss(): void {
    this.loseContext = this.renderer.getContext().getExtension('WEBGL_lose_context');
    this.loseContext?.loseContext();
    window.setTimeout(() => this.loseContext?.restoreContext(), 2000);
  }

  private readonly onContextLost = (event: Event): void => {
    // Tell the browser we will handle restoration ourselves.
    event.preventDefault();
    this.paused = true;
    this.prompt.show('畫面暫時中斷了，正在恢復…');
    this.restoreTimer = window.setTimeout(() => {
      this.prompt.show('畫面沒辦法自動恢復。', [
        { label: '重新載入', primary: true, run: () => location.reload() },
        { label: '改用 2D', run: () => this.context.switchTo2D() },
      ]);
    }, 5000);
  };

  private readonly onContextRestored = (): void => {
    window.clearTimeout(this.restoreTimer);
    this.paused = false;
    this.lastTime = 0;
    this.prompt.hide();
    // three.js rebuilds its GL state on restore and re-uploads geometry and
    // textures from the copies it still holds. The loop needs a nudge.
    this.renderer.setAnimationLoop(this.frame);
  };
}

const KEYMAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};
