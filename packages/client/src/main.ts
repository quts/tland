import { CHAT_MAX_LENGTH, getTownMap, sanitizeText, type Emote } from '@tland/shared';
import { Connection } from './net/connection.js';
import { Hud } from './ui/hud.js';
import { JoinScreen } from './ui/joinScreen.js';
import { ChatDock } from './ui/chat.js';
import { Minimap } from './ui/minimap.js';
import { Joystick } from './controls/joystick.js';
import type { AvatarParts } from './gfx/avatar.js';
import { installDebugBridge } from './debugBridge.js';
import { ClientWorld } from './world/clientWorld.js';
import { Renderer2D } from './render/renderer2d.js';
import type { Renderer, RendererContext } from './render/renderer.js';
import { browserMemory, debugEnabled, selectView, withView } from './view.js';
import { loadUiFont, suppressBrowserGestures, trackVisualViewport } from './viewport.js';

/**
 * How often the client reports its position.
 *
 * The server ticks at 20 Hz, so sending faster only burns battery and
 * bandwidth; sending slower makes other people look choppy.
 */
const MOVE_SEND_INTERVAL_MS = 1000 / 15;

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`missing element #${id}`);
  return element as T;
}

/**
 * Whether this browser can create a WebGL 2 context at all — three.js needs
 * one. Checked before fetching the 3D chunk, so a device that cannot draw it
 * goes straight to 2D without downloading it first.
 */
function webgl2Available(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}

/**
 * The 3D view, if this device can show it.
 *
 * three.js and everything built on it arrive as a separate chunk, fetched
 * only here, so the 2D page never downloads them. Returns null — having left
 * the page untouched — when the chunk cannot load or WebGL is missing, so the
 * caller can carry on in 2D.
 */
async function createRenderer3D(context: RendererContext): Promise<Renderer | null> {
  if (!webgl2Available()) return null;
  try {
    const { Renderer3D } = await import('./three/renderer3d.js');
    return new Renderer3D(context);
  } catch (error) {
    console.warn('3D view unavailable, using 2D', error);
    return null;
  }
}

