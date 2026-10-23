import { randomUUID } from 'node:crypto';
import {
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT_MESSAGES,
  CHAT_RATE_LIMIT_WINDOW_MS,
  ProximityTracker,
  RateLimiter,
  getTownMap,
  sanitizeText,
  type AvatarSpec,
  type Direction,
  type Emote,
  type PlayerState,
  type PlayerUpdate,
  type ServerMessage,
} from '@tland/shared';
import { TILE_SIZE } from '@tland/shared';
import { checkMove } from './validation.ts';

/** A single connected socket, kept transport-agnostic so it is easy to test. */
export interface Connection {
  readonly id: string;
  send(message: ServerMessage): void;
}

interface Player {
  readonly connection: Connection;
  nick: string;
  avatar: AvatarSpec;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** Timestamp of the last accepted move, for the speed check. */
  lastMoveAt: number;
  /** Set once this tick's position differs from what was last broadcast. */
  dirty: boolean;
  readonly chatLimiter: RateLimiter;
  readonly emoteLimiter: RateLimiter;
}

const map = getTownMap();

/**
 * The one shared room.
 *
 * In memory only: restarting the server empties the world, which is
 * intentional for this project. The room owns every authoritative decision —
 * where a player is, who can hear them, and whether they are talking too fast.
 */
export class Room {
  private readonly players = new Map<string, Player>();
  private readonly proximity = new ProximityTracker();
  private readonly maxPlayers: number;
  private currentTick = 0;

  constructor(maxPlayers: number) {
    this.maxPlayers = maxPlayers;
  }

  get tick(): number {
    return this.currentTick;
  }

  get size(): number {
    return this.players.size;
  }

