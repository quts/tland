import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rateLimit.js';

describe('RateLimiter', () => {
  it('rejects nonsensical settings', () => {
    expect(() => new RateLimiter(0, 1000)).toThrow();
    expect(() => new RateLimiter(5, 0)).toThrow();
  });

  it('allows up to the limit inside one window', () => {
    const limiter = new RateLimiter(5, 10_000);
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.tryConsume(1000 + i)).toBe(true);
    }
    expect(limiter.tryConsume(1005)).toBe(false);
  });

  it('does not count a rejected attempt against the window', () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.tryConsume(0);
    limiter.tryConsume(0);
    expect(limiter.tryConsume(0)).toBe(false);
    expect(limiter.tryConsume(0)).toBe(false);
    // The two originals expire together, not pushed along by the rejections.
    expect(limiter.tryConsume(1001)).toBe(true);
  });

  it('slides rather than resetting on a fixed boundary', () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.tryConsume(0);
    limiter.tryConsume(900);
    expect(limiter.tryConsume(950)).toBe(false);
    // The first attempt has aged out; the second has not.
    expect(limiter.tryConsume(1001)).toBe(true);
    expect(limiter.tryConsume(1002)).toBe(false);
    expect(limiter.tryConsume(1901)).toBe(true);
  });

  it('expires an attempt exactly at the window edge', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.tryConsume(0)).toBe(true);
    expect(limiter.tryConsume(999)).toBe(false);
    expect(limiter.tryConsume(1000)).toBe(true);
  });

  it('reports how long to wait', () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.tryConsume(100);
    limiter.tryConsume(200);
    expect(limiter.retryAfter(300)).toBe(800);
    expect(limiter.retryAfter(1100)).toBe(0);
  });

  it('holds a steady sender to the configured rate', () => {
    // Five per ten seconds, attempted once a second for a minute.
    const limiter = new RateLimiter(5, 10_000);
    let allowed = 0;
    for (let second = 0; second < 60; second += 1) {
      if (limiter.tryConsume(second * 1000)) allowed += 1;
    }
    expect(allowed).toBe(30);
  });
});
