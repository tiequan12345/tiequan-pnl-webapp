# Pricing Engine & Rate Limiting

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [API Endpoints](#api-endpoints)
4. [Rate Limiting Implementation](#rate-limiting-implementation)
5. [Price Refresh Improvements](#price-refresh-improvements)
6. [GitHub Actions Workflow](#github-actions-workflow)
7. [Configuration](#configuration)
8. [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

## Overview

The pricing system provides automated price fetching for crypto and equity assets with comprehensive rate limiting, retry logic, and monitoring capabilities. The system supports both CoinGecko (crypto) and Finnhub (equity) APIs with configurable refresh scheduling and robust error handling.

## Features

### 1. Rate Limiting
- **30 calls per minute limit** for CoinGecko free API tier
- Automatic rate limiting with queuing
- Configurable rate limit parameters
- Real-time monitoring endpoint

### 2. Batched API Calls
- **Batch up to 10 volatile coins** per API call
- Reduces API calls from individual requests to batch requests
- Maintains backward compatibility with existing single-asset price fetches

### 3. API Key Support
- Optional CoinGecko API key integration
- Uses `x-cg-demo-api-key` header for authenticated requests
- Falls back to unauthenticated requests if no key provided

### 4. Automated Scheduling
- Hourly refresh via GitHub Actions workflow
- Manual refresh trigger via UI
- Interval enforcement with configurable settings

### 5. Retry Logic with Exponential Backoff
- Max 3 retry attempts for failed API calls
- Backoff strategy with jitter to prevent thundering herd
- 10-second timeout for all API requests
- Individual batch failures don't affect other batches

## API Endpoints

### Refresh Endpoints

#### 1. Batch Refresh: `POST /api/prices/refresh`
Refreshes all assets with AUTO pricing mode
Processes crypto and equity assets separately
Returns detailed success/failure statistics

**Response:**
```json
{
  "refreshed": [1, 7, 9, 11, 12, 14, 15, 17, 18, 23, 3, 19, 20, 21, 22],
  "failed": [],
  "rateLimitStats": {
    "currentCalls": 1,
    "maxCalls": 30,
    "remainingCalls": 29,
    "timeWindowMs": 60000
  },
  "processed": {
    "crypto": 10,
    "equity": 5,
    "total": 15
  }
}
```

#### 2. Single Asset Refresh: `POST /api/prices/refresh/[assetId]`
Refreshes a specific asset
Supports both crypto and equity assets
Returns success/failure status

### Monitoring Endpoints

#### 1. Health Check: `GET /api/prices/health`
Overall system health status
Performance metrics
Configuration status

#### 2. Rate Limit Status: `GET /api/prices/rate-limit`
Current rate limit usage
Call history
Usage recommendations

**Response:**
```json
{
  "success": true,
  "data": {
    "currentCalls": 1,
    "maxCalls": 30,
    "remainingCalls": 29,
    "timeWindowMs": 60000
  },
  "timestamp": "2025-12-07T19:23:15.320Z"
}
```

## Rate Limiting Implementation

### Core Components
- `lib/rateLimiter.ts` - Rate limiting utility class
- `lib/pricing.ts` - Updated pricing functions with batch support

### Configuration
The rate limiter is configured for 30 calls per minute by default:

```typescript
// In lib/rateLimiter.ts
export const coingeckoRateLimiter = new RateLimiter(30); // Change number as needed
```

### Usage Examples

#### Batch Crypto Price Fetching
```typescript
import { fetchBatchCryptoPrices } from '@/lib/pricing';

const symbols = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot'];
const prices = await fetchBatchCryptoPrices(symbols);

// Returns: { bitcoin: { price: 91509, source: 'CoinGecko', updatedAt: Date }, ... }
```

#### Rate Limit Monitoring
```typescript
import { getCoinGeckoRateLimitStats } from '@/lib/pricing';

const stats = getCoinGeckoRateLimitStats();
console.log(`Used ${stats.currentCalls}/${stats.maxCalls} calls`);
```

## Price Refresh Improvements

### 1. Automated Hourly Refresh
- **GitHub Actions Workflow**: Added `.github/workflows/price-refresh.yml`
- **Schedule**: Runs at the beginning of each hour (`0 * * * *`)
- **Endpoint**: `/api/prices/refresh` called automatically
- **Manual Trigger**: Workflow can be manually triggered via GitHub Actions UI

### 2. Comprehensive Logging
- **Structured Logging**: All pricing operations logged with timestamps and details
- **Operation Tracking**: Each step of refresh process is logged
- **Error Context**: Detailed error information for debugging failed refreshes
- **Performance Metrics**: Duration and success rates are tracked

### 3. Enhanced Error Handling
- **Partial Success**: System continues processing even if some assets fail
- **Detailed Error Reporting**: Each failed asset includes specific error details
- **Graceful Degradation**: System continues operating with reduced functionality
- **Status Codes**: 200 for full success, 207 for partial success

### 4. Execution Tracking & Concurrency
- **PriceRefreshRun Model**: All execution attempts tracked in database, including start/end times, status (`RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`), and JSON metadata for performance metrics
- **Concurrency Guard**: Built-in mutex prevents multiple refreshes from running simultaneously. Active runs block new attempts with a `409 Conflict` status
- **Interval Enforcement**: For scheduled runs, system enforces `priceAutoRefreshIntervalMinutes` setting. Requests are skipped if configured interval has not elapsed since last successful/partial run
- **Manual Override**: Manual refreshes always bypass interval check but respect concurrency guard

### 5. PNL Snapshot Persistence
- **Snapshot Hook**: Each successful `/api/prices/refresh` also records a `PortfolioSnapshot` and related `PortfolioSnapshotComponent` rows containing base-currency total and filtered breakdowns
- **Data Consumer**: `lib/pnlSnapshots.ts` exposes helpers for creating and querying snapshots, powering `/api/pnl` endpoint and `/pnl` UI
- **Failure Handling**: Snapshot errors are logged (`snapshot_failed`) but do not block price refresh response

## GitHub Actions Workflow

### File Location
`.github/workflows/price-refresh.yml`

### Schedule
- **Automatic**: Runs every hour at the top of the hour (`0 * * * *`)
- **Manual**: Can be triggered manually via GitHub Actions UI

### Workflow Steps
1. **Settings Check**: The endpoint checks if auto-refresh is enabled in settings
2. **Trigger Price Refresh**: Makes POST request to refresh endpoint with `X-Refresh-Mode: auto` header
3. **Log Success/Failure**: Reports status and timestamp
4. **Persist Snapshot**: After prices refresh, backend records portfolio snapshot data

### Settings Toggle Handling
- **Scheduled runs** (with `X-Refresh-Mode: auto` header): Check `priceAutoRefresh` setting
  - If disabled: Return success message without performing refresh
  - If enabled: Proceed with normal refresh process
- **Manual runs** (no special header): Always execute regardless of settings

### Required Secrets
Configure these secrets in your GitHub repository settings:

#### Required
- `REFRESH_ENDPOINT_URL`: Full URL to your app's price refresh endpoint
  - Example: `https://your-domain.com/api/prices/refresh`
  - Example (local development): `http://localhost:3000/api/prices/refresh`

#### Optional
- `REFRESH_AUTH_HEADER`: Authentication header if your middleware requires it
  - Example: `Authorization: Bearer your-token-here`
  - Example: `X-API-Key: your-api-key`

## Configuration

### Environment Variables
```bash
# Required for price fetching
COINGECKO_API_KEY=your_api_key_here
FINNHUB_API_KEY=your_finnhub_key_here

# Authentication (if using middleware)
APP_PASSWORD=your_app_password
```

### Settings Page Configuration
The system respects these settings from the settings page:
- `priceAutoRefresh`: Enable/disable automatic refresh (UI toggle)
- `priceAutoRefreshIntervalMinutes`: Refresh interval preference
- `priceRefreshEndpoint`: Custom endpoint for testing

**Settings Toggle Behavior:**
- **Scheduled Runs**: GitHub Actions workflow runs respect `priceAutoRefresh` setting
  - When disabled: Scheduled runs return success but skip actual refresh
  - When enabled: Scheduled runs perform full refresh as normal
- **Manual Runs**: Always execute regardless of `priceAutoRefresh` setting
  - Settings page "Refresh Prices Now" button
  - Manual GitHub Actions workflow trigger

## Monitoring and Troubleshooting

### Log Categories
All logs are prefixed with `[PRICING:OPERATION]` for easy filtering:
- `BATCH_FETCH_START/COMPLETE`: Batch crypto price operations
- `EQUITY_FETCH_START/SUCCESS/FAILED`: Individual equity price operations
- `REFRESH_START/COMPLETE`: Overall refresh operations
- `ASSET_REFRESHED`: Successful individual asset updates
- `RATE_LIMIT`: Rate limit warnings and status

### Health Monitoring
Regular health checks should ensure:
- Price data freshness (updates within expected intervals)
- Rate limit usage is within acceptable bounds
- API endpoints are responding correctly
- Database connectivity is maintained

### Common Issues and Solutions

#### 1. High Rate Limit Usage
- Check rate limit endpoint for current usage
- Consider reducing refresh frequency
- Verify batch processing is working correctly

#### 2. Failed Price Updates
- Check logs for specific error messages
- Verify API keys are correctly configured
- Check network connectivity to external APIs

#### 3. Stale Price Data
- Verify GitHub Actions workflow is running (check Actions tab in GitHub)
- Check health endpoint for update coverage
- Review failed asset logs for patterns
- Ensure `REFRESH_ENDPOINT_URL` secret is correctly configured

#### 4. Workflow Not Running
- Check GitHub Actions is enabled for repository
- Verify workflow file exists at `.github/workflows/price-refresh.yml`
- Ensure repository has necessary permissions

### Quick Reference Commands

```bash
# Test refresh endpoint manually
curl -X POST "https://your-domain.com/api/prices/refresh" \
  -H "Content-Type: application/json"

# Check health status
curl "https://your-domain.com/api/prices/health"

# Check rate limit status
curl "https://your-domain.com/api/prices/rate-limit"
```

### Performance Benefits

#### Before Implementation
- Individual API calls for each crypto asset
- No rate limiting protection
- Potential API quota exhaustion
- Poor performance with many assets

#### After Implementation
- Batched API calls (up to 10 coins per call)
- Automatic rate limiting protection
- API quota conservation
- Improved performance
- Real-time monitoring

## Security Considerations

- All pricing endpoints are publicly accessible (as configured in middleware)
- The health endpoint `/api/prices/health` is specifically included in the public allow-list
- API keys are stored securely in environment variables
- Request timeouts prevent hanging connections
- Rate limiting prevents API abuse
- Input validation prevents malformed requests

## Future Enhancements

Potential improvements for future consideration:
1. **Webhook Support**: Add webhook endpoint for external monitoring systems
2. **Price History**: Store historical price data for trend analysis
3. **Smart Retry**: Implement adaptive retry strategies based on error types
4. **Cache Layer**: Add caching to reduce API calls for frequently accessed data
5. **Multi-Provider Support**: Add fallback price providers for redundancy