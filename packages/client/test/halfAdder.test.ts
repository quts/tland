import { describe, expect, it } from 'vitest';
import { evaluateGate, LOGIC_GATES, testHalfAdder } from '../src/world/halfAdder.js';

describe('half adder simulation', () => {
  it('evaluates all gate truth tables, with NOT taking A only', () => {
    const inputs = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;
    expect(LOGIC_GATES.map(g => inputs.map(([a, b]) => evaluateGate(g, a, b)))).toEqual([
      [0, 0, 0, 1], [0, 1, 1, 1], [0, 1, 1, 0], [1, 1, 0, 0],
    ]);
  });
  it('computes the four real half adder outputs', () => {
    const result = testHalfAdder({ sum: 'XOR', carry: 'AND' });
    expect(result.correct).toBe(true);
    expect(result.rows.map(r => [r.a, r.b, r.sum, r.carry])).toEqual([
      [0, 0, 0, 0], [0, 1, 1, 0], [1, 0, 1, 0], [1, 1, 0, 1],
    ]);
  });
  it('rejects every other gate pairing, including an OR sum that fails only at 1+1', () => {
    for (const sum of LOGIC_GATES) for (const carry of LOGIC_GATES) {
      expect(testHalfAdder({ sum, carry }).correct).toBe(sum === 'XOR' && carry === 'AND');
    }
    const wrong = testHalfAdder({ sum: 'OR', carry: 'AND' });
    expect(wrong.rows.map(r => r.sumCorrect)).toEqual([true, true, true, false]);
    expect(wrong.rows[3]!.sum).toBe(1);
  });
  it('retains unknown outputs for missing connections and rejects incomplete circuits', () => {
    const result = testHalfAdder({ sum: null, carry: 'AND' });
    expect(result.correct).toBe(false);
    expect(result.rows.map(r => r.sum)).toEqual([null, null, null, null]);
  });
});
