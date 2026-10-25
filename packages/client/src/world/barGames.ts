import { HOUSE_DATA } from './buildingLayout.js';

export interface GameBlock {
  readonly id: string;
  readonly label: string;
  readonly color: 'purple' | 'blue' | 'orange' | 'green';
}
export interface BlockGame {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly reference: string;
  readonly blocks: readonly GameBlock[];
  readonly correctOrder: readonly string[];
}

export const FIBONACCI_GAME: BlockGame = {
  id: 'fibonacci',
  title: '費氏數列',
  question: '請把積木依正確順序組合，完成函式 fib(n)。輸入 n，回傳第 n 個費氏數。',
  reference: '費氏數列：0, 1, 1, 2, 3, 5, 8, 13, …',
  // Deliberately mixed: the bank is not already the answer.
  blocks: [
    { id: 'else', label: '否則', color: 'orange' },
    { id: 'recur', label: '回傳 fib(n − 1) + fib(n − 2)', color: 'purple' },
    { id: 'define', label: '定義函式 fib(n)', color: 'purple' },
    { id: 'base', label: '回傳 n', color: 'blue' },
    { id: 'end', label: '結束函式', color: 'purple' },
    { id: 'if', label: '如果 n ≤ 1', color: 'blue' },
  ],
  correctOrder: ['define', 'if', 'base', 'else', 'recur', 'end'],
};

export const ADDITION_GAME: BlockGame = {
  id: 'addition',
  title: '小小算術題',
  question: '1 + 1 = ?',
  reference: '把答案積木放進組合區，再提交答案。',
  blocks: [{ id: 'two', label: '2', color: 'green' }],
  correctOrder: ['two'],
};

/** Replace any house's entry here when its own question is ready. */
export const BAR_GAMES: Readonly<Record<string, BlockGame>> = Object.fromEntries(
  HOUSE_DATA.houses.map(house => [
    house.name, house.name === 'Moore House' ? FIBONACCI_GAME : ADDITION_GAME,
  ]),
);

export function isCorrectOrder(game: BlockGame, slots: readonly (string | null)[]): boolean {
  return slots.length === game.correctOrder.length &&
    slots.every((id, index) => id === game.correctOrder[index]);
}

/** Move, swap or insert a block without allowing duplicate/foreign blocks. */
export function placeGameBlock(
  game: BlockGame, slots: readonly (string | null)[], id: string, target: number,
): (string | null)[] {
  const next = [...slots];
  if (!game.blocks.some(block => block.id === id) ||
      !Number.isInteger(target) || target < 0 || target >= next.length) return next;
  const source = next.indexOf(id);
  if (source === target) return next;
  const displaced = next[target] ?? null;
  if (source !== -1) next[source] = displaced;
  next[target] = id;
  return next;
}
