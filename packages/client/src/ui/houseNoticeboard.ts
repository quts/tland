import { BarInterior } from './barInterior.js';
import type { BuildingPlot } from '../world/buildingLayout.js';
import { HOUSE_INTRODUCTIONS } from '../world/houseNotices.js';

export class HouseNoticeboard {
  private readonly button = document.getElementById('house-notice-open') as HTMLButtonElement;
  private readonly dialog = document.getElementById('house-notice-dialog') as HTMLDialogElement;
  private readonly title = document.getElementById('house-notice-title')!;
  private readonly content = document.getElementById('house-notice-content')!;
  private readonly closeButton = document.getElementById('house-notice-close') as HTMLButtonElement;
  private house: BuildingPlot | null = null;
  private readonly enter = document.getElementById('house-enter') as HTMLButtonElement;
  private readonly bar: BarInterior;

  constructor(private readonly handlers: { onOpen(): void; onClose(): void }) {
    this.bar = new BarInterior({
      onOpen: () => this.handlers.onOpen(),
      onClose: () => {
        this.handlers.onClose();
        if (!this.enter.hidden) this.enter.focus({ preventScroll: true });
      },
    });
    this.enter.addEventListener('click', () => { if (this.house) this.bar.open(this.house); });
    this.button.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.dialog.close());
    // Arrows scroll the story; key releases still reach the game so a key
    // held before opening cannot stay stuck after closing.
    this.dialog.addEventListener('keydown', event => event.stopPropagation());
    this.dialog.addEventListener('close', () => {
      this.handlers.onClose();
      if (!this.button.hidden) this.button.focus({ preventScroll: true });
    });
    this.dialog.addEventListener('click', event => {
      const bounds = this.dialog.getBoundingClientRect();
      if (event.target === this.dialog &&
        (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom)) this.dialog.close();
    });
  }

  get isOpen(): boolean { return this.dialog.open || this.bar.isOpen; }

  update(house: BuildingPlot | null): void {
    if (house?.name === this.house?.name) return;
    this.house = house;
    this.button.hidden = house === null;
    this.enter.hidden = house === null;
    if (this.bar.isOpen) this.bar.close();
    if (this.dialog.open) this.dialog.close();
    if (house) {
      this.button.setAttribute('aria-label', '閱讀告示牌：' + house.name);
      this.enter.setAttribute('aria-label', '進入屋子：' + house.name);
    }
  }

  private open(): void {
    if (!this.house || this.dialog.open) return;
    this.title.textContent = this.house.name;
    this.content.textContent = HOUSE_INTRODUCTIONS[this.house.name] ?? '';
    this.handlers.onOpen();
    this.dialog.showModal();
    this.content.scrollTop = 0;
    this.closeButton.focus({ preventScroll: true });
  }
}
