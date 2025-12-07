/**
 * Simple rate limiter for API calls
 * Handles 30 calls per minute for CoinGecko free API
 */
export class RateLimiter {
  private calls: number[] = [];
  private maxCalls: number;
  private timeWindowMs: number;

  constructor(maxCallsPerMinute: number = 30) {
    this.maxCalls = maxCallsPerMinute;
    this.timeWindowMs = 60 * 1000; // 1 minute
  }

  /**
   * Check if we can make a call without exceeding rate limit
   */
  canMakeCall(): boolean {
    this.cleanup();
    return this.calls.length < this.maxCalls;
  }

  /**
   * Record a call being made
   */
  recordCall(): void {
    this.cleanup();
    this.calls.push(Date.now());
  }

  /**
   * Wait until we can make a call (respects rate limit)
   */
  async waitForSlot(): Promise<void> {
    this.cleanup();
    
    if (this.calls.length < this.maxCalls) {
      this.recordCall();
      return;
    }

    // Calculate how long to wait for the oldest call to expire
    const oldestCall = Math.min(...this.calls);
    const waitTime = this.timeWindowMs - (Date.now() - oldestCall);
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.cleanup();
    }
    
    this.recordCall();
  }

  /**
   * Clean up old calls that are outside the time window
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.timeWindowMs;
    this.calls = this.calls.filter(callTime => callTime > cutoff);
  }

  /**
   * Get current usage stats
   */
  getStats() {
    this.cleanup();
    return {
      currentCalls: this.calls.length,
      maxCalls: this.maxCalls,
      remainingCalls: this.maxCalls - this.calls.length,
      timeWindowMs: this.timeWindowMs
    };
  }
}

// Global rate limiter instance for CoinGecko API
export const coingeckoRateLimiter = new RateLimiter(30);