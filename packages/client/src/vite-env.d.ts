/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute WebSocket URL of the game server, for deployments where the
   * static files and the game server live on different hosts — for example
   * the client on a static host that cannot keep a socket open, with the
   * server on a small always-on machine.
   *
   * Leave it unset for the container deployment, where nginx proxies `/ws`
   * on the same origin.
   *
   * Example: `wss://town-game.example.com`
   */
  readonly VITE_GAME_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
