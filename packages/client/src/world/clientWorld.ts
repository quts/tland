import {
  BUBBLE_TTL_MS,
  findPath,
  nearestWalkable,
  type Direction,
  type Emote,
  type PlayerState,
  type PlayerUpdate,
  type Point,
  type TownMap,
} from '@tland/shared';
import { DEFAULT_AVATAR, type AvatarParts } from '../gfx/avatar.js';
import { WALK_SPEED_PX, moveWithCollision, tileCenter, toTile } from './movement.js';
import { RemoteMotion } from './remoteMotion.js';

/** The local player, as every renderer sees it. */
export interface SelfState {
  x: number;
  y: number;
  facing: Direction;
  walking: boolean;
  nickname: string;
  avatar: AvatarParts;
}

/**
 * What a renderer needs to hear about that it cannot simply read each frame:
 * things appearing, disappearing, and one-off moments.
 */
export interface WorldListener {
  identityChanged?(nickname: string, avatar: AvatarParts): void;
  /** The local player jumped rather than walked; a camera should snap. */
  selfPlaced?(x: number, y: number): void;
  remoteAdded?(remote: RemoteMotion): void;
  remoteRemoved?(id: string): void;
  said?(id: string, text: string, at: { x: number; y: number }): void;
  emoted?(id: string, kind: Emote, at: { x: number; y: number }): void;
  routeStarted?(goal: Point): void;
  routeCleared?(): void;
}

export interface ClientWorldDeps {
  readonly map: TownMap;
  onZoneChange?(zone: string | null): void;
  onMove?(x: number, y: number, direction: Direction, moving: boolean): void;
  onFrame?(self: SelfState, others: Iterable<RemoteMotion>): void;
  /** Milliseconds, on the same clock renderers pass to `update`. */
  clock?(): number;
}

/**
 * The game as the client understands it, with no idea how it is drawn.
 *
 * Owns the local player (movement, collision, tap-to-move routes), everyone
 * else (interpolated positions), the speech bubbles currently alive, and
 * which district the player is in. A renderer calls `update` once per frame
 * with the direction the player is pushing, in world axes, then draws what
 * it finds here.
 */
export class ClientWorld {
  readonly map: TownMap;
  readonly self: SelfState;
  private readonly deps: ClientWorldDeps;
  private readonly listeners: WorldListener[] = [];
  private readonly remotes = new Map<string, RemoteMotion>();
  /** Expiry time of each player's current bubble, and its text. */
  private readonly bubbles = new Map<string, { text: string; until: number }>();
  private path: Point[] = [];
  private pathIndex = 0;
  private zone: string | null = null;
  private active = false;
  private selfId: string | null = null;

  constructor(deps: ClientWorldDeps) {
    this.deps = deps;
    this.map = deps.map;
    const spawn = tileCenter(this.map.spawn.x, this.map.spawn.y);
    this.self = {
      x: spawn.x,
      y: spawn.y,
      facing: 'down',
      walking: false,
      nickname: '',
      avatar: DEFAULT_AVATAR,
    };
  }

  private now(): number {
    return this.deps.clock?.() ?? performance.now();
  }

