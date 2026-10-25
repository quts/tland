import { describe, expect, it } from 'vitest';
import { ADDITION_GAME, BAR_GAMES, FIBONACCI_GAME, PARITY_GAME, isCorrectOrder, placeGameBlock } from '../src/world/barGames.js';
import { HOUSE_DATA } from '../src/world/buildingLayout.js';

describe('bar block games', () => {
  it('routes Moore to Fibonacci and Shockley to parity and ten other houses to the placeholder', () => {
    expect(Object.keys(BAR_GAMES)).toEqual(HOUSE_DATA.houses.map(h => h.name));
    expect(BAR_GAMES['Moore House']).toBe(FIBONACCI_GAME);
    expect(BAR_GAMES['Shockley House']).toBe(PARITY_GAME);
    expect(Object.values(BAR_GAMES).filter(g => g === ADDITION_GAME)).toHaveLength(10);
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
  it('keeps parity function anchors outside the four movable blocks', () => {
    expect(PARITY_GAME.functionFrame).toEqual({ start: '定義函式 isEven(n)', end: '結束函式' });
    expect(PARITY_GAME.blocks).toHaveLength(4);
    expect(PARITY_GAME.blocks.map(b => b.label)).toEqual(['回傳 False', '否則', '如果 n % 2 == 0', '回傳 True']);
    expect(isCorrectOrder(PARITY_GAME, ['if', 'true', 'else', 'false'])).toBe(true);
    expect(isCorrectOrder(PARITY_GAME, ['if', 'false', 'else', 'true'])).toBe(false);
    expect(isCorrectOrder(PARITY_GAME, ['if', 'true', 'else', null])).toBe(false);
    expect(placeGameBlock(PARITY_GAME, [null, null, null, null], 'define', 0)).toEqual([null, null, null, null]);
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
