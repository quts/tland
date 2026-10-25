import type { BuildingPlot } from '../world/buildingLayout.js';
import { BAR_IMAGE, BAR_INTERIORS } from '../world/barInteriors.js';

export class BarInterior {
  private readonly room = document.getElementById('bar-interior') as HTMLDialogElement;
  private readonly greeting = document.getElementById('bar-greeting') as HTMLDialogElement;
  private readonly scene = document.getElementById('bar-scene') as HTMLButtonElement;
  private readonly picture = document.getElementById('bar-picture')!;
  private readonly image = document.getElementById('bar-image')!;
  private readonly exit = document.getElementById('bar-exit') as HTMLButtonElement;
  private readonly ok = document.getElementById('bar-ok') as HTMLButtonElement;

  constructor(private readonly handlers: { onOpen(): void; onClose(): void }) {
    this.exit.addEventListener('click', () => this.close());
    this.scene.addEventListener('click', () => {
      if (this.greeting.open) return;
      this.greeting.showModal();
      this.ok.focus({ preventScroll: true });
    });
    this.ok.addEventListener('click', () => this.greeting.close());
    this.greeting.addEventListener('close', () => {
      if (this.room.open) this.scene.focus({ preventScroll: true });
    });
    this.room.addEventListener('close', () => {
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
    this.picture.setAttribute('viewBox', bar.viewBox);
    const crop = document.getElementById('bar-crop-window')!;
    const [x, y, width, height] = bar.viewBox.split(' ');
    for (const [key, value] of Object.entries({ x, y, width, height })) crop.setAttribute(key, value!);
    this.picture.setAttribute('aria-label', house.name + ' 的酒吧，' + bar.style);
    // Fetch the shared image only when an interior is first entered.
    this.image.setAttribute('href', BAR_IMAGE);
    this.handlers.onOpen();
    this.room.showModal();
    this.exit.focus({ preventScroll: true });
  }

  close(): void {
    if (this.greeting.open) this.greeting.close();
    if (this.room.open) this.room.close();
  }
}
