import type { RendererStats } from './render/renderer.js';
import type { ViewKind } from './view.js';

/**
 * A small read-only window into the running game.
 *
 * The end-to-end smoke test needs to assert that the player actually moved and
 * that a bubble actually arrived, and poking at canvas pixels for that is both
 * slow and flaky. Everything here is a getter over state the player can
 * already see on screen; nothing can be set through it.
 */
export interface TownDebugBridge {
  /** Which renderer is drawing. */
  view(): ViewKind;
  position(): { x: number; y: number };
  zone(): string | null;
  connection(): string;
  playerCount(): number;
  /** Ids of the other players currently rendered. */
  others(): string[];
  /** Text of the speech bubbles currently on screen. */
  bubbles(): string[];
  joined(): boolean;
  /** Whether a tile can be stood on, so a test can pick somewhere to walk. */
  walkable(tileX: number, tileY: number): boolean;
  /** Where a tile is on screen, in CSS pixels, so a test can tap it. */
  tileToScreen(tileX: number, tileY: number): { x: number; y: number } | null;
  /** Frame rate and draw calls, where the renderer measures them. */
  stats(): RendererStats | null;
}

declare global {
  interface Window {
    __town?: TownDebugBridge;
  }
}

export function installDebugBridge(bridge: TownDebugBridge): void {
  window.__town = bridge;
}