async function main(): Promise<void> {
  const parent = required('game');

  trackVisualViewport();
  suppressBrowserGestures(parent);
  // Measure text only once the real face is available.
  await loadUiFont();

  const hud = new Hud();
  const joystick = new Joystick(required('joystick'));
  const minimap = new Minimap(
    required<HTMLCanvasElement>('minimap'),
    required<HTMLButtonElement>('minimap-toggle'),
  );

  let joined = false;
  /** Kept so a dropped connection can walk straight back in. */
  let identity: { nickname: string; avatar: AvatarParts } | null = null;
  let lastSentAt = 0;
  let lastSent = { x: -1, y: -1, dir: '', moving: false };

  const chat = new ChatDock(
    {
      dock: required('chat-dock'),
      openButton: required<HTMLButtonElement>('chat-open'),
      form: required<HTMLFormElement>('chat-form'),
      input: required<HTMLInputElement>('chat-input'),
      emoteBar: required('emote-bar'),
    },
    {
      onSay: (text) => {
        const clean = sanitizeText(text, CHAT_MAX_LENGTH);
        if (clean.length > 0) connection.send({ t: 'chat', text: clean });
      },
      onEmote: (kind: Emote) => connection.send({ t: 'emote', kind }),
    },
  );

  const world = new ClientWorld({
    map: getTownMap(),
    onZoneChange: (zone) => hud.showZone(zone),
    onMove: (x, y, dir, moving) => {
      if (!joined) return;
      const now = performance.now();
      const changed =
        Math.abs(x - lastSent.x) > 0.5 ||
        Math.abs(y - lastSent.y) > 0.5 ||
        dir !== lastSent.dir ||
        moving !== lastSent.moving;
      if (!changed || now - lastSentAt < MOVE_SEND_INTERVAL_MS) return;
      lastSentAt = now;
      lastSent = { x, y, dir, moving };
      connection.send({ t: 'move', x, y, dir, moving });
    },
    onFrame: (self, others) => minimap.draw(self, others),
  });

  const context: RendererContext = {
    parent,
    overlay: required('app'),
    world,
    joystick,
    isTyping: () => chat.isTyping,
    debug: debugEnabled(location.search),
    switchTo2D: () => location.assign(withView(location.href, '2d')),
  };

  let renderer: Renderer | null = null;
  if (selectView(location.search, browserMemory) === '3d') {
    renderer = await createRenderer3D(context);
    if (renderer === null) {
      hud.showNotice('這台裝置沒辦法顯示 3D 畫面，先用 2D 畫面帶你進小鎮。');
      window.setTimeout(() => hud.hideNotice(), 6000);
    }
  }
  const view: Renderer = renderer ?? new Renderer2D(context);

  const joinScreen = new JoinScreen({
    renderAvatar: (parts) => view.renderAvatarPreview(parts),
    onSubmit: (nickname, avatar) => {
      identity = { nickname, avatar };
      world.setIdentity(nickname, avatar);
      connection.send({ t: 'join', nick: nickname, avatar: avatar });
    },
  });

  const connection = new Connection({
    onState: (state) => {
      hud.setConnectionState(state);
      if (state === 'online') return;
      if (state === 'unreachable') {
        // Several attempts and never a single successful connection: the
        // server is almost certainly not deployed or not reachable from here.
        // Saying so beats spinning on "reconnecting" forever.
        joinScreen.setReady(false, '找不到遊戲伺服器');
        joinScreen.showError(
          '目前連不上遊戲伺服器，所以還不能進入小鎮。如果你是自己架的，請確認遊戲伺服器有在執行。',
        );
        return;
      }
      joinScreen.setReady(false, '重新連線中…');
    },
    onMessage: (message) => {
      switch (message.t) {
        case 'ready': {
          hud.hideNotice();
          joinScreen.setCount(message.playerCount, message.maxPlayers);
          hud.setPlayerCount(message.playerCount);
          if (joined && identity !== null) {
            // The socket came back after a drop: walk straight back in.
            connection.send({
              t: 'join',
              nick: identity.nickname,
              avatar: identity.avatar,
            });
            return;
          }
          const full = message.playerCount >= message.maxPlayers;
          joinScreen.setReady(!full, full ? '小鎮客滿了' : '進入小鎮');
          return;
        }

        case 'welcome': {
          joined = true;
          world.setSelfId(message.selfId);
          world.clearEveryone();
          world.placeSelf(message.you.x, message.you.y);
          for (const player of message.players) world.addRemote(player);
          world.setActive(true);
          joinScreen.hide();
          hud.showJoystick();
          hud.setPlayerCount(message.players.length + 1);
          chat.show();
          minimap.show();
          return;
        }

        case 'playerJoined':
          world.addRemote(message.player);
          return;

        case 'playerLeft':
          world.removeRemote(message.id);
          return;

        case 'state':
          world.applyUpdates(message.players);
          return;

        case 'correction':
          world.correctSelf(message.x, message.y);
          return;

        case 'chat':
          world.say(message.id, message.text);
          return;

        case 'emote':
          world.playEmote(message.id, message.kind);
          return;

        case 'playerCount':
          hud.setPlayerCount(message.playerCount);
          return;

        default:
          return;
      }
    },
    onFatal: (text) => {
      hud.setConnectionState('offline');
      joinScreen.showError(text);
      joinScreen.setReady(false, '無法進入');
      hud.showNotice(text);
    },
  });

  void view.ready.then(() => {
    joinScreen.show();
    joinScreen.redrawPreview();
  });

  installDebugBridge({
    view: () => view.kind,
    position: () => world.getPosition(),
    zone: () => world.currentZoneName(),
    connection: () => hud.connectionState,
    playerCount: () => hud.playerCount,
    others: () => world.remoteList().map((remote) => remote.id),
    bubbles: () => world.bubbleTexts(),
    joined: () => joined,
    walkable: (x, y) => world.map.isWalkable(x, y),
    tileToScreen: (x, y) => view.tileToScreen(x, y),
    stats: () => view.stats(),
  });

  hud.setConnectionState('connecting');
  joinScreen.setReady(false, '連線中…');
  connection.start();
}

void main();
