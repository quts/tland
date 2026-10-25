import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@tland/shared';
import { HOUSE_DATA } from '../src/world/buildingLayout.js';
import { houseNoticeAt, HOUSE_INTRODUCTIONS } from '../src/world/houseNotices.js';

const at = (x: number, y: number) => houseNoticeAt((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
describe('house noticeboards', () => {
  it('has one supplied introduction for every current house and no removed houses', () => {
    expect(Object.keys(HOUSE_INTRODUCTIONS).sort()).toEqual(HOUSE_DATA.houses.map(h => h.name).sort());
    for (const text of Object.values(HOUSE_INTRODUCTIONS)) expect(text.length).toBeGreaterThan(100);
  });
  it.each(HOUSE_DATA.houses)('offers $name only in its immediately adjacent front row', house => {
    for (let x = house.x; x < house.x + 4; x++) {
      expect(at(x, house.y + 4)).toBe(house);
      expect(at(x, house.y - 1)).toBeNull();
      expect(at(x, house.y + 3)).toBeNull();
      expect(at(x, house.y + 5)).toBeNull();
    }
    expect(at(house.x - 1, house.y + 4)).toBeNull();
    expect(at(house.x + 4, house.y + 4)).toBeNull();
  });
  it('does not offer a notice on reclaimed ground or outside the map', () => {
    expect(at(65, 92)).toBeNull();
    expect(at(33, 104)).toBeNull();
    expect(at(41, 124)).toBeNull();
    expect(at(-1, -1)).toBeNull();
  });
});
