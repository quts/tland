import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { Connection } from './net/connection.js';
import { Hud } from './ui/hud.js';
import { ResolutionController } from './scale.js';
import {
  loadUiFont,
  suppressBrowserGestures,
  trackVisualViewport,
} from './viewport.js';

async function main(): Promise<void> {
  const parent = document.getElementById('game');
  if (parent === null) throw new Error('missing #game');

  trackVisualViewport();
  suppressBrowserGestures(parent);
  // Measure text only once the real face is available.
  await loadUiFont();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#a9dcc0',
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
    // No audio is loaded yet, and any future audio starts muted after a gesture.
    audio: { noAudio: true },
    banner: false,
    scene: [BootScene],
  });

  const resolution = new ResolutionController(game, parent);
  game.events.once(Phaser.Core.Events.READY, () => resolution.start());

  const hud = new Hud();
  hud.setConnectionState('connecting');

  const connection = new Connection({
    onState: (state) => hud.setConnectionState(state),
    onMessage: (message) => {
      switch (message.t) {
        case 'welcome':
          hud.hideNotice();
          hud.setPlayerCount(message.playerCount);
          break;
        case 'playerCount':
          hud.setPlayerCount(message.playerCount);
          break;
        default:
          break;
      }
    },
    onFatal: (text) => {
      hud.setConnectionState('offline');
      hud.showNotice(text);
    },
  });
  connection.start();
}

void main();
