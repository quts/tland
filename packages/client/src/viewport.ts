import { MAX_DEVICE_PIXEL_RATIO } from '@tland/shared';

/** Device pixel ratio, capped so high-DPI phones do not render 3x the pixels. */
export function resolutionCap(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
}

/**
 * Keep CSS in sync with the *visual* viewport.
 *
 * On iOS the layout viewport does not shrink when the software keyboard opens,
 * so anything pinned to the bottom ends up underneath it. `--vv-height` and
 * `--vv-offset-bottom` track the visual viewport instead and let CSS position
 * around the keyboard. Harmless on desktop, where the two viewports agree.
 */
export function trackVisualViewport(): () => void {
  const root = document.documentElement;
  const visual = window.visualViewport;

  const apply = (): void => {
    const height = visual?.height ?? window.innerHeight;
    const offsetBottom = visual
      ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop)
      : 0;
    root.style.setProperty('--vv-height', `${height}px`);
    root.style.setProperty('--vv-offset-bottom', `${offsetBottom}px`);
  };

  apply();
  visual?.addEventListener('resize', apply);
  visual?.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', apply);
  window.addEventListener('resize', apply);

  return () => {
    visual?.removeEventListener('resize', apply);
    visual?.removeEventListener('scroll', apply);
    window.removeEventListener('orientationchange', apply);
    window.removeEventListener('resize', apply);
  };
}

/**
 * Suppress the browser gestures that fight with a game canvas on iOS: pinch
 * zoom, double-tap zoom, and the long-press callout.
 *
 * Double-tap zoom is handled by `touch-action` in the stylesheet
 * (`manipulation` on the body, `none` on the canvas), which modern Safari
 * honours. The older trick of calling `preventDefault()` on every quick
 * `touchend` is deliberately not used: WebKit also suppresses the pointer
 * events that follow, so it silently breaks tap-to-move.
 *
 * The `gesture*` events are Safari-specific and are not covered by
 * `touch-action`, so they still need handling here.
 */
export function suppressBrowserGestures(target: HTMLElement): void {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    target.addEventListener(type, (event) => event.preventDefault(), {
      passive: false,
    });
  }

  target.addEventListener('contextmenu', (event) => event.preventDefault());

  // A second finger on the canvas is never a page gesture here.
  target.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
}

/**
 * Load the UI font before Phaser measures any text, so canvas text is not
 * rendered once in a fallback face and then left stale.
 *
 * Bounded by a deadline: the face is a couple of megabytes, and a slow or
 * flaky connection must not leave the player staring at a blank screen. The
 * CSS fallback stack covers the gap, and `font-display: swap` lets the real
 * face appear whenever it does arrive.
 */
export async function loadUiFont(timeoutMs = 4000): Promise<void> {
  if (!('fonts' in document)) return;
  const deadline = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([
      (async () => {
        await document.fonts.load('16px "Huninn Rounded"');
        await document.fonts.ready;
      })(),
      deadline,
    ]);
  } catch {
    // A missing font is cosmetic; the CSS fallback stack takes over.
  }
}