  listen(listener: WorldListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Identity and the server's word                                    */
  /* ---------------------------------------------------------------- */

  setIdentity(nickname: string, avatar: AvatarParts): void {
    this.self.nickname = nickname;
    this.self.avatar = avatar;
    for (const l of this.listeners) l.identityChanged?.(nickname, avatar);
  }

  setSelfId(id: string): void {
    this.selfId = id;
  }

  /** Movement is frozen until the player has actually joined the world. */
  setActive(active: boolean): void {
    this.active = active;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Place the local player where the server says they are. */
  placeSelf(x: number, y: number): void {
    this.self.x = x;
    this.self.y = y;
    for (const l of this.listeners) l.selfPlaced?.(x, y);
    this.clearPath();
    this.emitZone(true);
  }

  /** The server rejected a move; snap back rather than drift out of sync. */
  correctSelf(x: number, y: number): void {
    this.clearPath();
    this.self.x = x;
    this.self.y = y;
  }

  addRemote(state: PlayerState): void {
    if (this.remotes.has(state.id)) this.removeRemote(state.id);
    const remote = new RemoteMotion(state, this.now());
    this.remotes.set(state.id, remote);
    for (const l of this.listeners) l.remoteAdded?.(remote);
  }

  removeRemote(id: string): void {
    if (!this.remotes.delete(id)) return;
    this.bubbles.delete(id);
    for (const l of this.listeners) l.remoteRemoved?.(id);
  }

  clearEveryone(): void {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
  }

  applyUpdates(updates: readonly PlayerUpdate[]): void {
    const now = this.now();
    for (const update of updates) {
      // A position for someone we have never seen means we missed their join;
      // ignore it and wait for the server to tell us who they are.
      this.remotes.get(update.id)?.push(update.x, update.y, update.dir, update.moving, now);
    }
  }

  say(id: string, text: string): void {
    const anchor = this.anchorOf(id);
    if (anchor === null) return;
    this.bubbles.set(id, { text, until: this.now() + BUBBLE_TTL_MS });
    for (const l of this.listeners) l.said?.(id, text, anchor);
  }

  playEmote(id: string, kind: Emote): void {
    const anchor = this.anchorOf(id);
    if (anchor === null) return;
    for (const l of this.listeners) l.emoted?.(id, kind, anchor);
  }

  /* ---------------------------------------------------------------- */
  /* Reading                                                           */
  /* ---------------------------------------------------------------- */

  get localId(): string | null {
    return this.selfId;
  }

  remote(id: string): RemoteMotion | undefined {
    return this.remotes.get(id);
  }

  remoteList(): RemoteMotion[] {
    return [...this.remotes.values()];
  }

  /** The live map of everyone else; iterate, do not hold on to it. */
  get others(): ReadonlyMap<string, RemoteMotion> {
    return this.remotes;
  }

  currentZoneName(): string | null {
    return this.zone;
  }

  /** Text of the speech bubbles still on screen. */
  bubbleTexts(): string[] {
    const now = this.now();
    const texts: string[] = [];
    for (const [id, bubble] of this.bubbles) {
      if (bubble.until <= now) this.bubbles.delete(id);
      else texts.push(bubble.text);
    }
    return texts;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.self.x, y: this.self.y };
  }

  /** Where a player is standing, or null for someone we do not know. */
  anchorOf(id: string): { x: number; y: number } | null {
    if (id === this.selfId) return { x: this.self.x, y: this.self.y };
    const remote = this.remotes.get(id);
    return remote === undefined ? null : { x: remote.x, y: remote.y };
  }

  /* ---------------------------------------------------------------- */
  /* The frame                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Advance one frame. `input` is the direction the player is pushing, in
   * world axes (x east, y south), with a length of at most one.
   */
  update(now: number, deltaMs: number, input: { readonly x: number; readonly y: number }): void {
    const seconds = Math.min(deltaMs, 50) / 1000;
    let moved = false;

    if (this.active) {
      if (input.x !== 0 || input.y !== 0) {
        this.clearPath();
        moved = this.step(input.x, input.y, seconds);
      } else if (this.path.length > 0) {
        moved = this.followPath(seconds);
      }
    }
    this.self.walking = moved;

    for (const remote of this.remotes.values()) remote.update(now);

    this.emitZone(false);
    if (this.active) {
      this.deps.onMove?.(this.self.x, this.self.y, this.self.facing, moved);
    }
    this.deps.onFrame?.(this.self, this.remotes.values());
  }

  /** Route to a tapped tile, or to the nearest spot we can reach. */
  walkToTile(tapped: Point): void {
    if (!this.active) return;
    const goal = nearestWalkable(this.map.width, this.map.height, tapped, this.map.isWalkable);
    if (goal === null) return;

    const from = toTile(this.self.x, this.self.y);
    const route = findPath(this.map.width, this.map.height, from, goal, {
      isWalkable: this.map.isWalkable,
      maxNodes: 12_000,
    });
    if (route === null || route.length === 0) return;

    this.clearPath();
    this.path = route;
    this.pathIndex = 0;
    for (const l of this.listeners) l.routeStarted?.(goal);
  }

  private step(dirX: number, dirY: number, seconds: number): boolean {
    const distance = WALK_SPEED_PX * seconds;
    const result = moveWithCollision(
      this.map,
      this.self.x,
      this.self.y,
      dirX * distance,
      dirY * distance,
    );
    const moved = result.x !== this.self.x || result.y !== this.self.y;
    if (moved) {
      this.self.x = result.x;
      this.self.y = result.y;
      this.faceAlong(dirX, dirY);
    }
    return moved;
  }

  private followPath(seconds: number): boolean {
    let budget = WALK_SPEED_PX * seconds;
    let moved = false;
    const epsilon = 1e-6;

    while (budget > epsilon && this.pathIndex < this.path.length) {
      const target = this.path[this.pathIndex] as Point;
      const center = tileCenter(target.x, target.y);
      const dx = center.x - this.self.x;
      const dy = center.y - this.self.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining <= epsilon) {
        this.self.x = center.x;
        this.self.y = center.y;
        this.pathIndex += 1;
        continue;
      }

      // Never step past a waypoint. Spend leftover distance on the next leg
      // instead of reversing direction or pausing for a frame at each center.
      const distance = Math.min(budget, remaining);
      if (!this.step(dx / remaining, dy / remaining, distance / WALK_SPEED_PX)) {
        this.clearPath();
        return moved;
      }
      moved = true;
      budget -= distance;

      // Collision sliding may cover less than the requested distance.
      if (Math.hypot(center.x - this.self.x, center.y - this.self.y) > epsilon) break;
      this.self.x = center.x;
      this.self.y = center.y;
      this.pathIndex += 1;
    }

    if (this.path.length > 0 && this.pathIndex >= this.path.length) this.clearPath();
    return moved;
  }

  private faceAlong(dx: number, dy: number): void {
    this.self.facing =
      Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  }

  private clearPath(): void {
    this.path = [];
    this.pathIndex = 0;
    for (const l of this.listeners) l.routeCleared?.();
  }

  private emitZone(force: boolean): void {
    const tile = toTile(this.self.x, this.self.y);
    const zone = this.map.zoneAt(tile.x, tile.y);
    if (!force && zone === this.zone) return;
    this.zone = zone;
    this.deps.onZoneChange?.(zone);
  }
}
