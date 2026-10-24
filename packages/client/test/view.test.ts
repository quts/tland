import { describe, expect, it } from 'vitest';
import { debugEnabled, selectView, withView, type ViewKind, type ViewMemory } from '../src/view.js';

function memory(initial: string | null = null): ViewMemory & { stored: string | null } {
  return {
    stored: initial,
    get() {
      return this.stored;
    },
    set(view: ViewKind) {
      this.stored = view;
    },
  };
}

describe('renderer selection', () => {
  it('defaults to 3D', () => {
    expect(selectView('')).toBe('3d');
    expect(selectView('?debug=1')).toBe('3d');
    expect(selectView('', memory())).toBe('3d');
  });

  it('opts into 2D with view=2d, and into 3D with view=3d', () => {
    expect(selectView('?view=2d')).toBe('2d');
    expect(selectView('?debug=1&view=2D')).toBe('2d');
    expect(selectView('?view=3d')).toBe('3d');
  });

  it('ignores anything else rather than failing', () => {
    for (const search of ['?view=', '?view=4d', '?view=2d2d', '?2d']) {
      expect(selectView(search)).toBe('3d');
    }
  });

  it('remembers a view named in the address for the next plain visit', () => {
    const remembered = memory();
    expect(selectView('?view=2d', remembered)).toBe('2d');
    expect(remembered.stored).toBe('2d');
    expect(selectView('', remembered)).toBe('2d');

    // Asking for 3D again replaces the remembered choice.
    expect(selectView('?view=3d', remembered)).toBe('3d');
    expect(selectView('', remembered)).toBe('3d');
  });

  it('lets the address override what was remembered', () => {
    expect(selectView('?view=3d', memory('2d'))).toBe('3d');
  });

  it('ignores a remembered value it does not recognise', () => {
    expect(selectView('', memory('vr'))).toBe('3d');
  });

  it('reads the debug flag', () => {
    expect(debugEnabled('?debug=1')).toBe(true);
    expect(debugEnabled('?view=3d&debug=true')).toBe(true);
    expect(debugEnabled('?debug=0')).toBe(false);
    expect(debugEnabled('')).toBe(false);
  });

  it('names a view in the address without losing other parameters', () => {
    expect(withView('https://town.example/?debug=1', '2d')).toBe(
      'https://town.example/?debug=1&view=2d',
    );
    expect(withView('https://town.example/?view=2d&debug=1', '3d')).toBe(
      'https://town.example/?view=3d&debug=1',
    );
  });
});
