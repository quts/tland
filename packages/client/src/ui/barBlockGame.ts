import { ADDITION_GAME, BAR_GAMES, isCorrectOrder, placeGameBlock, type BlockGame, type GameBlock } from '../world/barGames.js';

export class BarBlockGame {
  private readonly dialog = document.getElementById('bar-game') as HTMLDialogElement;
  private readonly bank = document.getElementById('game-bank')!;
  private readonly assembly = document.getElementById('game-assembly')!;
  private readonly feedback = document.getElementById('game-feedback')!;
  private readonly reset = document.getElementById('game-reset') as HTMLButtonElement;
  private readonly submit = document.getElementById('game-submit') as HTMLButtonElement;
  private game: BlockGame | null = null;
  private slots: (string | null)[] = [];

  constructor(onClose: () => void) {
    document.getElementById('game-exit')!.addEventListener('click', () => this.close());
    this.dialog.addEventListener('close', onClose);
    this.dialog.addEventListener('keydown', event => event.stopPropagation());
    this.reset.addEventListener('click', () => {
      if (!this.game) return;
      this.slots = this.game.correctOrder.map(() => null);
      this.clearFeedback();
      this.render();
    });
    this.submit.addEventListener('click', () => {
      if (!this.game) return;
      const correct = isCorrectOrder(this.game, this.slots);
      this.feedback.textContent = correct ? '太棒了' : '你再試試看';
      this.feedback.dataset['result'] = correct ? 'correct' : 'retry';
    });
  }

  get isOpen(): boolean { return this.dialog.open; }

  open(house: string, image: string): void {
    if (this.dialog.open) return;
    this.game = BAR_GAMES[house] ?? ADDITION_GAME;
    this.slots = this.game.correctOrder.map(() => null);
    document.getElementById('game-title')!.textContent = this.game.title;
    document.getElementById('game-question')!.textContent = this.game.question;
    document.getElementById('game-reference')!.textContent = this.game.reference;
    (document.getElementById('game-backdrop') as HTMLImageElement).src = image;
    this.clearFeedback();
    this.render();
    this.dialog.showModal();
    this.reset.focus({ preventScroll: true });
  }

  close(): void { if (this.dialog.open) this.dialog.close(); }

  private clearFeedback(): void {
    this.feedback.textContent = '';
    delete this.feedback.dataset['result'];
  }

  private blockButton(block: GameBlock, action: () => void, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-block game-block-' + block.color;
    button.textContent = block.label;
    button.dataset['blockId'] = block.id;
    button.setAttribute('aria-label', label);
    button.draggable = true;
    button.addEventListener('dragstart', event => {
      event.dataTransfer?.setData('text/plain', block.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    button.addEventListener('click', action);
    return button;
  }

  private place(id: string, target: number): void {
    if (!this.game) return;
    this.slots = placeGameBlock(this.game, this.slots, id, target);
    this.clearFeedback();
    this.render();
    (this.assembly.querySelector('[data-slot="' + target + '"] button') as HTMLButtonElement | null)
      ?.focus({ preventScroll: true });
  }

  private appendFixedBlock(label: string): void {
    const block = document.createElement('div');
    block.className = 'game-block game-block-purple game-block-fixed';
    block.textContent = label;
    block.setAttribute('aria-label', '固定積木：' + label);
    this.assembly.append(block);
  }

  private render(): void {
    if (!this.game) return;
    this.bank.replaceChildren();
    this.assembly.replaceChildren();
    for (const block of this.game.blocks) {
      if (this.slots.includes(block.id)) continue;
      this.bank.append(this.blockButton(block, () => {
        const target = this.slots.indexOf(null);
        if (target !== -1) this.place(block.id, target);
      }, '加入積木：' + block.label));
    }
    if (!this.bank.childElementCount) {
      const empty = document.createElement('p');
      empty.className = 'game-bank-empty';
      empty.textContent = '積木都放好了';
      this.bank.append(empty);
    }
    if (this.game.functionFrame) this.appendFixedBlock(this.game.functionFrame.start);
    this.slots.forEach((id, index) => {
      const slot = document.createElement('div');
      slot.className = 'game-slot';
      slot.dataset['slot'] = String(index);
      slot.addEventListener('dragover', event => event.preventDefault());
      slot.addEventListener('drop', event => {
        event.preventDefault();
        this.place(event.dataTransfer?.getData('text/plain') ?? '', index);
      });
      const block = this.game!.blocks.find(item => item.id === id);
      if (block) slot.append(this.blockButton(block, () => {
        this.slots[index] = null;
        this.clearFeedback();
        this.render();
        this.bank.querySelector<HTMLButtonElement>('[data-block-id="' + block.id + '"]')?.focus({ preventScroll: true });
      }, '取回第 ' + (index + 1) + ' 個積木：' + block.label));
      else {
        const hint = document.createElement('span');
        hint.textContent = '積木 ' + (index + 1);
        slot.append(hint);
      }
      this.assembly.append(slot);
    });
    if (this.game.functionFrame) this.appendFixedBlock(this.game.functionFrame.end);
    document.getElementById('game-progress')!.textContent =
      this.slots.filter(Boolean).length + ' / ' + this.slots.length;
  }
}

