import type Phaser from 'phaser';
import { BUBBLE_TTL_MS, type Emote } from '@tland/shared';
import { FRAME_HEIGHT } from '../gfx/avatar.js';
import { PALETTE } from '../gfx/palette.js';
import { drawEmote } from '../gfx/emotes.js';
import { DEPTH } from './depths.js';

const MAX_BUBBLE_WIDTH = 190;
const EMOTE_SIZE = 34;

interface Anchor {
  readonly x: number;
  readonly y: number;
}

/**
 * Speech bubbles and emote pops above characters.
 *
 * Each one follows its speaker until it expires. Text is set through Phaser's
 * text object, which takes a plain string; nothing here ever builds markup.
 */
export class BubbleLayer {
  private readonly bubbles = new Map<string, Bubble>();
  private readonly emotes = new Map<string, EmotePop>();

  constructor(private readonly scene: Phaser.Scene) {}

  say(id: string, text: string, anchor: Anchor): void {
    this.bubbles.get(id)?.destroy();
    this.bubbles.set(id, new Bubble(this.scene, text, anchor, () => {
      this.bubbles.delete(id);
    }));
  }

  emote(id: string, kind: Emote, anchor: Anchor): void {
    this.emotes.get(id)?.destroy();
    this.emotes.set(id, new EmotePop(this.scene, kind, anchor, () => {
      this.emotes.delete(id);
    }));
  }

  /** Keep every bubble over its speaker. */
  follow(positions: ReadonlyMap<string, Anchor>): void {
    for (const [id, bubble] of this.bubbles) {
      const anchor = positions.get(id);
      if (anchor === undefined) {
        bubble.destroy();
        this.bubbles.delete(id);
        continue;
      }
      bubble.moveTo(anchor);
    }
    for (const [id, pop] of this.emotes) {
      const anchor = positions.get(id);
      if (anchor === undefined) {
        pop.destroy();
        this.emotes.delete(id);
        continue;
      }
      pop.moveTo(anchor);
    }
  }

  /** Drop everything belonging to a player who left or walked out of range. */
  clear(id: string): void {
    this.bubbles.get(id)?.destroy();
    this.bubbles.delete(id);
    this.emotes.get(id)?.destroy();
    this.emotes.delete(id);
  }

  /** The text currently on screen, for the end-to-end test. */
  texts(): string[] {
    return [...this.bubbles.values()].map((bubble) => bubble.text);
  }
}

class Bubble {
  readonly text: string;
  private readonly container: Phaser.GameObjects.Container;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    text: string,
    anchor: Anchor,
    private readonly onExpire: () => void,
  ) {
    this.text = text;

    const label = scene.add
      .text(0, 0, text, {
        fontFamily: '"Huninn Rounded", "Noto Sans TC", sans-serif',
        fontSize: '14px',
        color: '#4b4033',
        wordWrap: { width: MAX_BUBBLE_WIDTH - 24, useAdvancedWrap: true },
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    const width = Math.min(MAX_BUBBLE_WIDTH, Math.ceil(label.width) + 24);
    const height = Math.ceil(label.height) + 16;

    const backdrop = scene.add.graphics();
    backdrop.fillStyle(PALETTE.ink, 1);
    backdrop.fillRoundedRect(-width / 2 - 2.5, -height / 2 - 2.5, width + 5, height + 5, 13);
    backdrop.fillStyle(PALETTE.wall, 1);
    backdrop.fillRoundedRect(-width / 2, -height / 2, width, height, 11);
    // Tail, pointing down at the speaker.
    backdrop.fillStyle(PALETTE.ink, 1);
    backdrop.fillTriangle(-8, height / 2 - 1, 8, height / 2 - 1, 0, height / 2 + 10);
    backdrop.fillStyle(PALETTE.wall, 1);
    backdrop.fillTriangle(-5, height / 2 - 2, 5, height / 2 - 2, 0, height / 2 + 6);

    this.container = scene.add.container(0, 0, [backdrop, label]);
    this.container.setDepth(DEPTH.overlay + 10);
    this.container.setSize(width, height);
    this.moveTo(anchor);

    scene.tweens.add({
      targets: this.container,
      scale: { from: 0.86, to: 1 },
      duration: 160,
      ease: 'Back.easeOut',
    });
    scene.tweens.add({
      targets: this.container,
      alpha: 0,
      delay: BUBBLE_TTL_MS - 450,
      duration: 450,
      onComplete: () => this.destroy(),
    });
  }

  moveTo(anchor: Anchor): void {
    if (this.destroyed) return;
    this.container.setPosition(
      anchor.x,
      anchor.y - FRAME_HEIGHT - 26 - this.container.height / 2,
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy();
    this.onExpire();
  }
}

class EmotePop {
  private readonly image: Phaser.GameObjects.Image;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    kind: Emote,
    anchor: Anchor,
    private readonly onExpire: () => void,
  ) {
    this.image = scene.add.image(0, 0, emoteTextureKey(scene, kind));
    this.image.setDepth(DEPTH.overlay + 20);
    this.image.setDisplaySize(EMOTE_SIZE, EMOTE_SIZE);
    this.moveTo(anchor);

    scene.tweens.add({
      targets: this.image,
      y: this.image.y - 16,
      scale: { from: 0.4, to: this.image.scale },
      duration: 240,
      ease: 'Back.easeOut',
    });
    scene.tweens.add({
      targets: this.image,
      alpha: 0,
      delay: 1500,
      duration: 400,
      onComplete: () => this.destroy(),
    });
  }

  moveTo(anchor: Anchor): void {
    if (this.destroyed) return;
    // Beside the head rather than above it, where the name label already sits.
    this.image.setPosition(anchor.x + 20, anchor.y - FRAME_HEIGHT - 4);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.image.destroy();
    this.onExpire();
  }
}

/** Bake one emote into a texture the first time it is needed. */
function emoteTextureKey(scene: Phaser.Scene, kind: Emote): string {
  const key = `emote-${kind}`;
  if (scene.textures.exists(key)) return key;

  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = EMOTE_SIZE * scale;
  canvas.height = EMOTE_SIZE * scale;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.scale(scale, scale);
    drawEmote(ctx, kind, EMOTE_SIZE);
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}
