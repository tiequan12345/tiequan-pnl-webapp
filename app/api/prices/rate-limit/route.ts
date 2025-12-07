import { NextResponse } from 'next/server';

import { getCoinGeckoRateLimitStats } from '@/lib/pricing';

export async function GET() {
  try {
    const stats = getCoinGeckoRateLimitStats();
    
    return NextResponse.json({
      success: true,
      data: stats,
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