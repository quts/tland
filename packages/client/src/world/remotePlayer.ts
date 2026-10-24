import type Phaser from 'phaser';
import type { RemoteMotion } from './remoteMotion.js';
import { AvatarSprite } from './avatarSprite.js';

/**
 * Another player in the 2D view: a sprite that follows the interpolated
 * position ClientWorld keeps for them.
 */
export class RemotePlayer {
  readonly id: string;
  readonly sprite: AvatarSprite;

  constructor(
    scene: Phaser.Scene,
    private readonly motion: RemoteMotion,
  ) {
    this.id = motion.id;
    this.sprite = new AvatarSprite(scene, motion.x, motion.y, motion.avatar, motion.nick);
    this.sprite.setDirection(motion.dir);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** `delta` is in milliseconds. */
  update(delta: number): void {
    if (this.motion.x !== this.sprite.x || this.motion.y !== this.sprite.y) {
      this.sprite.setPosition(this.motion.x, this.motion.y);
    }
    this.sprite.setDirection(this.motion.dir);
    this.sprite.setWalking(this.motion.walking);
    this.sprite.update(delta);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
