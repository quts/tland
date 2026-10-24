import { BUBBLE_TTL_MS, type Emote } from '@tland/shared';
import { emoteCanvas } from '../gfx/emotes.js';
import { worldToScreen, ndcToCss, type CameraView, type Vec2, type Vec3 } from './cameraRig.js';

const EMOTE_SIZE = 34;
const EMOTE_MS = 1900;
const FADE_MS = 450;
/** Keep a tag drawn this far past the screen edge, so it slides off rather than pops. */
const EDGE_MARGIN = 80;

interface Entry {
  readonly anchor: HTMLElement;
  readonly tag: HTMLElement;
  bubble: HTMLElement | null;
  bubbleTimers: number[];
  emote: HTMLElement | null;
  emoteTimer: number;
  /** Last transform written, rounded, so unchanged frames write nothing. */
  lastX: number;
  lastY: number;
  shown: boolean;
}

const point: Vec3 = { x: 0, y: 0, z: 0 };
const ndc: Vec2 = { x: 0, y: 0 };
const css: Vec2 = { x: 0, y: 0 };

/**
 * Name tags, speech bubbles and emotes for the 3D view, as plain DOM laid
 * over the canvas.
 *
 * Text is crisp at any zoom and uses the page's own font, and nothing here
 * ever builds markup: every string goes in through textContent. Each entry
 * is one absolutely positioned element moved with a transform, and only
 * when it actually moved.
 */
export class WorldOverlay {
  readonly root: HTMLElement;
  private readonly entries = new Map<string, Entry>();

  constructor(after: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'world-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    after.insertAdjacentElement('afterend', this.root);
  }

  add(id: string, nickname: string): void {
    this.remove(id);
    const anchor = document.createElement('div');
    anchor.className = 'overlay-anchor';
    anchor.hidden = true;
    const tag = document.createElement('span');
    tag.className = 'name-tag';
    tag.textContent = nickname;
    anchor.append(tag);
    this.root.append(anchor);
    this.entries.set(id, {
      anchor,
      tag,
      bubble: null,
      bubbleTimers: [],
      emote: null,
      emoteTimer: 0,
      lastX: NaN,
      lastY: NaN,
      shown: false,
    });
  }

  setNickname(id: string, nickname: string): void {
    const entry = this.entries.get(id);
    if (entry !== undefined) entry.tag.textContent = nickname;
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.clearBubble(entry);
    window.clearTimeout(entry.emoteTimer);
    entry.anchor.remove();
    this.entries.delete(id);
  }

  say(id: string, text: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.clearBubble(entry);
    const bubble = document.createElement('div');
    bubble.className = 'bubble3d';
    bubble.textContent = text;
    entry.anchor.prepend(bubble);
    entry.bubble = bubble;
    entry.bubbleTimers.push(
      window.setTimeout(() => bubble.classList.add('is-fading'), BUBBLE_TTL_MS - FADE_MS),
      window.setTimeout(() => {
        if (entry.bubble === bubble) this.clearBubble(entry);
      }, BUBBLE_TTL_MS),
    );
  }

  emote(id: string, kind: Emote): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    entry.emote?.remove();
    window.clearTimeout(entry.emoteTimer);
    const pop = document.createElement('div');
    pop.className = 'emote3d';
    pop.append(emoteCanvas(kind, EMOTE_SIZE));
    entry.anchor.append(pop);
    entry.emote = pop;
    entry.emoteTimer = window.setTimeout(() => {
      pop.remove();
      if (entry.emote === pop) entry.emote = null;
    }, EMOTE_MS);
  }

  /**
   * Put one entry over the point (x, y, z), in tiles. Hidden when that point
   * is behind the camera or well off screen.
   */
  place(id: string, x: number, y: number, z: number, view: CameraView, width: number, height: number): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    point.x = x;
    point.y = y;
    point.z = z;
    let visible = worldToScreen(point, view, ndc);
    if (visible) {
      ndcToCss(ndc.x, ndc.y, width, height, css);
      visible =
        css.x > -EDGE_MARGIN && css.x < width + EDGE_MARGIN &&
        css.y > -EDGE_MARGIN && css.y < height + EDGE_MARGIN * 3;
    }
    if (visible !== entry.shown) {
      entry.anchor.hidden = !visible;
      entry.shown = visible;
    }
    if (!visible) return;
    const rx = Math.round(css.x);
    const ry = Math.round(css.y);
    if (rx === entry.lastX && ry === entry.lastY) return;
    entry.lastX = rx;
    entry.lastY = ry;
    entry.anchor.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    // Lower on screen is nearer the camera: draw it over the ones behind.
    entry.anchor.style.zIndex = String(Math.max(0, ry + EDGE_MARGIN));
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    this.root.remove();
  }

  private clearBubble(entry: Entry): void {
    for (const timer of entry.bubbleTimers) window.clearTimeout(timer);
    entry.bubbleTimers = [];
    entry.bubble?.remove();
    entry.bubble = null;
  }
}
