import Phaser from 'phaser';
import { TILE_SIZE, type Point } from '@tland/shared';
import { BubbleLayer } from '../world/bubbles.js';
import { RemotePlayer } from '../world/remotePlayer.js';
import { PALETTE } from '../gfx/palette.js';
import { AvatarSprite } from '../world/avatarSprite.js';
import { DEPTH } from '../world/depths.js';
import { tileCenter, toTile } from '../world/movement.js';
import { buildWorld } from '../world/tilemap.js';
import type { ClientWorld } from '../world/clientWorld.js';
import type { Joystick } from '../controls/joystick.js';

/** A tap that moves less than this, and ends quickly, is a tap and not a drag. */
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 400;

export interface WorldSceneDeps {
  world: ClientWorld;
  joystick: Joystick;
  /** Current device pixel ratio cap; the camera zooms by it. */
  getResolution(): number;
  /** True while a text field has focus, so typing does not walk the player. */
  isTyping?(): boolean;
}

/**
 * The 2D view of the shared world.
 *
 * Draws what ClientWorld holds and feeds it the player's input; the game
 * itself — movement, routes, other players, bubbles, districts — lives there.
 */
export class WorldScene extends Phaser.Scene {
  static readonly KEY = 'world';

  private deps!: WorldSceneDeps;
  private player!: AvatarSprite;
  private keys!: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };

  private marker: Phaser.GameObjects.Graphics | undefined;
  private markerTween: Phaser.Tweens.Tween | undefined;
  private pointerDownAt = { x: 0, y: 0, time: 0 };
  private readonly remotes = new Map<string, RemotePlayer>();
  private bubbles!: BubbleLayer;
  private readonly input2d = { x: 0, y: 0 };

  constructor(deps: WorldSceneDeps) {
    super(WorldScene.KEY);
    this.deps = deps;
  }

  private get world(): ClientWorld {
    return this.deps.world;
  }

  create(): void {
    const built = buildWorld(this, {
      ground: DEPTH.ground,
      props: DEPTH.props,
      buildings: DEPTH.entityBase,
      canopy: DEPTH.canopy,
    });

    const self = this.world.self;
    this.player = new AvatarSprite(this, self.x, self.y, self.avatar, self.nickname);

    const camera = this.cameras.main;
    camera.setBackgroundColor(PALETTE.water);
    camera.setBounds(0, 0, built.widthPixels, built.heightPixels);
    camera.startFollow(this.player.sprite, true, 0.14, 0.14);
    camera.setRoundPixels(true);
    this.applyZoom();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);

    this.bubbles = new BubbleLayer(this);
    for (const remote of this.world.others.values()) {
      this.remotes.set(remote.id, new RemotePlayer(this, remote));
    }

    const unlisten = this.world.listen({
      identityChanged: (nickname, avatar) => {
        this.player.setNickname(nickname);
        this.player.setAvatar(avatar);
      },
      selfPlaced: (x, y) => {
        this.player.setPosition(x, y);
        this.cameras.main.centerOn(x, y);
      },
      remoteAdded: (remote) => {
        this.remotes.get(remote.id)?.destroy();
        this.remotes.set(remote.id, new RemotePlayer(this, remote));
      },
      remoteRemoved: (id) => {
        this.remotes.get(id)?.destroy();
        this.remotes.delete(id);
        this.bubbles.clear(id);
      },
      said: (id, text, at) => this.bubbles.say(id, text, at),
      emoted: (id, kind, at) => this.bubbles.emote(id, kind, at),
      routeStarted: (goal) => this.showMarker(goal),
      routeCleared: () => this.clearMarker(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      unlisten();
    });

    this.setupKeyboard();
    this.setupTapToMove();
  }

  override update(time: number, delta: number): void {
    this.world.update(time, delta, this.readDirectionalInput());

    const self = this.world.self;
    if (self.x !== this.player.x || self.y !== this.player.y) {
      this.player.setPosition(self.x, self.y);
    }
    this.player.setDirection(self.facing);
    this.player.setWalking(self.walking);
    this.player.update(delta);

    const anchors = new Map<string, { x: number; y: number }>();
    for (const remote of this.remotes.values()) {
      remote.update(delta);
      anchors.set(remote.id, { x: remote.x, y: remote.y });
    }
    const selfId = this.world.localId;
    if (selfId !== null) anchors.set(selfId, { x: this.player.x, y: this.player.y });
    this.bubbles.follow(anchors);
  }

  /** Where a tile's centre is on screen, in CSS pixels. */
  tileToScreen(tileX: number, tileY: number): { x: number; y: number } | null {
    const view = this.cameras.main.worldView;
    if (view.width === 0 || view.height === 0) return null;
    const center = tileCenter(tileX, tileY);
    const cssWidth = this.scale.gameSize.width / this.deps.getResolution();
    const cssHeight = this.scale.gameSize.height / this.deps.getResolution();
    const x = ((center.x - view.x) / view.width) * cssWidth;
    const y = ((center.y - view.y) / view.height) * cssHeight;
    if (x < 0 || y < 0 || x > cssWidth || y > cssHeight) return null;
    return { x, y };
  }

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

    // The 2D camera is axis-aligned: screen axes are world axes.
    const magnitude = Math.hypot(x, y);
    if (magnitude === 0) {
      this.input2d.x = 0;
      this.input2d.y = 0;
    } else {
      const scale = Math.min(magnitude, 1) / magnitude;
      this.input2d.x = x * scale;
      this.input2d.y = y * scale;
    }
    return this.input2d;
  }

  private clearMarker(): void {
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
      this.world.walkToTile(toTile(pointer.worldX, pointer.worldY));
    });
  }

  /** A soft ring where the tap landed, so the tap is visibly acknowledged. */
  private showMarker(tile: Point): void {
    this.clearMarker();
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