  get capacity(): number {
    return this.maxPlayers;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  static newId(): string {
    return randomUUID();
  }

  /** Admit a player at the spawn point. Returns their starting position. */
  join(
    connection: Connection,
    nick: string,
    avatar: AvatarSpec,
    now: number,
  ): PlayerState {
    const spawn = this.findSpawn();
    const player: Player = {
      connection,
      nick,
      avatar,
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      lastMoveAt: now,
      dirty: true,
      chatLimiter: new RateLimiter(
        CHAT_RATE_LIMIT_MESSAGES,
        CHAT_RATE_LIMIT_WINDOW_MS,
      ),
      // Emotes are cheaper than chat but still worth a ceiling.
      emoteLimiter: new RateLimiter(8, CHAT_RATE_LIMIT_WINDOW_MS),
    };
    this.players.set(connection.id, player);
    return this.stateOf(connection.id, player);
  }

  leave(id: string): void {
    this.players.delete(id);
    this.proximity.forget(id);
  }

  /** Everyone currently in the world. */
  roster(exceptId?: string): PlayerState[] {
    const result: PlayerState[] = [];
    for (const [id, player] of this.players) {
      if (id === exceptId) continue;
      result.push(this.stateOf(id, player));
    }
    return result;
  }

  /**
   * Apply a claimed position.
   *
   * Returns null when it was accepted, or the authoritative position when it
   * was not, so the caller can send a correction.
   */
  applyMove(
    id: string,
    x: number,
    y: number,
    dir: Direction,
    moving: boolean,
    now: number,
  ): { x: number; y: number } | null {
    const player = this.players.get(id);
    if (player === undefined) return null;

    const result = checkMove(player.x, player.y, x, y, now - player.lastMoveAt);
    player.lastMoveAt = now;

    if (player.dir !== dir || player.moving !== moving) player.dirty = true;
    player.dir = dir;
    player.moving = moving;

    if (!result.accepted) {
      player.dirty = true;
      return { x: player.x, y: player.y };
    }

    if (player.x !== result.x || player.y !== result.y) player.dirty = true;
    player.x = result.x;
    player.y = result.y;
    return null;
  }

  /** How long until this player may speak again, in milliseconds. */
  chatRetryAfter(id: string, now: number): number {
    return this.players.get(id)?.chatLimiter.retryAfter(now) ?? 0;
  }

  /** Relay a chat line to everyone within earshot. Returns false if limited. */
  chat(id: string, text: string, now: number): boolean {
    const player = this.players.get(id);
    if (player === undefined) return false;
    if (!player.chatLimiter.tryConsume(now)) return false;

    const clean = sanitizeText(text, CHAT_MAX_LENGTH);
    if (clean.length === 0) return true;

    const message: ServerMessage = { t: 'chat', id, text: clean };
    // The speaker always sees their own line, even standing alone.
    player.connection.send(message);
    for (const listener of this.listeners(id)) listener.connection.send(message);
    return true;
  }

  /** Relay an emote to everyone within earshot. Returns false if limited. */
  emote(id: string, kind: Emote, now: number): boolean {
    const player = this.players.get(id);
    if (player === undefined) return false;
    if (!player.emoteLimiter.tryConsume(now)) return false;

    const message: ServerMessage = { t: 'emote', id, kind };
    player.connection.send(message);
    for (const listener of this.listeners(id)) listener.connection.send(message);
    return true;
  }

  /**
   * Advance one tick: refresh who can hear whom, then broadcast the players
   * whose position or facing changed since the last tick.
   */
  advanceTick(): void {
    this.currentTick += 1;

    const entities = [...this.players].map(([id, player]) => ({
      id,
      x: player.x,
      y: player.y,
    }));
    this.proximity.update(entities);

    const updates: PlayerUpdate[] = [];
    for (const [id, player] of this.players) {
      if (!player.dirty) continue;
      player.dirty = false;
      updates.push({
        id,
        // One decimal is plenty at 32px tiles and keeps frames small.
        x: Math.round(player.x * 10) / 10,
        y: Math.round(player.y * 10) / 10,
        dir: player.dir,
        moving: player.moving,
      });
    }
    if (updates.length === 0) return;

    for (const [id, player] of this.players) {
      const forThisPlayer = updates.filter((update) => update.id !== id);
      if (forThisPlayer.length === 0) continue;
      player.connection.send({
        t: 'state',
        tick: this.currentTick,
        players: forThisPlayer,
      });
    }
  }

  /** Send to everyone, optionally skipping one player. */
  broadcast(message: ServerMessage, exceptId?: string): void {
    for (const [id, player] of this.players) {
      if (id === exceptId) continue;
      player.connection.send(message);
    }
  }

  /** Whether two players are currently within earshot. Exposed for tests. */
  canHear(a: string, b: string): boolean {
    return this.proximity.canHear(a, b);
  }

  private listeners(id: string): Player[] {
    const result: Player[] = [];
    for (const [otherId, player] of this.players) {
      if (otherId === id) continue;
      if (this.proximity.canHear(id, otherId)) result.push(player);
    }
    return result;
  }

  private stateOf(id: string, player: Player): PlayerState {
    return {
      id,
      nick: player.nick,
      avatar: player.avatar,
      x: player.x,
      y: player.y,
      dir: player.dir,
      moving: player.moving,
    };
  }

  /**
   * Spawn on or near the map's spawn tile.
   *
   * A ring of offsets keeps a crowd from stacking on one tile when several
   * people join at once.
   */
  private findSpawn(): { x: number; y: number } {
    const base = map.spawn;
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
    ];
    const occupied = new Set<string>();
    for (const player of this.players.values()) {
      occupied.add(
        `${Math.floor(player.x / TILE_SIZE)},${Math.floor(player.y / TILE_SIZE)}`,
      );
    }

    for (const [dx, dy] of offsets) {
      const tileX = base.x + dx;
      const tileY = base.y + dy;
      if (!map.isWalkable(tileX, tileY)) continue;
      if (occupied.has(`${tileX},${tileY}`)) continue;
      return {
        x: tileX * TILE_SIZE + TILE_SIZE / 2,
        y: tileY * TILE_SIZE + TILE_SIZE / 2,
      };
    }

    return {
      x: base.x * TILE_SIZE + TILE_SIZE / 2,
      y: base.y * TILE_SIZE + TILE_SIZE / 2,
    };
  }
}
