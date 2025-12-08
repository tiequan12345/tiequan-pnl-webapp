# CoinGecko Price Refresh Improvements

This document outlines the improvements made to the CoinGecko price refresh mechanism to make it more robust and reliable.

## Overview

The price refresh system has been enhanced with automated scheduling, retry logic, comprehensive logging, and monitoring capabilities to ensure reliable price updates for crypto and equity assets.

## Key Improvements

### 1. Automated Hourly Refresh

- **Vercel Cron Job**: Added `vercel.json` configuration to automatically trigger price refresh every hour
- **Schedule**: Runs at the beginning of each hour (`0 * * * *`)
- **Endpoint**: `/api/prices/refresh` is called automatically by Vercel's cron system

### 2. Retry Logic with Exponential Backoff

- **Max Retries**: Up to 3 retry attempts for failed API calls
- **Backoff Strategy**: Exponential backoff with jitter to prevent thundering herd
- **Timeout Protection**: 10-second timeout for all API requests
- **Batch Resilience**: Individual batch failures don't affect other batches

### 3. Comprehensive Logging

- **Structured Logging**: All pricing operations are logged with timestamps and details
- **Operation Tracking**: Each step of the refresh process is logged
- **Error Context**: Detailed error information for debugging failed refreshes
- **Performance Metrics**: Duration and success rates are tracked

### 4. Health Check Endpoint

- **Endpoint**: `/api/prices/health`
- **Metrics**: 
  - Asset counts and update coverage
  - Rate limit status
  - Database connectivity
  - API key availability
  - Response time monitoring
- **Status Codes**: 200 for healthy, 503 for degraded/unhealthy

### 5. Enhanced Error Handling

- **Partial Success**: System continues processing even if some assets fail
- **Detailed Error Reporting**: Each failed asset includes specific error details
- **Graceful Degradation**: System continues operating with reduced functionality
- **Status Codes**: 200 for full success, 207 for partial success

### 6. Rate Limit Monitoring

- **Enhanced Statistics**: Detailed usage metrics and status indicators
- **Warning System**: Automatic warnings when approaching rate limits
- **Call History**: Track recent API calls for debugging
- **Recommendations**: Dynamic recommendations based on current usage

## API Endpoints

### Refresh Endpoints

1. **Batch Refresh**: `POST /api/prices/refresh`
   - Refreshes all assets with AUTO pricing mode
   - Processes crypto and equity assets separately
   - Returns detailed success/failure statistics

2. **Single Asset Refresh**: `POST /api/prices/refresh/[assetId]`
   - Refreshes a specific asset
   - Supports both crypto and equity assets
   - Returns success/failure status

### Monitoring Endpoints

1. **Health Check**: `GET /api/prices/health`
   - Overall system health status
   - Performance metrics
   - Configuration status

2. **Rate Limit Status**: `GET /api/prices/rate-limit`
   - Current rate limit usage
   - Call history
   - Usage recommendations

## Configuration

### Environment Variables

- `COINGECKO_API_KEY`: Optional API key for higher rate limits
- `FINNHUB_API_KEY`: Required for equity price data

### Settings

The system respects the following settings from the settings page:

- `priceAutoRefresh`: Enable/disable automatic refresh
- `priceAutoRefreshIntervalMinutes`: Refresh interval (currently fixed at 60 minutes for cron)
- `priceRefreshEndpoint`: Custom refresh endpoint (for testing)

## Testing

A test script is provided to verify the improvements:

```bash
# Ensure dependencies are installed (node-fetch should already be in package.json)
npm install

# Run the test script (requires the development server to be running)
npm run dev

# In a separate terminal, run:
node test-refresh-mechanism.js

# Or test against a deployed environment:
TEST_BASE_URL=https://your-app.vercel.app node test-refresh-mechanism.js
```

The test script verifies:
- Server connectivity
- Health endpoint functionality
- Rate limit monitoring
- Batch refresh operation
- Single asset refresh

The test script includes enhanced error handling to:
- Check if the development server is running before testing
- Handle non-JSON responses gracefully
- Provide detailed debugging information for failed tests

## Monitoring and Debugging

### Log Categories

All logs are prefixed with `[PRICING:OPERATION]` for easy filtering:

- `BATCH_FETCH_START/COMPLETE`: Batch crypto price operations
- `EQUITY_FETCH_START/SUCCESS/FAILED`: Individual equity price operations
- `REFRESH_START/COMPLETE`: Overall refresh operations
- `ASSET_REFRESHED`: Successful individual asset updates
- `RATE_LIMIT`: Rate limit warnings and status

### Health Monitoring

Regular health checks should be performed to ensure:

- Price data freshness (updates within expected intervals)
- Rate limit usage is within acceptable bounds
- API endpoints are responding correctly
- Database connectivity is maintained

### Troubleshooting

Common issues and solutions:

1. **High Rate Limit Usage**
   - Check the rate limit endpoint for current usage
   - Consider reducing refresh frequency
   - Verify batch processing is working correctly

2. **Failed Price Updates**
   - Check logs for specific error messages
   - Verify API keys are correctly configured
   - Check network connectivity to external APIs

3. **Stale Price Data**
   - Verify cron job is running (check Vercel logs)
   - Check health endpoint for update coverage
   - Review failed asset logs for patterns

## Future Enhancements

Potential improvements for future consideration:

1. **Webhook Support**: Add webhook endpoint for external monitoring systems
2. **Price History**: Store historical price data for trend analysis
3. **Smart Retry**: Implement adaptive retry strategies based on error types
4. **Cache Layer**: Add caching to reduce API calls for frequently accessed data
5. **Multi-Provider Support**: Add fallback price providers for redundancy

## Security Considerations

- All pricing endpoints are publicly accessible (as configured in middleware)
- API keys are stored securely in environment variables
- Request timeouts prevent hanging connections
- Rate limiting prevents API abuse
- Input validation prevents malformed requests

## Performance Considerations

- Batch processing reduces API calls (up to 10 coins per request)
- Exponential backoff prevents overwhelming external APIs
- Timeouts prevent resource exhaustion
- Partial processing ensures system continues operating during failures
- Efficient database operations with upsert patterns