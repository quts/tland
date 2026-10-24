import Phaser from 'phaser';
import { CHAT_MAX_LENGTH, sanitizeText, type Emote } from '@tland/shared';
import { WorldScene } from './scenes/WorldScene.js';
import { Connection } from './net/connection.js';
import { Hud } from './ui/hud.js';
import { JoinScreen } from './ui/joinScreen.js';
import { ChatDock } from './ui/chat.js';
import { Minimap } from './ui/minimap.js';
import { Joystick } from './controls/joystick.js';
import { ResolutionController } from './scale.js';
import { avatarTextureKey, buildAvatarTexture, type AvatarParts } from './gfx/avatar.js';
import { installDebugBridge } from './debugBridge.js';
import { debugEnabled, selectView, withView } from './view.js';
import {
  loadUiFont,
  resolutionCap,
  suppressBrowserGestures,
  trackVisualViewport,
} from './viewport.js';

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
 * Start the 3D view, if this device can show it.
 *
 * three.js and everything built on it arrive as a separate chunk, fetched
 * only here, so the 2D page never downloads them. Returns false — and leaves
 * the page untouched — when the chunk cannot load or WebGL is missing, so
 * the caller can carry on into 2D.
 */
async function startThreeView(parent: HTMLElement, hud: Hud, joystick: Joystick): Promise<boolean> {
  try {
    const { startSpike } = await import('./three/spike.js');
    startSpike({
      parent,
      overlay: required('app'),
      joystick,
      hud,
      debug: debugEnabled(location.search),
      switchTo2D: () => location.assign(withView(location.href, '2d')),
    });
  } catch (error) {
    console.warn('3D view unavailable, using 2D', error);
    return false;
  }
  // M0 is a local-only spike: no server, so no connection status to show.
  required('status-pill').hidden = true;
  hud.showJoystick();
  return true;
}

async function main(): Promise<void> {
  const parent = required('game');

  trackVisualViewport();
  suppressBrowserGestures(parent);
  // Measure text only once the real face is available.
  await loadUiFont();

  const hud = new Hud();
  const joystick = new Joystick(required('joystick'));

  if (selectView(location.search) === '3d') {
    if (await startThreeView(parent, hud, joystick)) return;
    hud.showNotice('這台裝置沒辦法顯示 3D 畫面，先用 2D 畫面帶你進小鎮。');
    window.setTimeout(() => hud.hideNotice(), 6000);
  }

  const minimap = new Minimap(
    required<HTMLCanvasElement>('minimap'),
    required<HTMLButtonElement>('minimap-toggle'),
  );

  let selfId: string | null = null;
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

  const world = new WorldScene({
    joystick,
    getResolution: () => resolutionCap(),
    isTyping: () => chat.isTyping,
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

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#8fcfe3',
    scale: {
      // ResolutionController drives the size; NONE keeps Phaser from fighting it.
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: Math.max(1, parent.clientWidth),
      height: Math.max(1, parent.clientHeight),
    },
    render: {
      pixelArt: false,
      antialias: true,
      roundPixels: true,
      powerPreference: 'high-performance',
    },
    // No audio is loaded; any future audio starts muted after a gesture.
    audio: { noAudio: true },
    banner: false,
    scene: [world],
  });

  const resolution = new ResolutionController(game, parent);

  const joinScreen = new JoinScreen({
    renderAvatar: (parts) => {
      if (!world.scene.isActive()) return null;
      buildAvatarTexture(world, parts);
      const texture = world.textures.get(avatarTextureKey(parts));
      return texture.getSourceImage() as CanvasImageSource;
    },
    onSubmit: (nickname, avatar) => {
      identity = { nickname, avatar };
      world.setIdentity(nickname, avatar);
      connection.send({ t: 'join', nick: nickname, avatar });
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
          selfId = message.selfId;
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
          world.say(message.id, message.text, selfId);
          return;

        case 'emote':
          world.playEmote(message.id, message.kind, selfId);
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

  game.events.once(Phaser.Core.Events.READY, () => {
    resolution.start();
    joinScreen.show();
    joinScreen.redrawPreview();
  });

  installDebugBridge({
    position: () => world.getPosition(),
    zone: () => world.currentZoneName(),
    connection: () => hud.connectionState,
    playerCount: () => hud.playerCount,
    others: () => world.remotePlayers().map((remote) => remote.id),
    bubbles: () => world.bubbleTexts(),
    joined: () => joined,
  });

  hud.setConnectionState('connecting');
  joinScreen.setReady(false, '連線中…');
  connection.start();
}

void main();
