/**
 * Wire protocol shared by client and server.
 *
 * Every frame is a JSON object with a `t` discriminator. The protocol grows
 * one milestone at a time; `PROTOCOL_VERSION` is bumped on any breaking change
 * so a stale client can be told to reload instead of failing silently.
 */

export const PROTOCOL_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Client -> Server                                                    */
/* ------------------------------------------------------------------ */

/** First frame a client sends after the socket opens. */
export interface HelloMessage {
  t: 'hello';
  protocol: number;
}

/** Liveness probe. Sent by the client so it can measure round-trip time. */
export interface PingMessage {
  t: 'ping';
  /** Client-chosen timestamp, echoed back verbatim in `pong`. */
  at: number;
}

export type ClientMessage = HelloMessage | PingMessage;

/* ------------------------------------------------------------------ */
/* Server -> Client                                                    */
/* ------------------------------------------------------------------ */

/** Sent in response to a valid `hello`. */
export interface WelcomeMessage {
  t: 'welcome';
  protocol: number;
  /** Opaque id for this connection, unique within the room. */
  selfId: string;
  /** Server tick at the moment of the welcome. */
  tick: number;
  /** Players currently in the room, including this one. */
  playerCount: number;
}

export interface PongMessage {
  t: 'pong';
  /** The `at` value from the matching `ping`. */
  at: number;
  /** Server time, for clock-offset estimation. */
  serverTime: number;
}

/** Player count changed. */
export interface PlayerCountMessage {
  t: 'playerCount';
  playerCount: number;
}

export type ServerErrorCode =
  | 'room_full'
  | 'bad_protocol'
  | 'bad_message'
  | 'rate_limited';

/**
 * A terminal or advisory error. `fatal` errors are followed by the server
 * closing the socket; the client should show `message` and not reconnect.
 */
export interface ErrorMessage {
  t: 'error';
  code: ServerErrorCode;
  /** Human-readable, already localized by the client from `code` when known. */
  message: string;
  fatal: boolean;
}

export type ServerMessage =
  | WelcomeMessage
  | PongMessage
  | PlayerCountMessage
  | ErrorMessage;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Hard cap on an inbound frame, so a huge payload cannot be used to spam us. */
export const MAX_FRAME_BYTES = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse an untrusted inbound frame into a `ClientMessage`.
 * Returns `null` for anything unrecognized or malformed; callers decide policy.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value['t']) {
    case 'hello':
      return typeof value['protocol'] === 'number'
        ? { t: 'hello', protocol: value['protocol'] }
        : null;
    case 'ping':
      return typeof value['at'] === 'number' && Number.isFinite(value['at'])
        ? { t: 'ping', at: value['at'] }
        : null;
    default:
      return null;
  }
}

/** Parse an inbound frame from the server. Returns `null` when unrecognized. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const t = value['t'];
  if (
    t === 'welcome' ||
    t === 'pong' ||
    t === 'playerCount' ||
    t === 'error'
  ) {
    return value as unknown as ServerMessage;
  }
  return null;
}
