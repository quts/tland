import type * as THREE from 'three';

/** How often the readout refreshes. Text layout every frame would cost more than it measures. */
const REFRESH_MS = 500;

export interface FrameSample {
  /** Wall time since the previous frame. */
  readonly deltaMs: number;
  /** Time spent in our own update and render call. */
  readonly cpuMs: number;
}

/**
 * The `?debug=1` readout: frame rate, frame time, and what the GPU was asked
 * to do on the last frame.
 *
 * Accumulates into plain numbers each frame and only builds a string when it
 * refreshes, so the measuring does not show up in the measurement.
 */
export class DebugHud {
  private readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private frames = 0;
  private wallMs = 0;
  private cpuMs = 0;
  private worstMs = 0;
  private since = 0;
  private fps = 0;

  constructor(parent: HTMLElement, actions: ReadonlyArray<{ label: string; run(): void }> = []) {
    this.root = document.createElement('div');
    this.root.className = 'debug-hud';
    this.text = document.createElement('pre');
    this.text.className = 'debug-hud-text';
    this.text.textContent = '…';
    this.root.append(this.text);
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'debug-hud-button';
      button.textContent = action.label;
      button.addEventListener('click', () => action.run());
      this.root.append(button);
    }
    parent.append(this.root);
  }

  /** Frames per second over the last refresh window. */
  get currentFps(): number {
    return this.fps;
  }

  sample(now: number, frame: FrameSample, renderer: THREE.WebGLRenderer): void {
    this.frames += 1;
    this.wallMs += frame.deltaMs;
    this.cpuMs += frame.cpuMs;
    if (frame.deltaMs > this.worstMs) this.worstMs = frame.deltaMs;
    if (this.since === 0) this.since = now;
    if (now - this.since < REFRESH_MS) return;

    const info = renderer.info;
    this.fps = (this.frames * 1000) / (now - this.since);
    this.text.textContent =
      `fps ${this.fps.toFixed(0)}\n` +
      `frame ${(this.wallMs / this.frames).toFixed(1)} ms (worst ${this.worstMs.toFixed(0)})\n` +
      `cpu ${(this.cpuMs / this.frames).toFixed(1)} ms\n` +
      `calls ${info.render.calls}\n` +
      `tris ${info.render.triangles.toLocaleString('en-US')}\n` +
      `geom ${info.memory.geometries}  tex ${info.memory.textures}\n` +
      `dpr ${renderer.getPixelRatio()}`;

    this.frames = 0;
    this.wallMs = 0;
    this.cpuMs = 0;
    this.worstMs = 0;
    this.since = now;
  }

  dispose(): void {
    this.root.remove();
  }
}
