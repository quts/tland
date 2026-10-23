import Phaser from 'phaser';
import {
  TILE_SIZE,
  findPath,
  nearestWalkable,
  type Emote,
  type PlayerState,
  type PlayerUpdate,
  type Point,
  type TownMap,
} from '@tland/shared';
import { DEFAULT_AVATAR, type AvatarParts } from '../gfx/avatar.js';
import { BubbleLayer } from '../world/bubbles.js';
import { RemotePlayer } from '../world/remotePlayer.js';
import { PALETTE } from '../gfx/palette.js';
import { AvatarSprite, type Direction } from '../world/avatarSprite.js';
import { DEPTH } from '../world/depths.js';
import {
  WALK_SPEED_PX,
  moveWithCollision,
  tileCenter,
  toTile,
} from '../world/movement.js';
import { buildWorld } from '../world/tilemap.js';
import type { Joystick } from '../controls/joystick.js';

/** A tap that moves less than this, and ends quickly, is a tap and not a drag. */
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 400;

export interface WorldSceneDeps {
  joystick: Joystick;
  /** Current device pixel ratio cap; the camera zooms by it. */
  getResolution(): number;
  /** True while a text field has focus, so typing does not walk the player. */
  isTyping?(): boolean;
  onZoneChange?(zone: string | null): void;
  onMove?(x: number, y: number, direction: Direction, moving: boolean): void;
  onFrame?(self: { x: number; y: number }, others: RemotePlayer[]): void;
}

export class WorldScene extends Phaser.Scene {
  static readonly KEY = 'world';

