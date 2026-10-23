import type { Emote } from '@tland/shared';

/**
 * Emote icons, drawn on a 2D canvas.
 *
 * One drawing routine serves both the buttons in the HUD and the little icon
 * that pops above a character, so the two can never drift apart. All original
 * shapes: a waving hand, a heart, a laughing face, and a sleeping "z".
 */
export const EMOTE_LABELS: Record<Emote, string> = {
  wave: '揮手',
  heart: '愛心',
  laugh: '大笑',
  sleep: '睡覺',
};

const INK = '#4b4033';
const CREAM = '#fdf7ec';
const ROSE = '#f3b8bf';
const SKIN = '#f4b9a0';
const SUN = '#fbe8a6';
const LILAC = '#c9b6e4';

function outlined(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  fill: string,
  lineWidth = 3,
): void {
  ctx.beginPath();
  path();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Draw `kind` filling a `size` x `size` box at the origin. */
export function drawEmote(
  ctx: CanvasRenderingContext2D,
  kind: Emote,
  size: number,
): void {
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);

  switch (kind) {
    case 'wave': {
      // A hand: palm plus four fingers and a thumb.
      outlined(ctx, () => ctx.roundRect(10, 13, 14, 15, 5), SKIN);
      for (let i = 0; i < 4; i += 1) {
        outlined(ctx, () => ctx.roundRect(11 + i * 3.4, 6 + i * 0.6, 3, 10, 1.5), SKIN, 2);
      }
      outlined(ctx, () => ctx.roundRect(5, 16, 7, 4, 2), SKIN, 2);
      // Motion lines.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(26, 8);
      ctx.lineTo(29, 5);
      ctx.moveTo(27, 13);
      ctx.lineTo(31, 12);
      ctx.stroke();
      break;
    }

    case 'heart': {
      outlined(ctx, () => {
        ctx.moveTo(16, 27);
        ctx.bezierCurveTo(2, 18, 5, 6, 16, 11);
        ctx.bezierCurveTo(27, 6, 30, 18, 16, 27);
        ctx.closePath();
      }, ROSE);
      ctx.fillStyle = CREAM;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(12, 14, 2.6, 3.4, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }

    case 'laugh': {
      outlined(ctx, () => ctx.arc(16, 16, 12, 0, Math.PI * 2), SUN);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      // Happy closed eyes.
      ctx.beginPath();
      ctx.arc(11.5, 14, 3, Math.PI, 0);
      ctx.arc(20.5, 14, 3, Math.PI, 0);
      ctx.stroke();
      // Open smile.
      ctx.beginPath();
      ctx.moveTo(9, 19);
      ctx.quadraticCurveTo(16, 27, 23, 19);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      break;
    }

    case 'sleep': {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const zed = (x: number, y: number, w: number, color: string): void => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x, y + w);
        ctx.lineTo(x + w, y + w);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4.5;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      zed(16, 5, 10, CREAM);
      zed(7, 17, 8, LILAC);
      break;
    }
  }

  ctx.restore();
}

/** A standalone canvas with one emote drawn on it, at a device-pixel scale. */
export function emoteCanvas(kind: Emote, size: number, scale = 2): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.scale(scale, scale);
    drawEmote(ctx, kind, size);
  }
  return canvas;
}
