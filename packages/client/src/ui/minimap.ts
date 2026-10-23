import { TILE_SIZE, getTownMap, type Terrain } from '@tland/shared';

/**
 * Minimap: the terrain painted once, with live dots on top.
 *
 * The terrain never changes, so it is rendered to an offscreen canvas at one
 * pixel per tile and blitted each frame; only the dots are redrawn.
 */
const TERRAIN_COLORS: Record<Terrain, string> = {
  grass: '#a9dcc0',
  sand: '#f0e0bd',
  water: '#8fcfe3',
  hill: '#8fc9a8',
  path: '#eadbbd',
  bridge: '#c9a87c',
  building: '#e5d9c4',
  park: '#b9e7c6',
};

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly toggle: HTMLButtonElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly terrain: HTMLCanvasElement;
  private readonly map = getTownMap();
  private visible = false;

  constructor(canvas: HTMLCanvasElement, toggle: HTMLButtonElement) {
    this.canvas = canvas;
    this.toggle = toggle;
    this.canvas.width = this.map.width;
    this.canvas.height = this.map.height;
    this.ctx = canvas.getContext('2d');
    this.terrain = this.paintTerrain();

    this.toggle.addEventListener('click', () => this.setVisible(!this.visible));
    this.toggle.setAttribute('aria-pressed', 'false');
  }

  show(): void {
    this.toggle.hidden = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.hidden = !visible;
    this.toggle.setAttribute('aria-pressed', String(visible));
  }

  /** Positions are in world pixels. */
  draw(self: { x: number; y: number }, others: Iterable<{ x: number; y: number }>): void {
    if (!this.visible || this.ctx === null) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.terrain, 0, 0);

    ctx.fillStyle = '#7a6c5a';
    for (const other of others) {
      ctx.fillRect(
        Math.round(other.x / TILE_SIZE) - 1,
        Math.round(other.y / TILE_SIZE) - 1,
        2,
        2,
      );
    }

    // The player last and larger, so they are never hidden under a crowd.
    const x = Math.round(self.x / TILE_SIZE);
    const y = Math.round(self.y / TILE_SIZE);
    ctx.fillStyle = '#4b4033';
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = '#f3b8bf';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  private paintTerrain(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.map.width;
    canvas.height = this.map.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return canvas;

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        ctx.fillStyle = TERRAIN_COLORS[this.map.terrainAt(x, y)];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }
}
