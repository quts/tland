import type { AvatarParts } from '../gfx/avatar.js';
import type { Joystick } from '../controls/joystick.js';
import type { ClientWorld } from '../world/clientWorld.js';
import type { ViewKind } from '../view.js';

/**
 * A front-facing picture of an avatar for the join screen: the region
 * `width` x `height` at the top-left of `source`.
 */
export interface AvatarImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

/** What the debug readout and the tests can ask a renderer. */
export interface RendererStats {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

/** Everything a renderer is handed. It owns none of it. */
export interface RendererContext {
  /** The element the canvas goes into (#game). */
  readonly parent: HTMLElement;
  /** The element overlays are attached to (#app). */
  readonly overlay: HTMLElement;
  readonly world: ClientWorld;
  readonly joystick: Joystick;
  /** True while a text field has focus, so typing does not walk the player. */
  isTyping(): boolean;
  readonly debug: boolean;
  /** Leave this renderer for the 2D one, by reloading the page. */
  switchTo2D(): void;
}

/**
 * One way of drawing the shared world.
 *
 * The renderer owns the frame loop: each frame it reads the player's input,
 * maps it into world axes for its own camera, calls `world.update`, and draws
 * what the world then holds. Everything the game knows lives in ClientWorld;
 * a renderer can be thrown away and replaced without losing any of it.
 */
export interface Renderer {
  readonly kind: ViewKind;
  /** Resolves once the first frame can be drawn. */
  readonly ready: Promise<void>;
  /** The avatar as it will look in this view, for the join screen. */
  renderAvatarPreview(parts: AvatarParts): AvatarImage | null;
  /** Where a tile's centre is on screen, in CSS pixels, or null if it is not. */
  tileToScreen(tileX: number, tileY: number): { x: number; y: number } | null;
  stats(): RendererStats | null;
  dispose(): void;
}
