import {
  PROTOCOL_VERSION,
  WS_PATH,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@tland/shared';

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface ConnectionHandlers {
  onState(state: ConnectionState): void;
  onMessage(message: ServerMessage): void;
  /** Called when the server refused us for good; no further reconnects. */
  onFatal(message: string): void;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const PING_INTERVAL_MS = 10_000;

function websocketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${WS_PATH}`;
}

/**
 * WebSocket client with exponential backoff.
 *
 * Safari suspends sockets when the tab goes to the background and does not
 * always fire `close`, so we treat a return to visibility as a reason to
 * verify the socket and reconnect immediately rather than waiting on a timer.
 */
export class Connection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private closedForGood = false;
  private state: ConnectionState = 'connecting';
  /** Round-trip time of the last completed ping, in ms. */
  latencyMs = 0;

  constructor(private readonly handlers: ConnectionHandlers) {}

  start(): void {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('online', this.handleOnline);
    this.open();
  }

  dispose(): void {
    this.closedForGood = true;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('online', this.handleOnline);
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.handlers.onState(state);
  }

  private open(): void {
    if (this.closedForGood) return;
    this.clearTimers();
    this.setState(this.attempt === 0 ? 'connecting' : 'connecting');

    const socket = new WebSocket(websocketUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.send({ t: 'hello', protocol: PROTOCOL_VERSION });
      this.startPinging();
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      if (message === null) return;

      if (message.t === 'welcome') this.setState('online');
      if (message.t === 'pong') {
        this.latencyMs = Math.max(0, Date.now() - message.at);
      }
      if (message.t === 'error' && message.fatal) {
        this.closedForGood = true;
        this.clearTimers();
        this.handlers.onFatal(message.message);
        return;
      }
      this.handlers.onMessage(message);
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.clearTimers();
      if (this.closedForGood) return;
      this.setState('offline');
      this.scheduleReconnect();
    };

    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.closedForGood || this.reconnectTimer !== null) return;
    // Full jitter, so a server restart does not bring every client back at once.
    const ceiling = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.attempt,
    );
    const delay = Math.random() * ceiling;
    this.attempt = Math.min(this.attempt + 1, 10);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startPinging(): void {
    this.pingTimer = window.setInterval(() => {
      this.send({ t: 'ping', at: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Coming back to the foreground: reconnect now instead of on the backoff. */
  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible' || this.closedForGood) return;
    const ready = this.socket?.readyState;
    if (ready === WebSocket.OPEN) {
      this.send({ t: 'ping', at: Date.now() });
      return;
    }
    if (ready === WebSocket.CONNECTING) return;
    this.attempt = 0;
    this.open();
  };

  private readonly handleOnline = (): void => {
    if (this.closedForGood || this.socket !== null) return;
    this.attempt = 0;
    this.open();
  };
}
