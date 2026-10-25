import { LOGIC_GATES, testHalfAdder, type CircuitOutput, type LogicGate } from '../world/halfAdder.js';

const COLORS = { AND: 'blue', OR: 'red', XOR: 'purple', NOT: 'green' } as const;
const SYMBOLS: Record<LogicGate, string> = {
  AND: '<path d="M18 8H31A17 17 0 0 1 31 42H18Z"/>',
  OR: '<path d="M16 8Q39 8 50 25Q39 42 16 42Q28 25 16 8Z"/>',
  XOR: '<path d="M18 8Q41 8 52 25Q41 42 18 42Q30 25 18 8ZM12 8Q24 25 12 42"/>',
  NOT: '<path d="M17 8L45 25L17 42Z"/><circle cx="49" cy="25" r="4"/>',
};

/** A/B fan out to two fixed output sockets; players choose the gates in those sockets. */
export class HalfAdderPuzzle {
  private readonly bank = document.getElementById('game-bank')!;
  private readonly assembly = document.getElementById('game-assembly')!;
  private readonly truth = document.getElementById('circuit-truth')!;
  private gates: Record<CircuitOutput, LogicGate | null> = { sum: null, carry: null };
  private selected: LogicGate | null = null;
  private tested = false;

  constructor(private readonly onChange: () => void) {}

  reset(): void {
    this.gates = { sum: null, carry: null };
    this.selected = null;
    this.tested = false;
    this.render();
  }

  test(): boolean {
    this.tested = true;
    this.renderTruth();
    this.truth.lastElementChild?.scrollIntoView({ block: 'nearest' });
    return testHalfAdder(this.gates).correct;
  }

  private place(output: CircuitOutput, gate: LogicGate | null): void {
    this.gates[output] = gate;
    this.selected = null;
    this.tested = false;
    this.onChange();
    this.render();
    this.assembly.querySelector<HTMLButtonElement>('[data-output="' + output + '"]')?.focus({ preventScroll: true });
  }

  private render(): void {
    this.bank.replaceChildren();
    for (const gate of LOGIC_GATES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'logic-gate game-block-' + COLORS[gate];
      button.dataset['gate'] = gate;
      button.setAttribute('aria-label', '選擇 ' + gate + ' 邏輯閘');
      button.setAttribute('aria-pressed', String(this.selected === gate));
      const leads = gate === 'NOT' ? 'M0 25H17M53 25H64' : 'M0 15H18M0 35H18M50 25H64';
      button.innerHTML = '<svg viewBox="0 0 64 50" aria-hidden="true"><path d="' + leads + '"/>' + SYMBOLS[gate] + '</svg><span>' + gate + '</span>';
      button.draggable = true;
      button.addEventListener('dragstart', event => {
        event.dataTransfer?.setData('text/plain', gate);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      });
      button.addEventListener('click', () => {
        this.selected = this.selected === gate ? null : gate;
        this.render();
        this.bank.querySelector<HTMLButtonElement>('[data-gate="' + gate + '"]')?.focus({ preventScroll: true });
      });
      this.bank.append(button);
    }
    const instruction = document.createElement('p');
    instruction.className = 'circuit-instruction';
    instruction.textContent = this.selected ? '再點選 Sum 或 Carry 的空格' : '點選邏輯閘，再點選電路空格；也可拖曳放入。NOT 僅使用 A。';
    this.bank.append(instruction);
    this.assembly.innerHTML = `<div class="circuit-board">
      <svg class="circuit-wires" viewBox="0 0 400 280" preserveAspectRatio="none" aria-hidden="true">
        <path d="M60 117H105V67H170M60 117H115V207H170"/>
        <path class="wire-b-sum" d="M60 193H125V87H170"/>
        <path class="wire-b-carry" d="M60 193H135V227H170"/>
        <path d="M290 77H340M290 217H340"/>
        <circle cx="105" cy="117" r="4"/><circle cx="135" cy="193" r="4"/>
      </svg>
      <span class="circuit-input input-a">A</span><span class="circuit-input input-b">B</span>
      <span class="circuit-output output-sum">Sum</span><span class="circuit-output output-carry">Carry</span>
    </div>`;
    const board = this.assembly.firstElementChild!;
    for (const output of ['sum', 'carry'] as const) {
      const gate = this.gates[output];
      const socket = document.createElement('button');
      socket.type = 'button';
      socket.className = 'circuit-socket socket-' + output + (gate ? ' game-block-' + COLORS[gate] : '');
      socket.dataset['output'] = output;
      if (gate) socket.dataset['gate'] = gate;
      const label = output === 'sum' ? 'Sum' : 'Carry';
      socket.textContent = gate ?? '放入邏輯閘';
      socket.setAttribute('aria-label', label + ' 邏輯閘：' + (gate ?? '空白'));
      socket.addEventListener('click', () => this.place(output, this.selected));
      socket.addEventListener('dragover', event => event.preventDefault());
      socket.addEventListener('drop', event => {
        event.preventDefault();
        const dropped = event.dataTransfer?.getData('text/plain');
        if (LOGIC_GATES.includes(dropped as LogicGate)) this.place(output, dropped as LogicGate);
      });
      board.append(socket);
      if (gate === 'NOT') board.querySelector('.wire-b-' + output)!.classList.add('wire-disconnected');
    }
    document.getElementById('game-progress')!.textContent = Object.values(this.gates).filter(Boolean).length + ' / 2';
    this.renderTruth();
  }

  private renderTruth(): void {
    this.truth.replaceChildren();
    for (const row of testHalfAdder(this.gates).rows) {
      const tr = document.createElement('tr');
      for (const value of [row.a, row.b]) {
        const td = document.createElement('td');
        td.textContent = String(value);
        tr.append(td);
      }
      for (const output of ['sum', 'carry'] as const) {
        const td = document.createElement('td');
        const correct = output === 'sum' ? row.sumCorrect : row.carryCorrect;
        td.textContent = this.tested ? String(row[output] ?? '?') : '?';
        if (this.tested) {
          td.dataset['result'] = correct ? 'correct' : 'retry';
          td.setAttribute('aria-label', td.textContent + (correct ? '，正確' : '，再試試看'));
        }
        tr.append(td);
      }
      this.truth.append(tr);
    }
  }
}
