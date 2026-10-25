export type LogicGate = 'AND' | 'OR' | 'XOR' | 'NOT';
export type CircuitOutput = 'sum' | 'carry';
export type Circuit = Readonly<Record<CircuitOutput, LogicGate | null>>;
export const LOGIC_GATES: readonly LogicGate[] = ['AND', 'OR', 'XOR', 'NOT'];
export const HALF_ADDER_GAME = {
  kind: 'half-adder' as const,
  title: '來挑戰邏輯電路！',
  question: '請使用左側的邏輯閘，組出半加器的電路。兩個輸入 A、B，輸出 Sum（和）與 Carry（進位）。完成後按「測試電路」！',
  reference: '',
};
export function evaluateGate(gate: LogicGate | null, a: number, b: number): number | null {
  switch (gate) {
    case 'AND': return a & b;
    case 'OR': return a | b;
    case 'XOR': return a ^ b;
    case 'NOT': return 1 - a; // NOT has one input: A. Its B wire is disconnected in the UI.
    default: return null;
  }
}
export function testHalfAdder(circuit: Circuit) {
  const rows = ([[0, 0], [0, 1], [1, 0], [1, 1]] as const).map(([a, b]) => {
    const sum = evaluateGate(circuit.sum, a, b);
    const carry = evaluateGate(circuit.carry, a, b);
    return { a: a, b: b, sum, carry, sumCorrect: sum === (a ^ b), carryCorrect: carry === (a & b) };
  });
  return { rows, correct: rows.every(row => row.sumCorrect && row.carryCorrect) };
}
