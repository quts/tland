import Phaser from 'phaser';
import { WorldScene } from '../scenes/WorldScene.js';
import { ResolutionController } from '../scale.js';
import {
  TEXTURE_FRAME_HEIGHT,
  TEXTURE_FRAME_WIDTH,
  avatarTextureKey,
  buildAvatarTexture,
  type AvatarParts,
} from '../gfx/avatar.js';
import { resolutionCap } from '../viewport.js';
import type { AvatarImage, Renderer, RendererContext, RendererStats } from './renderer.js';

/** The original Phaser view: tiles, sprites, and a canvas-drawn world. */
export class Renderer2D implements Renderer {
  readonly kind = '2d' as const;
  readonly ready: Promise<void>;
  private readonly game: Phaser.Game;
  private readonly scene: WorldScene;
  private readonly resolution: ResolutionController;

  constructor(context: RendererContext) {
    const { parent } = context;
    this.scene = new WorldScene({
      world: context.world,
      joystick: context.joystick,
      getResolution: () => resolutionCap(),
      isTyping: () => context.isTyping(),
    });

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#8fcfe3',
      scale: {
        // ResolutionController drives the size; NONE keeps Phaser from fighting it.
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: Math.max(1, parent.clientWidth),
        height: Math.max(1, parent.clientHeight),
      },
      render: {
        pixelArt: false,
        antialias: true,
        roundPixels: true,
        powerPreference: 'high-performance',
      },
      // No audio is loaded; any future audio starts muted after a gesture.
      audio: { noAudio: true },
      banner: false,
      scene: [this.scene],
    });

    this.resolution = new ResolutionController(this.game, parent);
    this.ready = new Promise((resolve) => {
      this.game.events.once(Phaser.Core.Events.READY, () => {
        this.resolution.start();
        resolve();
      });
    });
  }

  renderAvatarPreview(parts: AvatarParts): AvatarImage | null {
    if (!this.scene.scene.isActive()) return null;
    buildAvatarTexture(this.scene, parts);
    const texture = this.scene.textures.get(avatarTextureKey(parts));
    // Frame 0, the front-facing pose, sits at the top-left of the sheet.
    return {
      source: texture.getSourceImage() as CanvasImageSource,
      width: TEXTURE_FRAME_WIDTH,
      height: TEXTURE_FRAME_HEIGHT,
    };
  }

  tileToScreen(tileX: number, tileY: number): { x: number; y: number } | null {
    if (!this.scene.scene.isActive()) return null;
    return this.scene.tileToScreen(tileX, tileY);
  }

  stats(): RendererStats | null {
    return null;
  }

  dispose(): void {
    this.resolution.stop();
    this.game.destroy(true);
  }
}
