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
 * Suppress the browser gestures that fight with a game canvas on iOS:
 * pinch zoom, double-tap zoom, and the long-press callout.
 *
 * `touch-action` in CSS covers most of this in modern Safari, but the
 * `gesture*` events still fire, and double-tap zoom needs the fast-tap guard.
 */
export function suppressBrowserGestures(target: HTMLElement): void {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    target.addEventListener(type, (event) => event.preventDefault(), {
      passive: false,
    });
  }

  target.addEventListener('contextmenu', (event) => event.preventDefault());

  // Two taps in quick succession would otherwise zoom the page.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd < 320) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Multi-touch anywhere on the document is never a page gesture here.
  document.addEventListener(
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
 */
export async function loadUiFont(): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await document.fonts.load('16px "Huninn Rounded"');
    await document.fonts.ready;
  } catch {
    // A missing font is cosmetic; the CSS fallback stack takes over.
  }
}
