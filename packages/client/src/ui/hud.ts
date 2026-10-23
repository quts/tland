import type { ConnectionState } from '../net/connection.js';

const STATUS_LABEL: Record<ConnectionState, string> = {
  connecting: '連線中…',
  online: '已連線',
  offline: '連線中斷，重試中…',
  unreachable: '找不到遊戲伺服器',
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
  private readonly joystick = required('joystick');
  private readonly zoneBanner = required('zone-banner');
  private zoneTimer: number | null = null;

  private state: ConnectionState = 'connecting';
  private count = 0;

  get connectionState(): ConnectionState {
    return this.state;
  }

  get playerCount(): number {
    return this.count;
  }

  setConnectionState(state: ConnectionState): void {
    this.state = state;
    // The pill only has three looks; an unreachable server is a kind of offline.
    this.statusPill.dataset['state'] = state === 'unreachable' ? 'offline' : state;
    this.statusText.textContent = STATUS_LABEL[state];
    if (state !== 'online') this.countPill.hidden = true;
  }

  setPlayerCount(count: number): void {
    this.count = count;
    this.countText.textContent = String(count);
    this.countPill.hidden = false;
  }

  showJoystick(): void {
    this.joystick.hidden = false;
  }

  /**
   * Announce the district the player just walked into.
   *
   * The banner is removed from the flow after it fades, so it never sits
   * invisibly over the world catching taps.
   */
  showZone(name: string | null): void {
    if (this.zoneTimer !== null) {
      clearTimeout(this.zoneTimer);
      this.zoneTimer = null;
    }
    if (name === null) {
      this.zoneBanner.classList.remove('is-visible');
      this.zoneTimer = window.setTimeout(() => {
        this.zoneBanner.hidden = true;
      }, 300);
      return;
    }

    this.zoneBanner.textContent = name;
    this.zoneBanner.hidden = false;
    // Let the element lay out before the transition starts.
    requestAnimationFrame(() => this.zoneBanner.classList.add('is-visible'));
    this.zoneTimer = window.setTimeout(() => {
      this.zoneBanner.classList.remove('is-visible');
      this.zoneTimer = window.setTimeout(() => {
        this.zoneBanner.hidden = true;
      }, 300);
    }, 2200);
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
