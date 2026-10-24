/**
 * A small card with a message and up to two choices, for the moments the 3D
 * view has to ask before it does something: switching to 2D when the device
 * is struggling, or explaining that the graphics were lost.
 *
 * Text goes in through textContent only.
 */
export interface PromptChoice {
  readonly label: string;
  readonly primary?: boolean;
  run(): void;
}

export class ViewPrompt {
  private root: HTMLElement | null = null;

  constructor(private readonly parent: HTMLElement) {}

  get open(): boolean {
    return this.root !== null;
  }

  show(message: string, choices: readonly PromptChoice[] = []): void {
    this.hide();
    const root = document.createElement('div');
    root.className = 'view-prompt';
    root.setAttribute('role', 'alertdialog');
    const text = document.createElement('p');
    text.className = 'view-prompt-text';
    text.textContent = message;
    root.append(text);
    if (choices.length > 0) {
      const row = document.createElement('div');
      row.className = 'view-prompt-actions';
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = choice.primary === true ? 'button-primary' : 'view-prompt-secondary';
        button.textContent = choice.label;
        button.addEventListener('click', () => {
          this.hide();
          choice.run();
        });
        row.append(button);
      }
      root.append(row);
    }
    this.parent.append(root);
    this.root = root;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}
