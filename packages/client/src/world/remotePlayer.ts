import type Phaser from 'phaser';
import { TICK_MS, type Direction, type PlayerState } from '@tland/shared';
import { sanitizeAvatar } from '../gfx/avatar.js';
import { AvatarSprite } from './avatarSprite.js';

/**
 * Another player, drawn a little in the past.
 *
 * State arrives at the server tick rate, which is far below the frame rate, so
 * remote players are rendered by interpolating between the last two known
 * positions. Playing one tick behind means there is almost always a newer
 * position to interpolate towards, which is what keeps other people from
 * stuttering across the screen.
 */
const INTERPOLATION_DELAY_MS = TICK_MS * 1.5;

/** Beyond this gap, snap instead of sliding: the player teleported or lagged. */
const SNAP_DISTANCE_PX = 320;

interface Sample {
  x: number;
  y: number;
  at: number;
}

export class RemotePlayer {
  readonly id: string;
  readonly sprite: AvatarSprite;
  private previous: Sample;
  private next: Sample;
  private moving = false;

  constructor(scene: Phaser.Scene, state: PlayerState, now: number) {
    this.id = state.id;
    this.sprite = new AvatarSprite(
      scene,
      state.x,
      state.y,
      sanitizeAvatar(state.avatar),
      state.nick,
    );
    this.sprite.setDirection(state.dir);
    this.previous = { x: state.x, y: state.y, at: now };
    this.next = { x: state.x, y: state.y, at: now };
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** A new authoritative position from the server. */
  push(x: number, y: number, dir: Direction, moving: boolean, now: number): void {
    if (Math.hypot(x - this.next.x, y - this.next.y) > SNAP_DISTANCE_PX) {
      this.previous = { x, y, at: now };
      this.next = { x, y, at: now };
      this.sprite.setPosition(x, y);
    } else {
      this.previous = { x: this.sprite.x, y: this.sprite.y, at: now };
      this.next = { x, y, at: now + INTERPOLATION_DELAY_MS };
    }
    this.sprite.setDirection(dir);
    this.moving = moving;
    this.sprite.setWalking(moving);
  }

  update(now: number, delta: number): void {
    const span = this.next.at - this.previous.at;
    if (span > 0) {
      const t = Math.min(1, Math.max(0, (now - this.previous.at) / span));
      // Smoothstep: no visible kink when one interpolation hands off to the next.
      const eased = t * t * (3 - 2 * t);
      this.sprite.setPosition(
        this.previous.x + (this.next.x - this.previous.x) * eased,
        this.previous.y + (this.next.y - this.previous.y) * eased,
      );
      // A player who stopped sending updates has stopped walking.
      if (t >= 1 && this.moving) {
        this.moving = false;
        this.sprite.setWalking(false);
      }
    }
    this.sprite.update(delta);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
