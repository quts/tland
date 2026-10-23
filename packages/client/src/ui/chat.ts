import { CHAT_MAX_LENGTH, EMOTES, type Emote } from '@tland/shared';
import { EMOTE_LABELS, emoteCanvas } from '../gfx/emotes.js';

/**
 * The chat field and the emote buttons.
 *
 * The field is collapsed behind a button until it is needed, because a text
 * input pinned above the joystick eats a third of a phone screen. While it is
 * open the dock rides on `--vv-offset-bottom`, which tracks the iOS keyboard.
 */
export class ChatDock {
  private readonly dock: HTMLElement;
  private readonly openButton: HTMLButtonElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly emoteBar: HTMLElement;

  constructor(
    elements: {
      dock: HTMLElement;
      openButton: HTMLButtonElement;
      form: HTMLFormElement;
      input: HTMLInputElement;
      emoteBar: HTMLElement;
    },
    private readonly handlers: {
      onSay(text: string): void;
      onEmote(kind: Emote): void;
    },
  ) {
    this.dock = elements.dock;
    this.openButton = elements.openButton;
    this.form = elements.form;
    this.input = elements.input;
    this.emoteBar = elements.emoteBar;

    this.openButton.addEventListener('click', () => this.open());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.send();
    });
    this.input.addEventListener('blur', () => {
      // An empty field that lost focus has nothing to say; fold it away so the
      // world is not permanently covered.
      if (this.input.value.trim().length === 0) this.close();
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.input.value = '';
        this.close();
      }
    });

    this.buildEmoteButtons();
  }

  show(): void {
    this.dock.hidden = false;
    this.emoteBar.hidden = false;
  }

  open(): void {
    this.openButton.hidden = true;
    this.form.hidden = false;
    this.input.focus();
  }

  close(): void {
    this.form.hidden = true;
    this.openButton.hidden = false;
  }

  /** True while the player is typing, so movement keys go to the field. */
  get isTyping(): boolean {
    return !this.form.hidden && document.activeElement === this.input;
  }

  private send(): void {
    const text = this.input.value.trim().slice(0, CHAT_MAX_LENGTH);
    this.input.value = '';
    if (text.length > 0) this.handlers.onSay(text);
    this.input.blur();
    this.close();
  }

  private buildEmoteButtons(): void {
    for (const kind of EMOTES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'emote-button';
      button.setAttribute('aria-label', EMOTE_LABELS[kind]);
      button.title = EMOTE_LABELS[kind];
      button.append(emoteCanvas(kind, 26));
      button.addEventListener('click', () => this.handlers.onEmote(kind));
      this.emoteBar.append(button);
    }
  }
}
