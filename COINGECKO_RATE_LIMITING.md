# CoinGecko API Rate Limiting Implementation

This implementation adds rate limiting and batched API calls for the CoinGecko API to optimize API usage and respect the free tier limits (30 calls per minute).

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

## Files Modified/Created

### Core Implementation
- `lib/rateLimiter.ts` - Rate limiting utility class
- `lib/pricing.ts` - Updated pricing functions with batch support
- `app/api/prices/refresh/route.ts` - Batch processing for price refresh
- `app/api/prices/rate-limit/route.ts` - Rate limit monitoring endpoint

### Configuration
- `.env.example` - Added `COINGECKO_API_KEY` documentation
- `middleware.ts` - Made pricing endpoints public for monitoring

## API Endpoints

### Price Refresh (POST)
```
POST /api/prices/refresh
```

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

### Rate Limit Monitoring (GET)
```
GET /api/prices/rate-limit
```

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

## Usage Examples

### Batch Crypto Price Fetching
```typescript
import { fetchBatchCryptoPrices } from '@/lib/pricing';

const symbols = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot'];
const prices = await fetchBatchCryptoPrices(symbols);

// Returns: { bitcoin: { price: 91509, source: 'CoinGecko', updatedAt: Date }, ... }
```

### Rate Limit Monitoring
```typescript
import { getCoinGeckoRateLimitStats } from '@/lib/pricing';

const stats = getCoinGeckoRateLimitStats();
console.log(`Used ${stats.currentCalls}/${stats.maxCalls} calls`);
```

## Configuration

### Environment Variables
```bash
# Required: Get your free API key from https://www.coingecko.com/en/api/documentation
COINGECKO_API_KEY=your_api_key_here

# Optional: Finnhub API key for equity price fetching
FINNHUB_API_KEY=your_finnhub_key_here
```

### Rate Limiter Configuration
The rate limiter is configured for 30 calls per minute by default. To modify:

```typescript
// In lib/rateLimiter.ts
export const coingeckoRateLimiter = new RateLimiter(30); // Change number as needed
```

## Performance Benefits

### Before Implementation
- Individual API calls for each crypto asset
- No rate limiting protection
- Potential API quota exhaustion
- Poor performance with many assets

### After Implementation
- Batched API calls (up to 10 coins per call)
- Automatic rate limiting protection
- API quota conservation
- Improved performance
- Real-time monitoring

## Example API Call Structure

### Single Coin (Legacy)
```
GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
```

### Batched Coins (New)
```
GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,polkadot&vs_currencies=usd
```

**Response Format:**
```json
{
  "bitcoin": {"usd": 91509},
  "ethereum": {"usd": 3131.55},
  "solana": {"usd": 245.67},
  "cardano": {"usd": 0.89},
  "polkadot": {"usd": 7.23}
}
```

## Error Handling

- Failed API calls are logged and tracked
- Individual coin failures don't break the entire batch
- Rate limit exhaustion is handled gracefully with queuing
- Comprehensive error reporting in API responses

## Testing

The implementation includes comprehensive testing through the API endpoints:

1. **Rate Limit Monitoring**: `GET /api/prices/rate-limit`
2. **Batch Price Refresh**: `POST /api/prices/refresh`
3. **Direct API Testing**: `test-batch-pricing.js` (optional)

## Migration Notes

- **Backward Compatible**: Existing `fetchCryptoPrice()` function still works
- **Automatic Batching**: New `fetchBatchCryptoPrices()` function for efficient batch requests
- **No Breaking Changes**: All existing functionality preserved
- **Enhanced Logging**: Better error reporting and monitoring

This implementation ensures optimal API usage while maintaining full compatibility with existing code.