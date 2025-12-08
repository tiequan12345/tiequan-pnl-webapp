/**
 * Simple rate limiter for API calls
 * Handles 30 calls per minute for CoinGecko free API
 */
export class RateLimiter {
  private calls: number[] = [];
  private maxCalls: number;
  private timeWindowMs: number;
  private warningThreshold: number;
  private lastWarningTime: number = 0;
  private warningCooldownMs: number = 30 * 1000; // Warn at most once every 30 seconds

  constructor(maxCallsPerMinute: number = 30, warningThreshold: number = 0.8) {
    this.maxCalls = maxCallsPerMinute;
    this.timeWindowMs = 60 * 1000; // 1 minute
    this.warningThreshold = warningThreshold; // Warn when 80% of capacity is used
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
    this.checkAndWarn();
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
      console.warn(`[RATE_LIMIT] Rate limit reached. Waiting ${waitTime}ms for next available slot.`);
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
   * Check if we should emit a warning about rate limit usage
   */
  private checkAndWarn(): void {
    const usageRatio = this.calls.length / this.maxCalls;
    const now = Date.now();
    
    if (usageRatio >= this.warningThreshold && (now - this.lastWarningTime) > this.warningCooldownMs) {
      console.warn(`[RATE_LIMIT] High usage detected: ${this.calls.length}/${this.maxCalls} calls (${(usageRatio * 100).toFixed(1)}%). Consider reducing API call frequency.`);
      this.lastWarningTime = now;
    }
  }

  /**
   * Get current usage stats
   */
  getStats() {
    this.cleanup();
    const usageRatio = this.calls.length / this.maxCalls;
    const status = usageRatio >= 0.9 ? 'critical' : usageRatio >= this.warningThreshold ? 'warning' : 'healthy';
    
    return {
      currentCalls: this.calls.length,
      maxCalls: this.maxCalls,
      remainingCalls: this.maxCalls - this.calls.length,
      usagePercentage: Math.round(usageRatio * 100),
      status,
      timeWindowMs: this.timeWindowMs,
      nextAvailableSlot: this.calls.length >= this.maxCalls
        ? Math.min(...this.calls) + this.timeWindowMs
        : Date.now()
    };
  }

  /**
   * Get detailed call history for debugging
   */
  getCallHistory(): { timestamp: number; timeAgo: string }[] {
    this.cleanup();
    const now = Date.now();
    return this.calls.map(callTime => ({
      timestamp: callTime,
      timeAgo: `${Math.round((now - callTime) / 1000)}s ago`
    }));
  }
}

// Global rate limiter instance for CoinGecko API
export const coingeckoRateLimiter = new RateLimiter(30);