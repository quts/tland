/**
 * Which renderer to start.
 *
 * 3D is the default. `?view=2d` asks for the 2D view, and `?view=3d` for 3D;
 * either one is remembered in this browser, so someone who chose 2D — say,
 * because their phone struggled with 3D — keeps it on their next visit to
 * the plain address. Anything unrecognised is ignored rather than an error.
 * Devices that cannot draw 3D at all still fall back to 2D on their own.
 */
export type ViewKind = '2d' | '3d';

export const DEFAULT_VIEW: ViewKind = '3d';

const STORAGE_KEY = 'tland:view';

/** Where a remembered choice lives; injectable so tests need no browser. */
export interface ViewMemory {
  get(): string | null;
  set(view: ViewKind): void;
}

function parse(value: string | null): ViewKind | null {
  const normalised = value?.trim().toLowerCase();
  return normalised === '2d' || normalised === '3d' ? normalised : null;
}

/** This browser's localStorage, or nothing when it is unavailable. */
export const browserMemory: ViewMemory = {
  get() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(view) {
    try {
      window.localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // Private mode or storage disabled: the choice lasts this visit only.
    }
  },
};

/**
 * The view to start: the address wins, then a remembered choice, then 3D.
 * A view named in the address is remembered for next time.
 */
export function selectView(search: string, memory?: ViewMemory): ViewKind {
  const asked = parse(new URLSearchParams(search).get('view'));
  if (asked !== null) {
    memory?.set(asked);
    return asked;
  }
  return parse(memory?.get() ?? null) ?? DEFAULT_VIEW;
}

/** `?debug=1` shows the frame-rate and draw-call readout. */
export function debugEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get('debug');
  return value === '1' || value === 'true';
}

/** The same address with the view named, keeping every other parameter. */
export function withView(href: string, view: ViewKind): string {
  const url = new URL(href);
  url.searchParams.set('view', view);
  return url.toString();
}
