import { describe, expect, it } from 'vitest';
import { debugEnabled, selectView, withView } from '../src/view.js';

describe('renderer selection', () => {
  it('defaults to 2D', () => {
    expect(selectView('')).toBe('2d');
    expect(selectView('?debug=1')).toBe('2d');
  });

  it('opts into 3D only with view=3d', () => {
    expect(selectView('?view=3d')).toBe('3d');
    expect(selectView('?debug=1&view=3D')).toBe('3d');
  });

  it('treats anything else as 2D rather than an error', () => {
    for (const search of ['?view=', '?view=2d', '?view=4d', '?view=3d3d', '?3d']) {
      expect(selectView(search)).toBe('2d');
    }
  });

  it('reads the debug flag', () => {
    expect(debugEnabled('?debug=1')).toBe(true);
    expect(debugEnabled('?view=3d&debug=true')).toBe(true);
    expect(debugEnabled('?debug=0')).toBe(false);
    expect(debugEnabled('')).toBe(false);
  });

  it('switches view without losing other parameters', () => {
    expect(withView('https://town.example/?view=3d&debug=1', '2d')).toBe(
      'https://town.example/?debug=1',
    );
    expect(withView('https://town.example/?debug=1', '3d')).toBe(
      'https://town.example/?debug=1&view=3d',
    );
  });
});
