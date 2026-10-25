import { describe, expect, it } from 'vitest';
import { BAR_IMAGE, BAR_INTERIORS } from '../src/world/barInteriors.js';
import { HOUSE_DATA } from '../src/world/buildingLayout.js';

describe('bar interiors', () => {
  it('assigns each current house a different reference panel in stable order', () => {
    expect(BAR_INTERIORS.map(bar => bar.house)).toEqual(HOUSE_DATA.houses.map(h => h.name));
    expect(BAR_INTERIORS).toHaveLength(12);
    expect(new Set(BAR_INTERIORS.map(bar => bar.viewBox)).size).toBe(12);
    expect(new Set(BAR_INTERIORS.map(bar => bar.style)).size).toBe(12);
    expect(BAR_IMAGE).toBe('/images/bar-interiors-reference.jpg');
  });
  it('keeps each image window inside the supplied image and excludes the sheet header', () => {
    for (const bar of BAR_INTERIORS) {
      const [x, y, width, height] = bar.viewBox.split(' ').map(Number);
      expect(x!).toBeGreaterThanOrEqual(0);
      expect(y!).toBeGreaterThan(40);
      expect(width!).toBeGreaterThan(300);
      expect(height!).toBeGreaterThan(200);
      expect(x! + width!).toBeLessThanOrEqual(1280);
      expect(y! + height!).toBeLessThanOrEqual(853);
    }
  });
});
