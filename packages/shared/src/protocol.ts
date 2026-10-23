/**
 * Wire protocol shared by client and server.
 *
 * Every frame is a JSON object with a `t` discriminator. `PROTOCOL_VERSION` is
 * bumped on any breaking change so a stale client is told to reload rather
 * than failing in some confusing way.
 *
 * Nothing here trusts the client. Positions arrive as claims the server checks
 * against the map and a speed limit; text arrives as bytes the server
 * sanitizes. The parsers below reject what they do not recognize rather than
 * passing unknown fields through.
 */

export const PROTOCOL_VERSION = 2;

export const EMOTES = ['wave', 'heart', 'laugh', 'sleep'] as const;
export type Emote = (typeof EMOTES)[number];

export const DIRECTIONS = ['down', 'up', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Avatar parts, as chosen in the avatar builder. */
export interface AvatarSpec {
  body: number;
  shirt: number;
  hat: string;
  accessory: string;
}

/** Everything one player needs in order to draw another. */
export interface PlayerState {
  id: string;
  nick: string;
  avatar: AvatarSpec;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
}

/** The compact per-tick form; full state only arrives on join. */
export interface PlayerUpdate {
  id: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
}

/* ------------------------------------------------------------------ */
/* Client -> Server                                                    */
/* ------------------------------------------------------------------ */

export interface HelloMessage {
  t: 'hello';
  protocol: number;
}

/** Enter the world. Sent after the player picks a name and an avatar. */
export interface JoinMessage {
  t: 'join';
  nick: string;
  avatar: AvatarSpec;
}

/** The client's claim about where it now is. The server checks it. */
export interface MoveMessage {
  t: 'move';
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
}

export interface ChatMessage {
  t: 'chat';
  text: string;
}

export interface EmoteMessage {
  t: 'emote';
  kind: Emote;
}

export interface PingMessage {
  t: 'ping';
  /** Client-chosen timestamp, echoed back verbatim in `pong`. */
  at: number;
}

export type ClientMessage =
  | HelloMessage
  | JoinMessage
  | MoveMessage
  | ChatMessage
  | EmoteMessage
  | PingMessage;

/* ------------------------------------------------------------------ */
/* Server -> Client                                                    */
/* ------------------------------------------------------------------ */

/** Protocol accepted. The join screen can now show how busy the town is. */
export interface ReadyMessage {
  t: 'ready';
  protocol: number;
  playerCount: number;
  maxPlayers: number;
}

/** The player is in. Carries their spawn and everyone already present. */
export interface WelcomeMessage {
  t: 'welcome';
  selfId: string;
  tick: number;
  you: { x: number; y: number };
  players: PlayerState[];
}

export interface PlayerJoinedMessage {
  t: 'playerJoined';
  player: PlayerState;
}

export interface PlayerLeftMessage {
  t: 'playerLeft';
  id: string;
}

/** Positions of everyone except the recipient, once per server tick. */
export interface StateMessage {
  t: 'state';
  tick: number;
  players: PlayerUpdate[];
}

/** The server rejected a claimed position; this is where the player really is. */
export interface CorrectionMessage {
  t: 'correction';
  x: number;
  y: number;
}

export interface ChatRelayMessage {
  t: 'chat';
  id: string;
  text: string;
}

export interface EmoteRelayMessage {
  t: 'emote';
  id: string;
  kind: Emote;
}

export interface PlayerCountMessage {
  t: 'playerCount';
  playerCount: number;
}

export interface PongMessage {
  t: 'pong';
  at: number;
  serverTime: number;
}

export type ServerErrorCode =
  | 'room_full'
  | 'bad_protocol'
  | 'bad_message'
  | 'bad_nickname'
  | 'rate_limited'
  | 'already_joined';

/**
 * A terminal or advisory error. After a `fatal` error the server closes the
 * socket and the client should stop reconnecting.
 */
export interface ErrorMessage {
  t: 'error';
  code: ServerErrorCode;
  message: string;
  fatal: boolean;
}

export type ServerMessage =
  | ReadyMessage
  | WelcomeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | StateMessage
  | CorrectionMessage
  | ChatRelayMessage
  | EmoteRelayMessage
  | PlayerCountMessage
  | PongMessage
  | ErrorMessage;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Hard cap on an inbound frame, so a huge payload cannot be used to spam us. */
export const MAX_FRAME_BYTES = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function direction(value: unknown): Direction | null {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value)
    ? (value as Direction)
    : null;
}

/**
 * Normalize an avatar from an untrusted source.
 *
 * Out-of-range parts are wrapped rather than rejected: a slightly wrong avatar
 * is not worth dropping a player over, and the client clamps the same way.
 */
function avatar(value: unknown): AvatarSpec {
  const source = isRecord(value) ? value : {};
  const body = finiteNumber(source['body']) ?? 0;
  const shirt = finiteNumber(source['shirt']) ?? 0;
  return {
    body: Math.abs(Math.trunc(body)) % 64,
    shirt: Math.abs(Math.trunc(shirt)) % 64,
    hat: typeof source['hat'] === 'string' ? source['hat'].slice(0, 16) : 'none',
    accessory:
      typeof source['accessory'] === 'string'
        ? source['accessory'].slice(0, 16)
        : 'none',
  };
}

/**
 * Parse an untrusted inbound frame into a `ClientMessage`.
 * Returns `null` for anything unrecognized or malformed.
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
    case 'hello': {
      const protocol = finiteNumber(value['protocol']);
      return protocol === null ? null : { t: 'hello', protocol };
    }
    case 'join': {
      if (typeof value['nick'] !== 'string') return null;
      return { t: 'join', nick: value['nick'], avatar: avatar(value['avatar']) };
    }
    case 'move': {
      const x = finiteNumber(value['x']);
      const y = finiteNumber(value['y']);
      const dir = direction(value['dir']);
      if (x === null || y === null || dir === null) return null;
      return { t: 'move', x, y, dir, moving: value['moving'] === true };
    }
    case 'chat': {
      if (typeof value['text'] !== 'string') return null;
      return { t: 'chat', text: value['text'] };
    }
    case 'emote': {
      const kind = value['kind'];
      if (typeof kind !== 'string' || !(EMOTES as readonly string[]).includes(kind)) {
        return null;
      }
      return { t: 'emote', kind: kind as Emote };
    }
    case 'ping': {
      const at = finiteNumber(value['at']);
      return at === null ? null : { t: 'ping', at };
    }
    default:
      return null;
  }
}

const SERVER_TYPES: ReadonlySet<string> = new Set([
  'ready',
  'welcome',
  'playerJoined',
  'playerLeft',
  'state',
  'correction',
  'chat',
  'emote',
  'playerCount',
  'pong',
  'error',
]);

/** Parse an inbound frame from the server. Returns `null` when unrecognized. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const type = value['t'];
  if (typeof type !== 'string' || !SERVER_TYPES.has(type)) return null;
  return value as unknown as ServerMessage;
}

/* ------------------------------------------------------------------ */
/* Text handling                                                       */
/* ------------------------------------------------------------------ */

/**
 * Characters that must never survive into a bubble or a name: C0 and C1
 * control codes, the bidi controls that can be used to disguise text, and the
 * zero-width characters that fake whitespace.
 */
// Matching control characters is the entire point of this pattern.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Strip unsafe characters and collapse runs of whitespace.
 *
 * Applied on the server before anything is relayed, so every client renders
 * text that is already safe; clients additionally render it with
 * `textContent`, never `innerHTML`.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return input
    .replace(UNSAFE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
