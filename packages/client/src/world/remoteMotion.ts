import { TICK_MS, type Direction, type PlayerState } from '@tland/shared';
import { sanitizeAvatar, type AvatarParts } from '../gfx/avatar.js';

/**
 * Another player, drawn a little in the past.
 *
 * State arrives at the server tick rate, which is far below the frame rate, so
 * remote players are rendered by interpolating between the last two known
 * positions. Playing one tick behind means there is almost always a newer
 * position to interpolate towards, which is what keeps other people from
 * stuttering across the screen.
 *
 * Plain data and arithmetic: each renderer reads `x`, `y`, `dir` and
 * `walking` and draws them however it draws.
 */
const INTERPOLATION_DELAY_MS = TICK_MS * 1.5;

/** Beyond this gap, snap instead of sliding: the player teleported or lagged. */
const SNAP_DISTANCE_PX = 320;

interface Sample {
  x: number;
  y: number;
  at: number;
}

export class RemoteMotion {
  readonly id: string;
  readonly nick: string;
  readonly avatar: AvatarParts;
  x: number;
  y: number;
  dir: Direction;
  /** Whether to animate a walk; goes false once the last update has played out. */
  walking: boolean;
  private previous: Sample;
  private next: Sample;
  private moving: boolean;

  constructor(state: PlayerState, now: number) {
    this.id = state.id;
    this.nick = state.nick;
    this.avatar = sanitizeAvatar(state.avatar);
    this.x = state.x;
    this.y = state.y;
    this.dir = state.dir;
    this.moving = false;
    this.walking = false;
    this.previous = { x: state.x, y: state.y, at: now };
    this.next = { x: state.x, y: state.y, at: now };
  }

  /** A new authoritative position from the server. */
  push(x: number, y: number, dir: Direction, moving: boolean, now: number): void {
    if (Math.hypot(x - this.next.x, y - this.next.y) > SNAP_DISTANCE_PX) {
      this.previous = { x, y, at: now };
      this.next = { x, y, at: now };
      this.x = x;
      this.y = y;
    } else {
      this.previous = { x: this.x, y: this.y, at: now };
      this.next = { x, y, at: now + INTERPOLATION_DELAY_MS };
    }
    this.dir = dir;
    this.moving = moving;
    this.walking = moving;
  }

  update(now: number): void {
    const span = this.next.at - this.previous.at;
    if (span <= 0) return;
    const t = Math.min(1, Math.max(0, (now - this.previous.at) / span));
    // Smoothstep: no visible kink when one interpolation hands off to the next.
    const eased = t * t * (3 - 2 * t);
    this.x = this.previous.x + (this.next.x - this.previous.x) * eased;
    this.y = this.previous.y + (this.next.y - this.previous.y) * eased;
    // A player who stopped sending updates has stopped walking.
    if (t >= 1 && this.moving) {
      this.moving = false;
      this.walking = false;
    }
  }
}