  private deps!: WorldSceneDeps;
  private map!: TownMap;
  private player!: AvatarSprite;
  private keys!: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };

  private path: Point[] = [];
  private pathIndex = 0;
  private marker: Phaser.GameObjects.Graphics | undefined;
  private markerTween: Phaser.Tweens.Tween | undefined;
  private currentZone: string | null = null;
  private pointerDownAt = { x: 0, y: 0, time: 0 };
  private avatar: AvatarParts = DEFAULT_AVATAR;
  private nickname = '';
  private readonly remotes = new Map<string, RemotePlayer>();
  private bubbles!: BubbleLayer;
  private active = false;

  constructor(deps: WorldSceneDeps) {
    super(WorldScene.KEY);
    this.deps = deps;
  }

  /** Set before the scene starts; used when the player sprite is created. */
  setIdentity(nickname: string, avatar: AvatarParts): void {
    this.nickname = nickname;
    this.avatar = avatar;
    if (this.player !== undefined) {
      this.player.setNickname(nickname);
      this.player.setAvatar(avatar);
    }
  }

  create(): void {
    const world = buildWorld(this, {
      ground: DEPTH.ground,
      props: DEPTH.props,
      buildings: DEPTH.entityBase,
      canopy: DEPTH.canopy,
    });
    this.map = world.map;

    const spawn = tileCenter(this.map.spawn.x, this.map.spawn.y);
    this.player = new AvatarSprite(
      this,
      spawn.x,
      spawn.y,
      this.avatar,
      this.nickname,
    );

    const camera = this.cameras.main;
    camera.setBackgroundColor(PALETTE.water);
    camera.setBounds(0, 0, world.widthPixels, world.heightPixels);
    camera.startFollow(this.player.sprite, true, 0.14, 0.14);
    camera.setRoundPixels(true);
    this.applyZoom();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    });

    this.bubbles = new BubbleLayer(this);
    this.setupKeyboard();
    this.setupTapToMove();
    this.emitZone(true);
  }

  /* ---------------------------------------------------------------- */
  /* Multiplayer                                                       */
  /* ---------------------------------------------------------------- */

  /** Movement is frozen until the player has actually joined the world. */
  setActive(active: boolean): void {
    this.active = active;
  }

  /** Place the local player where the server says they are. */
  placeSelf(x: number, y: number): void {
    this.player.setPosition(x, y);
    this.cameras.main.centerOn(x, y);
    this.clearPath();
    this.emitZone(true);
  }

  /** The server rejected a move; snap back rather than drift out of sync. */
  correctSelf(x: number, y: number): void {
    this.clearPath();
    this.player.setPosition(x, y);
  }

  addRemote(state: PlayerState): void {
    this.remotes.get(state.id)?.destroy();
    this.remotes.set(state.id, new RemotePlayer(this, state, this.time.now));
  }

  removeRemote(id: string): void {
    this.remotes.get(id)?.destroy();
    this.remotes.delete(id);
    this.bubbles.clear(id);
  }

  applyUpdates(updates: readonly PlayerUpdate[]): void {
    const now = this.time.now;
    for (const update of updates) {
      // A position for someone we have never seen means we missed their join;
      // ignore it and wait for the server to tell us who they are.
      this.remotes
        .get(update.id)
        ?.push(update.x, update.y, update.dir, update.moving, now);
    }
  }

  say(id: string, text: string, selfId: string | null): void {
    const anchor = id === selfId ? this.player : this.remotes.get(id);
    if (anchor === undefined) return;
    this.bubbles.say(id, text, { x: anchor.x, y: anchor.y });
  }

  playEmote(id: string, kind: Emote, selfId: string | null): void {
    const anchor = id === selfId ? this.player : this.remotes.get(id);
    if (anchor === undefined) return;
    this.bubbles.emote(id, kind, { x: anchor.x, y: anchor.y });
  }

  /** Everyone else currently drawn. */
  remotePlayers(): RemotePlayer[] {
    return [...this.remotes.values()];
  }

  currentZoneName(): string | null {
    return this.currentZone;
  }

  bubbleTexts(): string[] {
    return this.bubbles.texts();
  }

  clearEveryone(): void {
    for (const remote of this.remotes.values()) remote.destroy();
    this.remotes.clear();
  }

  getPosition(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  override update(time: number, delta: number): void {
    const seconds = Math.min(delta, 50) / 1000;
    let moved = false;

    if (this.active) {
      const input = this.readDirectionalInput();
      if (input.x !== 0 || input.y !== 0) {
        this.clearPath();
        moved = this.step(input.x, input.y, seconds);
      } else if (this.path.length > 0) {
        moved = this.followPath(seconds);
      }
    }

    this.player.setWalking(moved);
    this.player.update(delta);

    const anchors = new Map<string, { x: number; y: number }>();
    for (const remote of this.remotes.values()) {
      remote.update(time, delta);
      anchors.set(remote.id, { x: remote.x, y: remote.y });
    }
    if (this.selfId !== null) {
      anchors.set(this.selfId, { x: this.player.x, y: this.player.y });
    }
    this.bubbles.follow(anchors);

    this.emitZone(false);
    if (this.active) {
      this.deps.onMove?.(this.player.x, this.player.y, this.facingFromInput, moved);
    }
    this.deps.onFrame?.(
      { x: this.player.x, y: this.player.y },
      [...this.remotes.values()],
    );
  }

  private selfId: string | null = null;

  setSelfId(id: string): void {
    this.selfId = id;
  }

  private facingFromInput: Direction = 'down';

  /** Joystick and keyboard, combined and clamped to a unit vector. */
  private readDirectionalInput(): { x: number; y: number } {
    const joystick = this.deps.joystick.vector;
    let x = joystick.x;
    let y = joystick.y;

    if (this.keys !== undefined && this.deps.isTyping?.() !== true) {
      const pressed = (list: Phaser.Input.Keyboard.Key[]): boolean =>
        list.some((key) => key.isDown);
      if (pressed(this.keys.left)) x -= 1;
      if (pressed(this.keys.right)) x += 1;
      if (pressed(this.keys.up)) y -= 1;
      if (pressed(this.keys.down)) y += 1;
    }

    const magnitude = Math.hypot(x, y);
    if (magnitude === 0) return { x: 0, y: 0 };
    const scale = Math.min(magnitude, 1) / magnitude;
    return { x: x * scale, y: y * scale };
  }

  private step(dirX: number, dirY: number, seconds: number): boolean {
    const distance = WALK_SPEED_PX * seconds;
    const result = moveWithCollision(
      this.map,
      this.player.x,
      this.player.y,
      dirX * distance,
      dirY * distance,
    );
    const moved = result.x !== this.player.x || result.y !== this.player.y;
    if (moved) {
      this.player.setPosition(result.x, result.y);
      this.faceAlong(dirX, dirY);
    }
    return moved;
  }

  private followPath(seconds: number): boolean {
    const target = this.path[this.pathIndex];
    if (target === undefined) {
      this.clearPath();
      return false;
    }

    const center = tileCenter(target.x, target.y);
    const dx = center.x - this.player.x;
    const dy = center.y - this.player.y;
    const remaining = Math.hypot(dx, dy);

    if (remaining < 1.5) {
      this.player.setPosition(center.x, center.y);
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) this.clearPath();
      return true;
    }

    const moved = this.step(dx / remaining, dy / remaining, seconds);
    // Something appeared in the way, or the route is stale: stop rather than
    // grinding against a wall forever.
    if (!moved) this.clearPath();
    return moved;
  }

  private faceAlong(dx: number, dy: number): void {
    const direction: Direction =
      Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.facingFromInput = direction;
    this.player.setDirection(direction);
  }

  private clearPath(): void {
    this.path = [];
    this.pathIndex = 0;
    this.markerTween?.remove();
    this.markerTween = undefined;
    this.marker?.destroy();
    this.marker = undefined;
  }

  private setupKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null || keyboard === undefined) return;
    const bind = (...names: string[]): Phaser.Input.Keyboard.Key[] =>
      names.map((name) => keyboard.addKey(name, true, true));
    this.keys = {
      up: bind('W', 'UP'),
      down: bind('S', 'DOWN'),
      left: bind('A', 'LEFT'),
      right: bind('D', 'RIGHT'),
    };
    // Arrow keys would otherwise scroll the page on desktop.
    keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
  }

  private setupTapToMove(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.pointerDownAt = { x: pointer.x, y: pointer.y, time: performance.now() };
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const movedBy = Math.hypot(
        pointer.x - this.pointerDownAt.x,
        pointer.y - this.pointerDownAt.y,
      );
      const heldFor = performance.now() - this.pointerDownAt.time;
      if (movedBy > TAP_SLOP_PX || heldFor > TAP_MAX_MS) return;
      if (!this.active) return;
      this.walkTo(pointer.worldX, pointer.worldY);
    });
  }

  /** Route to a tapped world position, or to the nearest spot we can reach. */
  private walkTo(worldX: number, worldY: number): void {
    const tapped = toTile(worldX, worldY);
    const goal = nearestWalkable(
      this.map.width,
      this.map.height,
      tapped,
      this.map.isWalkable,
    );
    if (goal === null) return;

    const from = toTile(this.player.x, this.player.y);
    const route = findPath(this.map.width, this.map.height, from, goal, {
      isWalkable: this.map.isWalkable,
      maxNodes: 12_000,
    });
    if (route === null || route.length === 0) return;

    this.clearPath();
    this.path = route;
    this.pathIndex = 0;
    this.showMarker(goal);
  }

  /** A soft ring where the tap landed, so the tap is visibly acknowledged. */
  private showMarker(tile: Point): void {
    const center = tileCenter(tile.x, tile.y);
    const marker = this.add.graphics();
    marker.setPosition(center.x, center.y);
    marker.setDepth(DEPTH.props + 1);
    marker.lineStyle(3, PALETTE.wall, 0.95);
    marker.strokeCircle(0, 0, TILE_SIZE * 0.42);
    marker.lineStyle(3, PALETTE.ink, 0.35);
    marker.strokeCircle(0, 0, TILE_SIZE * 0.42 + 2);
    this.marker = marker;

    this.markerTween = this.tweens.add({
      targets: marker,
      scale: { from: 0.55, to: 1.15 },
      alpha: { from: 1, to: 0 },
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => {
        marker.destroy();
        if (this.marker === marker) this.marker = undefined;
      },
    });
  }

  private emitZone(force: boolean): void {
    const tile = toTile(this.player.x, this.player.y);
    const zone = this.map.zoneAt(tile.x, tile.y);
    if (!force && zone === this.currentZone) return;
    this.currentZone = zone;
    this.deps.onZoneChange?.(zone);
  }

  /**
   * Choose a camera zoom that keeps a sensible number of tiles on screen.
   *
   * The canvas is sized in device pixels, so the resolution cap is one factor;
   * the other scales tiles up on a big screen and down on a phone, targeting
   * roughly 14 tiles across on a handset and 30 on a desktop. Without it a
   * phone shows a keyhole and a desktop shows ants.
   */
  private applyZoom(): void {
    const cssWidth = this.scale.gameSize.width / this.deps.getResolution();
    const targetTiles = Phaser.Math.Clamp(cssWidth / 26, 13, 30);
    const fit = cssWidth / (targetTiles * TILE_SIZE);
    this.cameras.main.setZoom(this.deps.getResolution() * fit);
  }
}
