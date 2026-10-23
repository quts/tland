/**
 * Sliding-window rate limiter.
 *
 * A fixed window would let someone send a full burst at the end of one window
 * and another at the start of the next; the sliding window counts only what
 * actually happened in the last `windowMs`.
 */
export class RateLimiter {
  private readonly timestamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    if (limit < 1) throw new Error('limit must be at least 1');
    if (windowMs <= 0) throw new Error('windowMs must be positive');
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Record an attempt. Returns true when it is allowed.
   * A rejected attempt does not count against the window.
   */
  tryConsume(now: number): boolean {
    this.prune(now);
    if (this.timestamps.length >= this.limit) return false;
    this.timestamps.push(now);
    return true;
  }

  /** Milliseconds until the next attempt would be allowed. */
  retryAfter(now: number): number {
    this.prune(now);
    if (this.timestamps.length < this.limit) return 0;
    const oldest = this.timestamps[0] as number;
    return Math.max(0, oldest + this.windowMs - now);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let drop = 0;
    while (drop < this.timestamps.length && (this.timestamps[drop] as number) <= cutoff) {
      drop += 1;
    }
    if (drop > 0) this.timestamps.splice(0, drop);
  }
}
