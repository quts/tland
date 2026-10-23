import type Phaser from 'phaser';
import { resolutionCap } from './viewport.js';

/**
 * Keeps the canvas backing store at `cssSize * min(devicePixelRatio, 2)`.
 *
 * Phaser's RESIZE mode sizes the backing store in CSS pixels, which looks soft
 * on a retina phone, while letting it follow the raw devicePixelRatio costs
 * ~2.25x the fill rate on a 3x device. So we drive the game size ourselves and
 * let the stylesheet hold the canvas at 100% of its parent. One consequence:
 * game units are device pixels, so the world camera applies the same factor as
 * its zoom.
 */
export class ResolutionController {
  private frame = 0;

  constructor(
    private readonly game: Phaser.Game,
    private readonly parent: HTMLElement,
  ) {}

  /** Current pixel ratio in use; world cameras should zoom by this. */
  get ratio(): number {
    return resolutionCap();
  }

  start(): void {
    this.apply();
    window.addEventListener('resize', this.schedule);
    window.addEventListener('orientationchange', this.schedule);
    window.visualViewport?.addEventListener('resize', this.schedule);
  }

  stop(): void {
    window.removeEventListener('resize', this.schedule);
    window.removeEventListener('orientationchange', this.schedule);
    window.visualViewport?.removeEventListener('resize', this.schedule);
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
  }

  /**
   * Safari reports stale element sizes during a rotation, so coalesce bursts of
   * events into a single measurement on the next frame.
   */
  private readonly schedule = (): void => {
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.apply();
    });
  };

  private apply(): void {
    const rect = this.parent.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const ratio = this.ratio;

    this.game.scale.resize(cssWidth * ratio, cssHeight * ratio);

    // The stylesheet pins the canvas to 100%/100%, but Phaser writes inline
    // styles on resize, so restate the display size in CSS pixels.
    const style = this.game.canvas.style;
    style.width = `${cssWidth}px`;
    style.height = `${cssHeight}px`;
  }
}
