import { HALF_ADDER_GAME } from './halfAdder.js';
import { HOUSE_DATA } from './buildingLayout.js';

export interface GameBlock {
  readonly id: string;
  readonly label: string;
  readonly color: 'purple' | 'blue' | 'orange' | 'green';
}
export interface BlockGame {
  readonly kind: 'blocks';
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly reference: string;
  readonly blocks: readonly GameBlock[];
  readonly correctOrder: readonly string[];
  readonly functionFrame?: { readonly start: string; readonly end: string };
  readonly exampleGraph?: boolean;
}

export const FIBONACCI_GAME: BlockGame = {
  kind: 'blocks',
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

export const PARITY_GAME: BlockGame = {
  kind: 'blocks',
  id: 'parity',
  title: '奇數還是偶數？',
  question: '給你一個數字 n，你能幫我判斷它是奇數還是偶數嗎？把積木排成正確順序吧！',
  reference: '偶數回傳 True，奇數回傳 False。',
  functionFrame: { start: '定義函式 isEven(n)', end: '結束函式' },
  blocks: [
    { id: 'false', label: '回傳 False', color: 'blue' },
    { id: 'else', label: '否則', color: 'orange' },
    { id: 'if', label: '如果 n % 2 == 0', color: 'blue' },
    { id: 'true', label: '回傳 True', color: 'blue' },
  ],
  correctOrder: ['if', 'true', 'else', 'false'],
};

export const DIJKSTRA_GAME: BlockGame = {
  kind: 'blocks',
  id: 'dijkstra',
  title: 'Dijkstra 最短路徑',
  question: '從起點 s 出發，將積木排成正確順序，求出到所有節點的最短距離。圖中的邊權重皆為正數。',
  reference: '',
  functionFrame: { start: '輸入：圖與起點 s', end: '輸出：每個節點的最短距離 dist' },
  exampleGraph: true,
  // Keep the bank mixed so it does not reveal the solution.
  blocks: [
    { id: 'source-zero', label: 'dist[s] = 0', color: 'purple' },
    { id: 'if-shorter', label: '如果 dist[v] > dist[u] + w(u, v)', color: 'blue' },
    { id: 'visit-u', label: '將 u 加入已訪問集合', color: 'orange' },
    { id: 'all-inf', label: '對所有節點 v，dist[v] = ∞', color: 'purple' },
    { id: 'relax', label: '更新 dist[v] = dist[u] + w(u, v)', color: 'green' },
    { id: 'neighbors', label: '對 u 的每個未訪問鄰居 v', color: 'blue' },
    { id: 'repeat', label: '重複，直到沒有可達的未訪問節點', color: 'orange' },
    { id: 'select-min', label: '從未訪問節點選出 dist 最小的節點 u', color: 'blue' },
  ],
  correctOrder: ['all-inf', 'source-zero', 'repeat', 'select-min', 'neighbors', 'if-shorter', 'relax', 'visit-u'],
};

export const ADDITION_GAME: BlockGame = {
  kind: 'blocks',
  id: 'addition',
  title: '小小算術題',
  question: '1 + 1 = ?',
  reference: '把答案積木放進組合區，再提交答案。',
  blocks: [{ id: 'two', label: '2', color: 'green' }],
  correctOrder: ['two'],
};

export type BarGame = BlockGame | typeof HALF_ADDER_GAME;

const HOUSE_GAMES: Readonly<Record<string, BarGame>> = {
  'Wilson House': HALF_ADDER_GAME,
  'Moore House': FIBONACCI_GAME,
  'Dijkstra House': DIJKSTRA_GAME,
  'Shockley House': PARITY_GAME,
};

/** Replace a house's entry in HOUSE_GAMES when its own question is ready. */
export const BAR_GAMES: Readonly<Record<string, BarGame>> = Object.fromEntries(
  HOUSE_DATA.houses.map(house => [
    house.name, HOUSE_GAMES[house.name] ?? ADDITION_GAME,
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
