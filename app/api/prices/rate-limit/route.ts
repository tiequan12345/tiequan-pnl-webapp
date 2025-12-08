import { NextResponse } from 'next/server';

import { getCoinGeckoRateLimitStats } from '@/lib/pricing';
import { coingeckoRateLimiter } from '@/lib/rateLimiter';

export async function GET() {
  try {
    const stats = getCoinGeckoRateLimitStats();
    const callHistory = coingeckoRateLimiter.getCallHistory();
    
    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        callHistory: callHistory.slice(-10), // Last 10 calls for debugging
        recommendations: getRateLimitRecommendations(stats)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get rate limit stats', error);
    return NextResponse.json(
      { error: 'Failed to get rate limit statistics' },
      { status: 500 },
    );
  }
}

function getRateLimitRecommendations(stats: any): string[] {
  const recommendations: string[] = [];
  const usagePercentage = stats.usagePercentage || 0;
  
  if (usagePercentage >= 90) {
    recommendations.push('Critical: Rate limit nearly exceeded. Consider reducing API call frequency immediately.');
  } else if (usagePercentage >= 80) {
    recommendations.push('Warning: High rate limit usage. Monitor closely and consider optimizing API calls.');
  } else if (usagePercentage >= 60) {
    recommendations.push('Notice: Moderate rate limit usage. Plan for peak usage periods.');
  }
  
  if (stats.remainingCalls <= 5) {
    recommendations.push('Very few API calls remaining. Wait for rate limit reset before making more calls.');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Rate limit usage is healthy.');
  }
  
  return recommendations;
}