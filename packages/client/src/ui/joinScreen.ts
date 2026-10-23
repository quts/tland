import {
  ACCESSORIES,
  BODY_COLORS,
  DEFAULT_AVATAR,
  HATS,
  SHIRT_COLORS,
  TEXTURE_FRAME_HEIGHT,
  TEXTURE_FRAME_WIDTH,
  type Accessory,
  type AvatarParts,
  type Hat,
} from '../gfx/avatar.js';

const HAT_LABELS: Record<Hat, string> = {
  none: '不戴',
  cap: '鴨舌帽',
  sunhat: '草帽',
  beanie: '毛帽',
  bloom: '花環',
};

const ACCESSORY_LABELS: Record<Accessory, string> = {
  none: '沒有',
  scarf: '圍巾',
  glasses: '眼鏡',
  satchel: '側背包',
  bowtie: '領結',
};

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`missing element #${id}`);
  return element as T;
}

export interface JoinScreenOptions {
  /** Render the avatar; returns the source image for the given parts. */
  renderAvatar(parts: AvatarParts): CanvasImageSource | null;
  onSubmit(nickname: string, avatar: AvatarParts): void;
}

/**
 * The join screen: pick a name and build an avatar.
 *
 * The avatar preview is the game's own generated texture scaled up on a 2D
 * canvas, so what you build here is exactly what walks around afterwards.
 */
export class JoinScreen {
  private readonly root = required('join');
  private readonly preview = required<HTMLCanvasElement>('avatar-preview');
  private readonly nickname = required<HTMLInputElement>('nickname');
  private readonly button = required<HTMLButtonElement>('join-button');
  private readonly error = required('join-error');
  private readonly count = required('join-count');

  private parts: AvatarParts = { ...DEFAULT_AVATAR };
  private ready = false;
  private submitting = false;

  constructor(private readonly options: JoinScreenOptions) {
    this.buildSwatches('pick-body', BODY_COLORS, '膚色', (index) => {
      this.parts = { ...this.parts, body: index };
    });
    this.buildSwatches('pick-shirt', SHIRT_COLORS, '衣服', (index) => {
      this.parts = { ...this.parts, shirt: index };
    });
    this.buildChips('pick-hat', HATS, HAT_LABELS, (value) => {
      this.parts = { ...this.parts, hat: value };
    });
    this.buildChips('pick-accessory', ACCESSORIES, ACCESSORY_LABELS, (value) => {
      this.parts = { ...this.parts, accessory: value };
    });

    this.nickname.addEventListener('input', () => {
      this.clearError();
      this.refreshButton();
    });
    this.nickname.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.submit();
      }
    });
    this.button.addEventListener('click', () => this.submit());
  }

  show(): void {
    this.root.hidden = false;
    this.redrawPreview();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Enable the button once the socket is up and the town has room. */
  setReady(ready: boolean, label: string): void {
    this.ready = ready;
    this.button.textContent = label;
    this.refreshButton();
  }

  setCount(playerCount: number, maxPlayers: number): void {
    this.count.textContent = `目前 ${playerCount} / ${maxPlayers} 人在鎮上`;
  }

  showError(text: string): void {
    this.error.textContent = text;
    this.error.hidden = false;
    this.submitting = false;
    this.refreshButton();
  }

  clearError(): void {
    this.error.hidden = true;
    this.error.textContent = '';
  }

  /** Redraw the preview; also called once the font and textures are ready. */
  redrawPreview(): void {
    const ctx = this.preview.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);

    const source = this.options.renderAvatar(this.parts);
    if (source === null) return;

    const scale = Math.min(
      this.preview.width / TEXTURE_FRAME_WIDTH,
      this.preview.height / TEXTURE_FRAME_HEIGHT,
    );
    const width = TEXTURE_FRAME_WIDTH * scale;
    const height = TEXTURE_FRAME_HEIGHT * scale;
    ctx.imageSmoothingEnabled = true;
    // Frame 0 is the front-facing pose.
    ctx.drawImage(
      source,
      0,
      0,
      TEXTURE_FRAME_WIDTH,
      TEXTURE_FRAME_HEIGHT,
      (this.preview.width - width) / 2,
      (this.preview.height - height) / 2,
      width,
      height,
    );
  }

  private buildSwatches(
    containerId: string,
    colors: readonly number[],
    label: string,
    onPick: (index: number) => void,
  ): void {
    const container = required(containerId);
    colors.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.style.background = `#${color.toString(16).padStart(6, '0')}`;
      button.setAttribute('aria-label', `${label} ${index + 1}`);
      button.setAttribute('aria-pressed', String(index === 0));
      button.addEventListener('click', () => {
        for (const sibling of container.children) {
          sibling.setAttribute('aria-pressed', 'false');
        }
        button.setAttribute('aria-pressed', 'true');
        onPick(index);
        this.redrawPreview();
      });
      container.append(button);
    });
  }

  private buildChips<T extends string>(
    containerId: string,
    values: readonly T[],
    labels: Record<T, string>,
    onPick: (value: T) => void,
  ): void {
    const container = required(containerId);
    values.forEach((value, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = labels[value];
      button.setAttribute('aria-pressed', String(index === 0));
      button.addEventListener('click', () => {
        for (const sibling of container.children) {
          sibling.setAttribute('aria-pressed', 'false');
        }
        button.setAttribute('aria-pressed', 'true');
        onPick(value);
        this.redrawPreview();
      });
      container.append(button);
    });
  }

  private refreshButton(): void {
    this.button.disabled =
      !this.ready || this.submitting || this.nickname.value.trim().length === 0;
  }

  private submit(): void {
    if (this.button.disabled) return;
    const nickname = this.nickname.value.trim();
    if (nickname.length === 0) return;
    this.submitting = true;
    this.refreshButton();
    // Close the iOS keyboard before the world appears behind it.
    this.nickname.blur();
    this.options.onSubmit(nickname, { ...this.parts });
  }
}
