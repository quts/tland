import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_LENGTH,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
  sanitizeText,
} from '../src/index.js';

describe('parseClientMessage', () => {
  it('accepts a well-formed hello', () => {
    expect(parseClientMessage('{"t":"hello","protocol":2}')).toEqual({
      t: 'hello',
      protocol: 2,
    });
  });

  it('accepts a well-formed ping', () => {
    expect(parseClientMessage('{"t":"ping","at":1700000000000}')).toEqual({
      t: 'ping',
      at: 1700000000000,
    });
  });

  it('accepts a join and normalizes its avatar', () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        t: 'join',
        nick: '阿美',
        avatar: { body: 1, shirt: 2 },
      }),
    );
    expect(parsed).toEqual({
      t: 'join',
      nick: '阿美',
      avatar: { body: 1, shirt: 2 },
    });
  });

  it('supplies a default avatar when one is missing or malformed', () => {
    const parsed = parseClientMessage('{"t":"join","nick":"a","avatar":"nope"}');
    expect(parsed).toMatchObject({
      avatar: { body: 0, shirt: 0 },
    });
  });

  it('wraps out-of-range avatar parts instead of dropping the join', () => {
    const parsed = parseClientMessage(
      '{"t":"join","nick":"a","avatar":{"body":-9999,"shirt":1e6}}',
    );
    expect(parsed).toMatchObject({ avatar: { body: expect.any(Number) } });
    const avatar = (parsed as { avatar: { body: number; shirt: number } }).avatar;
    expect(avatar.body).toBeGreaterThanOrEqual(0);
    expect(avatar.shirt).toBeGreaterThanOrEqual(0);
  });

  it('discards legacy accessory selections from incoming avatars', () => {
    const parsed = parseClientMessage(JSON.stringify({
      t: 'join', nick: 'a',
      avatar: { body: 1, shirt: 2, hat: 'none', accessory: 'none', showHat: false, showScarf: false },
    }));
    expect(parsed).toMatchObject({ avatar: { body: 1, shirt: 2 } });
    expect(Object.keys((parsed as { avatar: object }).avatar).sort()).toEqual(['body', 'shirt']);
  });

  it('accepts a move', () => {
    expect(
      parseClientMessage('{"t":"move","x":10,"y":20,"dir":"left","moving":true}'),
    ).toEqual({ t: 'move', x: 10, y: 20, dir: 'left', moving: true });
  });

  it('treats a non-boolean moving flag as not moving', () => {
    expect(
      parseClientMessage('{"t":"move","x":1,"y":2,"dir":"up","moving":"yes"}'),
    ).toMatchObject({ moving: false });
  });

  it('accepts a known emote and rejects an invented one', () => {
    expect(parseClientMessage('{"t":"emote","kind":"wave"}')).toEqual({
      t: 'emote',
      kind: 'wave',
    });
    expect(parseClientMessage('{"t":"emote","kind":"explode"}')).toBeNull();
  });

  it('drops extra fields rather than passing them through', () => {
    const parsed = parseClientMessage(
      '{"t":"hello","protocol":2,"admin":true,"__proto__":{"x":1}}',
    );
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed as object).sort()).toEqual(['protocol', 't']);
  });

  it.each([
    ['not json at all', 'hello'],
    ['a bare string', '"hello"'],
    ['an array', '[{"t":"hello","protocol":2}]'],
    ['null', 'null'],
    ['a missing discriminator', '{"protocol":2}'],
    ['an unknown discriminator', '{"t":"nope"}'],
    ['a non-numeric protocol', '{"t":"hello","protocol":"2"}'],
    ['a non-numeric ping timestamp', '{"t":"ping","at":"now"}'],
    ['a non-finite ping timestamp', '{"t":"ping","at":1e999}'],
    ['a join with no nickname', '{"t":"join"}'],
    ['a join with a non-string nickname', '{"t":"join","nick":123}'],
    ['a move with a bad direction', '{"t":"move","x":1,"y":2,"dir":"sideways"}'],
    ['a move with a non-finite coordinate', '{"t":"move","x":1e999,"y":0,"dir":"up"}'],
    ['a chat with no text', '{"t":"chat"}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('parseServerMessage', () => {
  it('accepts each known server frame', () => {
    const frames = [
      { t: 'ready', protocol: PROTOCOL_VERSION, playerCount: 1, maxPlayers: 50 },
      { t: 'welcome', selfId: 'a', tick: 0, you: { x: 1, y: 2 }, players: [] },
      { t: 'playerLeft', id: 'a' },
      { t: 'state', tick: 3, players: [] },
      { t: 'correction', x: 1, y: 2 },
      { t: 'chat', id: 'a', text: 'hi' },
      { t: 'emote', id: 'a', kind: 'wave' },
      { t: 'playerCount', playerCount: 3 },
      { t: 'pong', at: 1, serverTime: 2 },
      { t: 'error', code: 'room_full', message: 'full', fatal: true },
    ];
    for (const frame of frames) {
      expect(parseServerMessage(JSON.stringify(frame))).toEqual(frame);
    }
  });

  it.each([
    ['garbage', '}{'],
    ['an unknown frame', '{"t":"secret"}'],
    ['an array', '[]'],
    ['a non-string discriminator', '{"t":7}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseServerMessage(raw)).toBeNull();
  });
});

describe('sanitizeText', () => {
  it('leaves ordinary text alone', () => {
    expect(sanitizeText('哈囉 hello', 120)).toBe('哈囉 hello');
  });

  it('collapses runs of whitespace', () => {
    expect(sanitizeText('a   \t\n  b', 120)).toBe('a b');
  });

  it('trims the ends', () => {
    expect(sanitizeText('   hi   ', 120)).toBe('hi');
  });

  it('truncates to the limit', () => {
    expect(sanitizeText('x'.repeat(500), CHAT_MAX_LENGTH)).toHaveLength(
      CHAT_MAX_LENGTH,
    );
  });

  it('strips control characters', () => {
    expect(sanitizeText(CONTROLS, 120)).toBe('ab');
  });

  it('strips zero-width and bidi characters', () => {
    expect(sanitizeText(BIDI, 120)).toBe('abc');
  });

  it('leaves nothing but an empty string for a line of only junk', () => {
    expect(sanitizeText(JUNK, 120)).toBe('');
  });

  it('does not treat angle brackets as special', () => {
    // Markup is never built from this text; clients use textContent.
    expect(sanitizeText('<b>hi</b>', 120)).toBe('<b>hi</b>');
  });
});

/* Literal control characters, kept out of the test bodies for readability. */
const CONTROLS = `a${String.fromCharCode(0x07)}b${String.fromCharCode(0x00)}`;
const BIDI = `a${String.fromCharCode(0x200b)}b${String.fromCharCode(0x202e)}c`;
const JUNK = `${String.fromCharCode(0x200b)} ${String.fromCharCode(0x0001)}`;
