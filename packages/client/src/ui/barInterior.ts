import type { BuildingPlot } from '../world/buildingLayout.js';
import { BarBlockGame } from './barBlockGame.js';
import { BAR_INTERIORS } from '../world/barInteriors.js';

export class BarInterior {
  private readonly room = document.getElementById('bar-interior') as HTMLDialogElement;
  private readonly greeting = document.getElementById('bar-greeting') as HTMLDialogElement;
  private readonly scene = document.getElementById('bar-scene') as HTMLButtonElement;
  private readonly picture = document.getElementById('bar-picture') as HTMLImageElement;
  private readonly exit = document.getElementById('bar-exit') as HTMLButtonElement;
  private readonly yes = document.getElementById('bar-yes') as HTMLButtonElement;
  private readonly game = new BarBlockGame(() => {
    if (this.room.open && !this.game.isOpen) this.scene.focus({ preventScroll: true });
  });
  private house = '';
  private image = '';

  constructor(private readonly handlers: { onOpen(): void; onClose(): void }) {
    this.exit.addEventListener('click', () => this.close());
    this.scene.addEventListener('click', () => {
      if (this.greeting.open) return;
      this.greeting.showModal();
      this.yes.focus({ preventScroll: true });
    });
    document.getElementById('bar-no')!.addEventListener('click', () => this.greeting.close());
    this.yes.addEventListener('click', () => {
      this.greeting.close();
      this.game.open(this.house, this.image);
    });
    this.greeting.addEventListener('close', () => {
      if (this.room.open && !this.game.isOpen) this.scene.focus({ preventScroll: true });
    });
    this.room.addEventListener('close', () => {
      this.game.close();
      if (this.greeting.open) this.greeting.close();
      this.handlers.onClose();
    });
    for (const dialog of [this.room, this.greeting]) {
      dialog.addEventListener('keydown', event => event.stopPropagation());
    }
  }

  get isOpen(): boolean { return this.room.open; }

  open(house: BuildingPlot): void {
    if (this.room.open) return;
    const bar = BAR_INTERIORS.find(item => item.house === house.name);
    if (!bar) return;
    this.room.setAttribute('aria-label', house.name + ' 的酒吧');
    this.picture.alt = house.name + ' 的酒吧，' + bar.style;
    // Load only the selected full-resolution asset, not a thumbnail sprite sheet.
    this.picture.src = bar.image;
    this.house = house.name;
    this.image = bar.image;
    this.handlers.onOpen();
    this.room.showModal();
    this.exit.focus({ preventScroll: true });
  }

  close(): void {
    this.game.close();
    if (this.greeting.open) this.greeting.close();
    if (this.room.open) this.room.close();
  }
}
