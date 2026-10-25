import { describe, expect, it } from 'vitest';
import { ADDITION_GAME, BAR_GAMES, FIBONACCI_GAME, isCorrectOrder, placeGameBlock } from '../src/world/barGames.js';
import { HOUSE_DATA } from '../src/world/buildingLayout.js';

describe('bar block games', () => {
  it('routes Moore to Fibonacci and all eleven other houses to the placeholder', () => {
    expect(Object.keys(BAR_GAMES)).toEqual(HOUSE_DATA.houses.map(h => h.name));
    expect(BAR_GAMES['Moore House']).toBe(FIBONACCI_GAME);
    expect(Object.values(BAR_GAMES).filter(g => g === ADDITION_GAME)).toHaveLength(11);
  });
  it('accepts only the complete Fibonacci function in the correct order', () => {
    const game = FIBONACCI_GAME;
    expect(isCorrectOrder(game, ['define', 'if', 'base', 'else', 'recur', 'end'])).toBe(true);
    expect(isCorrectOrder(game, game.blocks.map(b => b.id))).toBe(false);
    expect(isCorrectOrder(game, ['define', 'if', 'base', 'else', 'recur', null])).toBe(false);
    expect(isCorrectOrder(game, ['define', 'if', 'base', 'else', 'recur', 'recur'])).toBe(false);
    expect(isCorrectOrder(game, game.correctOrder.slice(1))).toBe(false);
    expect(game.blocks.find(b => b.id === 'if')!.label).toContain('n ≤ 1');
  });
  it('requires the 2 block for addition', () => {
    expect(ADDITION_GAME.blocks.map(b => b.label)).toEqual(['2']);
    expect(isCorrectOrder(ADDITION_GAME, [null])).toBe(false);
    expect(isCorrectOrder(ADDITION_GAME, ['two'])).toBe(true);
  });
  it('moves and swaps blocks without duplicates or mutating the previous answer', () => {
    const slots = ['define', null, 'if', null, null, null];
    const moved = placeGameBlock(FIBONACCI_GAME, slots, 'if', 1);
    expect(moved).toEqual(['define', 'if', null, null, null, null]);
    expect(slots[2]).toBe('if');
    expect(placeGameBlock(FIBONACCI_GAME, moved, 'define', 1)).toEqual(['if', 'define', null, null, null, null]);
    expect(placeGameBlock(FIBONACCI_GAME, moved, 'base', 1)).toEqual(['define', 'base', null, null, null, null]);
    for (const target of [-1, 6, 0.5]) expect(placeGameBlock(FIBONACCI_GAME, moved, 'base', target)).toEqual(moved);
    expect(placeGameBlock(FIBONACCI_GAME, moved, 'foreign', 1)).toEqual(moved);
  });
});
