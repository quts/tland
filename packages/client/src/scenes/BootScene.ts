import Phaser from 'phaser';

const PALETTE = {
  grass: 0xa9dcc0,
  grassAlt: 0x9fd6b8,
  ink: 0x4b4033,
  cream: 0xfdf7ec,
  rose: 0xf3b8bf,
} as const;

/**
 * Milestone 1 placeholder scene.
 *
 * Deliberately empty of gameplay: it exists to prove the canvas renders, the
 * resolution cap holds, and the scene reflows on rotation. The map, camera and
 * controls arrive in milestone 2. Every pixel here is drawn in code.
 */
export class BootScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Graphics;
  private signpost!: Phaser.GameObjects.Container;
  private bobTween?: Phaser.Tweens.Tween;

  constructor() {
    super('boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.grass);

    this.backdrop = this.add.graphics();
    this.signpost = this.createSignpost();

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.bobTween?.remove();
    });
  }

  /** A soft checker of two greens, so motion and scaling are visible. */
  private drawBackdrop(width: number, height: number): void {
    const cell = 64;
    this.backdrop.clear();
    for (let y = 0; y < height + cell; y += cell) {
      for (let x = 0; x < width + cell; x += cell) {
        const even = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
        this.backdrop.fillStyle(even ? PALETTE.grass : PALETTE.grassAlt, 1);
        this.backdrop.fillRect(x, y, cell, cell);
      }
    }
  }

  /** A chunky-outlined wooden sign, drawn with primitives only. */
  private createSignpost(): Phaser.GameObjects.Container {
    const boardWidth = 232;
    const boardHeight = 96;
    const graphics = this.add.graphics();

    // Post.
    graphics.fillStyle(PALETTE.ink, 1);
    graphics.fillRoundedRect(-11, boardHeight / 2 - 6, 22, 74, 6);
    graphics.fillStyle(0xc9a87c, 1);
    graphics.fillRoundedRect(-7, boardHeight / 2 - 4, 14, 68, 5);

    // Board, outline first then fill, for the chunky-outline look.
    graphics.fillStyle(PALETTE.ink, 1);
    graphics.fillRoundedRect(
      -boardWidth / 2 - 4,
      -boardHeight / 2 - 4,
      boardWidth + 8,
      boardHeight + 8,
      20,
    );
    graphics.fillStyle(PALETTE.cream, 1);
    graphics.fillRoundedRect(
      -boardWidth / 2,
      -boardHeight / 2,
      boardWidth,
      boardHeight,
      16,
    );

    // Two little flowers at the base.
    for (const side of [-1, 1]) {
      const cx = side * 78;
      const cy = boardHeight / 2 + 58;
      graphics.fillStyle(PALETTE.rose, 1);
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        graphics.fillCircle(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7, 5);
      }
      graphics.fillStyle(0xf7e2a0, 1);
      graphics.fillCircle(cx, cy, 4.5);
    }

    const title = this.add
      .text(0, -14, '河岸小鎮', {
        fontFamily: '"Huninn Rounded", "Noto Sans TC", sans-serif',
        fontSize: '30px',
        color: '#4b4033',
      })
      .setOrigin(0.5);

    const subtitle = this.add
      .text(0, 18, '準備中 · 階段 1', {
        fontFamily: '"Huninn Rounded", "Noto Sans TC", sans-serif',
        fontSize: '15px',
        color: '#7a6c5a',
      })
      .setOrigin(0.5);

    return this.add.container(0, 0, [graphics, title, subtitle]);
  }

  /** Re-centre everything. Called on create and on every resize/rotation. */
  private layout(): void {
    const { width, height } = this.scale.gameSize;
    this.drawBackdrop(width, height);

    this.signpost.setPosition(width / 2, height / 2 - 20);
    // Shrink to fit narrow phones in portrait rather than overflowing.
    this.signpost.setScale(Math.min(1, width / 360));

    this.bobTween?.remove();
    const baseY = this.signpost.y;
    this.bobTween = this.tweens.add({
      targets: this.signpost,
      y: baseY - 7,
      duration: 2100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }
}
