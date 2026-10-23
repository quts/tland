/** Shared world and gameplay constants. Keep client and server in lockstep. */

/** Pixel size of one map tile. */
export const TILE_SIZE = 32;

/** Map dimensions in tiles. */
export const MAP_WIDTH = 160;
export const MAP_HEIGHT = 120;

/** Server simulation/broadcast rate. */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

/** Walking speed, in tiles per second. */
export const WALK_SPEED = 4;

/**
 * Tolerance applied on top of WALK_SPEED when the server validates a client
 * position, to absorb jitter and clock drift without allowing teleports.
 */
export const SPEED_TOLERANCE = 1.35;

/** One shared room. */
export const MAX_PLAYERS = 50;

/** Proximity chat radii, in tiles. Hysteresis: enter < exit. */
export const PROXIMITY_ENTER_RADIUS = 3;
export const PROXIMITY_EXIT_RADIUS = 4;

/** Speech bubble lifetime. */
export const BUBBLE_TTL_MS = 6000;

/** Chat constraints. */
export const CHAT_MAX_LENGTH = 120;
export const CHAT_RATE_LIMIT_MESSAGES = 5;
export const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;

/** Nickname constraints. */
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 16;

/** Client-side device pixel ratio cap, for performance on mobile. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** WebSocket path, reverse-proxied by the web service. */
export const WS_PATH = '/ws';
