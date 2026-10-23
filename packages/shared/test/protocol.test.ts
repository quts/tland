import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
} from '../src/protocol.js';

describe('parseClientMessage', () => {
  it('accepts a well-formed hello', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', protocol: 1 }))).toEqual({
      t: 'hello',
      protocol: 1,
    });
  });

  it('accepts a well-formed ping', () => {
    expect(parseClientMessage('{"t":"ping","at":1700000000000}')).toEqual({
      t: 'ping',
      at: 1700000000000,
    });
  });

  it('drops extra fields rather than passing them through', () => {
    const parsed = parseClientMessage(
      JSON.stringify({ t: 'hello', protocol: 1, admin: true }),
    );
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed as object).sort()).toEqual(['protocol', 't']);
  });

  it.each([
    ['not json at all', 'hello'],
    ['a bare string', '"hello"'],
    ['an array', '[{"t":"hello","protocol":1}]'],
    ['null', 'null'],
    ['a missing discriminator', '{"protocol":1}'],
    ['an unknown discriminator', '{"t":"nope"}'],
    ['a non-numeric protocol', '{"t":"hello","protocol":"1"}'],
    ['a non-numeric ping timestamp', '{"t":"ping","at":"now"}'],
    ['a NaN ping timestamp', '{"t":"ping","at":null}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it('rejects a ping with a non-finite timestamp', () => {
    // JSON has no Infinity literal, so this is the closest an attacker can get.
    expect(parseClientMessage('{"t":"ping","at":1e999}')).toBeNull();
  });
});

describe('parseServerMessage', () => {
  it('accepts each known server frame', () => {
    const frames = [
      { t: 'welcome', protocol: PROTOCOL_VERSION, selfId: 'a', tick: 0, playerCount: 1 },
      { t: 'pong', at: 1, serverTime: 2 },
      { t: 'playerCount', playerCount: 3 },
      { t: 'error', code: 'room_full', message: 'full', fatal: true },
    ];
    for (const frame of frames) {
      expect(parseServerMessage(JSON.stringify(frame))).toEqual(frame);
    }
  });

  it.each([['garbage', '}{'], ['an unknown frame', '{"t":"secret"}'], ['an array', '[]']])(
    'rejects %s',
    (_label, raw) => {
      expect(parseServerMessage(raw)).toBeNull();
    },
  );
});
