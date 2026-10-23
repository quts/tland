import type Phaser from 'phaser';
import {
  FACING,
  FRAME_HEIGHT,
  buildAvatarTexture,
  type AvatarParts,
} from '../gfx/avatar.js';
import { GFX_SCALE } from '../gfx/scale.js';
import { PALETTE } from '../gfx/palette.js';
import { DEPTH } from './depths.js';

export type Direction = 'down' | 'up' | 'left' | 'right';

/** Avatar textures are drawn at GFX_SCALE and shown at world resolution. */
const BASE_SCALE = 1 / GFX_SCALE;

/**
 * One character on screen: the avatar, a name label, and the walk bob.
 *
 * Used for the local player and for everyone else, so remote players get the
 * same look and the same facing rules for free.
 */
export class AvatarSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly labelBackdrop: Phaser.GameObjects.Graphics;
  private direction: Direction = 'down';
  private walking = false;
  private bobPhase = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    parts: AvatarParts,
    nickname: string,
  ) {
    const key = buildAvatarTexture(scene, parts);
    this.sprite = scene.add.sprite(x, y, key, FACING.down);
    // Anchored at the feet, so depth sorting matches where the character
    // actually stands rather than where the top of their hat is.
    this.sprite.setOrigin(0.5, 1);
    // The texture is supersampled; display it at world resolution.
    this.sprite.setScale(BASE_SCALE);

    this.labelBackdrop = scene.add.graphics();
    this.label = scene.add
      .text(x, y - FRAME_HEIGHT - 8, nickname, {
        fontFamily: '"Huninn Rounded", "Noto Sans TC", sans-serif',
        fontSize: '13px',
        color: '#4b4033',
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.overlay);
    this.labelBackdrop.setDepth(DEPTH.overlay - 1);
    this.drawLabelBackdrop();
    this.setPosition(x, y);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.sprite.setDepth(DEPTH.entityBase + y);
    this.label.setPosition(x, y - FRAME_HEIGHT - 6);
    this.labelBackdrop.setPosition(x, y - FRAME_HEIGHT - 6);
  }

  setNickname(nickname: string): void {
    this.label.setText(nickname);
    this.drawLabelBackdrop();
  }

  setAvatar(parts: AvatarParts): void {
    const key = buildAvatarTexture(this.scene, parts);
    this.sprite.setTexture(key, this.frameFor(this.direction));
    this.applyFlip();
  }

  setDirection(direction: Direction): void {
    if (this.direction === direction) return;
    this.direction = direction;
    this.sprite.setFrame(this.frameFor(direction));
    this.applyFlip();
  }

  setWalking(walking: boolean): void {
    if (this.walking === walking) return;
    this.walking = walking;
    if (!walking) {
      this.bobPhase = 0;
      this.sprite.setScale(BASE_SCALE, BASE_SCALE);
    }
  }

  /** `delta` is in milliseconds. */
  update(delta: number): void {
    if (!this.walking) return;
    // A gentle squash and stretch reads as walking without extra frames.
    this.bobPhase += delta * 0.011;
    const squash = Math.sin(this.bobPhase) * 0.045;
    this.sprite.setScale(BASE_SCALE * (1 - squash), BASE_SCALE * (1 + squash));
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.labelBackdrop.destroy();
  }

  private frameFor(direction: Direction): number {
    if (direction === 'down') return FACING.down;
    if (direction === 'up') return FACING.up;
    return FACING.side;
  }

  private applyFlip(): void {
    this.sprite.setFlipX(this.direction === 'left');
  }

  private drawLabelBackdrop(): void {
    const width = Math.ceil(this.label.width) + 12;
    const height = Math.ceil(this.label.height) + 6;
    this.labelBackdrop.clear();
    this.labelBackdrop.fillStyle(PALETTE.wall, 0.86);
    this.labelBackdrop.fillRoundedRect(-width / 2, -height, width, height, height / 2);
  }
}
