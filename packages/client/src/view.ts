/**
 * Which renderer to start, read from the address bar.
 *
 * 2D is the default and stays the default: `?view=3d` opts in, and anything
 * else — a typo, an empty value, a stale bookmark — falls back to 2D rather
 * than to an error.
 */
export type ViewKind = '2d' | '3d';

export function selectView(search: string): ViewKind {
  const value = new URLSearchParams(search).get('view');
  return value !== null && value.trim().toLowerCase() === '3d' ? '3d' : '2d';
}

/** `?debug=1` shows the frame-rate and draw-call readout. */
export function debugEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get('debug');
  return value === '1' || value === 'true';
}

/** The same address with the view switched, keeping every other parameter. */
export function withView(href: string, view: ViewKind): string {
  const url = new URL(href);
  if (view === '2d') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  return url.toString();
}
