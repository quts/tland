import type { ConnectionState } from '../net/connection.js';

const STATUS_LABEL: Record<ConnectionState, string> = {
  connecting: '連線中…',
  online: '已連線',
  offline: '連線中斷，重試中…',
};

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`missing element #${id}`);
  return element as T;
}

/**
 * Thin wrapper over the DOM HUD.
 *
 * All player-authored text goes through `textContent`; this module never
 * touches `innerHTML`.
 */
export class Hud {
  private readonly statusPill = required('status-pill');
  private readonly statusText = required('status-text');
  private readonly countPill = required('count-pill');
  private readonly countText = required('count-text');
  private readonly notice = required('notice');

  setConnectionState(state: ConnectionState): void {
    this.statusPill.dataset['state'] = state;
    this.statusText.textContent = STATUS_LABEL[state];
    if (state !== 'online') this.countPill.hidden = true;
  }

  setPlayerCount(count: number): void {
    this.countText.textContent = String(count);
    this.countPill.hidden = false;
  }

  showNotice(text: string): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
  }

  hideNotice(): void {
    this.notice.hidden = true;
    this.notice.textContent = '';
  }
}
