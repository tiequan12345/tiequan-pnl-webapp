# TieQuan P&L Webapp

A Next.js-based portfolio and P&L tracking application with automated price fetching, rate limiting, and robust authentication.

## Overview

This webapp provides a comprehensive solution for tracking investment portfolios, including:
- Portfolio holdings and P&L calculations
- Historical P&L snapshots with filtered charts and a dedicated `/pnl` view
- Automated price fetching for crypto (CoinGecko) and equities (Finnhub)
- Rate-limited API calls with monitoring
- SQLite database with Prisma ORM
- Authentication via middleware
- Settings management for auto-refresh intervals

## Architecture

- **Framework**: Next.js 14 with App Router
- **Database**: SQLite with Prisma ORM
- **Authentication**: Single-user session-based auth via middleware
- **API**: RESTful endpoints for data management and price refreshing
- **Rate Limiting**: Custom rate limiter for CoinGecko API (30 calls/minute)
- **Deployment**: Vercel with scheduled cron jobs

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tiequan-pnl-webapp
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your environment variables (see [Environment Setup](#environment-setup))

5. Set up the database:
```bash
npm run prisma:generate
npm run prisma:migrate
```

6. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:1373`

## Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```env
# Required: Password for application authentication
APP_PASSWORD=your-secure-password

# Required: Database connection string (SQLite)
DATABASE_URL="file:./dev.db"

# Required: Finnhub API key for equity price fetching
FINNHUB_API_KEY=your-finnhub-api-key

# Required: CoinGecko API key for crypto price fetching
# Get your free API key from: https://www.coingecko.com/en/api/documentation
COINGECKO_API_KEY=your-coingecko-api-key
```

### Getting API Keys

**Finnhub API Key:**
1. Sign up at [Finnhub](https://finnhub.io/)
2. Get your free API key from the dashboard
3. Add it to your `.env.local` file

**CoinGecko API Key:**
1. Sign up at [CoinGecko](https://www.coingecko.com/en/api/documentation)
2. Get your free API key (30 calls/minute limit)
3. Add it to your `.env.local` file

## Database Setup

The application uses SQLite with Prisma ORM. The database schema includes:

- **Asset**: Cryptocurrency and equity holdings
- **Account**: Trading accounts and platforms
- **LedgerTransaction**: Transaction history
- **PriceLatest**: Latest price cache for assets
- **Setting**: Application configuration
- **PortfolioSnapshot**: History of tensile snapshots (timestamp, base currency, total value) plus denormalized components for asset/account breakdowns (see `PortfolioSnapshotComponent`).

### Initial Setup

1. Generate Prisma client:
```bash
npm run prisma:generate
```

2. Run database migrations:
```bash
npm run prisma:migrate
```

3. (Optional) Seed initial data through the application UI

### Database Schema

See [`prisma/schema.prisma`](prisma/schema.prisma) for the complete database schema definition.

## Authentication Flow

The application uses a simple single-user authentication system:

### Flow Overview

1. **Login Page**: User enters password at `/login`
2. **API Call**: Form POSTs to `/api/login`
3. **Validation**: Server compares password with `APP_PASSWORD`
4. **Session Creation**: Sets `app_session` cookie on success
5. **Middleware Protection**: All routes except `/login` and API endpoints require valid session
6. **Redirect**: Unauthenticated users are redirected to `/login`

### Key Components

- **Login Page**: [`app/login/page.tsx`](app/login/page.tsx)
- **Login API**: [`app/api/login/route.ts`](app/api/login/route.ts)
- **Middleware**: [`middleware.ts`](middleware.ts)
- **Authenticated Layout**: [`app/(authenticated)/layout.tsx`](app/(authenticated)/layout.tsx)

### Session Management

- Cookie-based sessions with `app_session` name
- Middleware enforces authentication on all protected routes
- Single-user system (no multi-user support)

## Pricing API Endpoints

The application provides several endpoints for price management and monitoring:

### Price Refresh Endpoints

#### Batch Refresh: `POST /api/prices/refresh`

Refreshes prices for all assets with `AUTO` pricing mode.

**Response:**
```json
{
  "success": true,
  "message": "Price refresh completed",
  "duration": 2500,
  "results": {
    "successful": ["BTC", "ETH"],
    "failed": ["INVALID_ASSET"]
  },
  "stats": {
    "total": 10,
    "successful": 8,
    "failed": 2
  }
}
```

#### Single Asset Refresh: `POST /api/prices/refresh/[assetId]`

Refreshes price for a specific asset by ID.

**Response:**
```json
{
  "success": true,
  "message": "Price refreshed for asset 123",
  "data": {
    "assetId": 123,
    "price": 45000.50,
    "source": "coingecko"
  }
}
```

#### Rate Limit Status: `GET /api/prices/rate-limit`

Returns current rate limiting statistics and recommendations.

**Response:**
```json
{
  "stats": {
    "callsInLastMinute": 15,
    "maxCallsPerMinute": 30,
    "callsRemaining": 15,
    "resetTime": 1640995200000,
    "warningThreshold": 0.8
  },
  "callHistory": [
    { "timestamp": 1640995140000, "success": true },
    { "timestamp": 1640995145000, "success": true }
  ],
  "recommendations": [
    "Rate limit usage is normal",
    "Consider batching requests to optimize API usage"
  ]
}
```

#### Health Check: `GET /api/prices/health`

Basic health check for pricing system.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-12-31T23:59:59.999Z",
  "database": "connected",
  "rateLimiter": "operational"
}
```

#### PNL History: `GET /api/pnl`

Returns a time-series of portfolio snapshots recorded after each successful price refresh. Filters mirror the holdings view and support:
- `from` / `to` (ISO dates)
- `limit` (number of points, default ~60)
- `accountIds`, `assetTypes`, `volatilityBuckets` (comma-separated)

**Response:**
```json
{
  "baseCurrency": "USD",
  "timezone": "America/New_York",
  "points": [
    {
      "snapshotAt": "2025-08-20T14:00:00.000Z",
      "totalValue": 125000.5,
      "byType": { "CRYPTO": 100000, "EQUITY": 25000 },
      "byVolatility": { "VOLATILE": 90000, "CASH_LIKE": 35000 },
      "byAccount": {
        "1": { "name": "Binance", "value": 90000 },
        "2": { "name": "Interactive Brokers", "value": 35000 }
      }
    }
    // More snapshots...
  ]
}
```

## CoinGecko Refresh Lifecycle

The application implements a robust price refresh system with rate limiting and error handling.

### Refresh Process

1. **Asset Query**: Finds all assets with `AUTO` pricing mode
2. **Batch Processing**: Groups assets by type (crypto vs equity)
3. **Rate Limiting**: Enforces 30 calls/minute limit for CoinGecko
4. **API Calls**: Fetches prices with exponential backoff retry
5. **Database Update**: Upserts to `PriceLatest` table
6. **Logging**: Comprehensive operation logging

### Rate Limiting

The custom rate limiter ([`lib/rateLimiter.ts`](lib/rateLimiter.ts)) provides:

- **30 calls/minute** limit for CoinGecko API
- **Exponential backoff** for failed requests
- **Call history tracking** for monitoring
- **Adaptive recommendations** based on usage patterns

### Error Handling

- **Retry Logic**: Up to 3 retries with exponential backoff
- **Graceful Degradation**: Failed assets don't block successful ones
- **Detailed Logging**: All operations logged with timestamps
- **Status Reporting**: Comprehensive success/failure reporting

### Symbol Normalization

The pricing system includes symbol mapping and overrides:

```typescript
// Example overrides in lib/pricing.ts
const COINGECKO_OVERRIDES: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  // ... more mappings
}
```

## Automated Refresh

The application supports automated price refresh through:

### GitHub Actions Workflow

The application uses GitHub Actions to automate price refresh via the workflow file `.github/workflows/price-refresh.yml`:

- **Schedule**: Runs every hour at the beginning of each hour (`0 * * * *`)
- **Endpoint**: Calls `/api/prices/refresh` automatically
- **Manual Trigger**: Workflow can also be manually triggered via GitHub Actions UI
- **Mode Detection**: Includes `X-Refresh-Mode: auto` header to differentiate scheduled vs manual runs
- **Settings Respect**: Scheduled runs honor the `priceAutoRefresh` setting from the settings page

### Manual Refresh

Users can trigger manual refresh through:

- **Settings Page**: `/settings` includes a refresh button
- **Direct API Call**: POST to `/api/prices/refresh`
- **Individual Asset**: POST to `/api/prices/refresh/[assetId]`

### Monitoring

Monitor the refresh system through:

- **Rate Limit Endpoint**: `/api/prices/rate-limit`
- **GitHub Actions**: Check the Actions tab in your repository for workflow execution history
- **Application Logs**: Check your hosting platform's function logs
- **Database**: Query `PriceLatest` table for freshness
- **Health Endpoint**: `/api/prices/health` (publicly accessible)

## Settings Management

The application includes a settings system for configuration:

### Available Settings

- **baseCurrency**: Base currency for portfolio (fixed to "USD")
  - Note: Base currency is locked to USD as all pricing providers (CoinGecko and Finnhub) return USD values
  - This setting is read-only in the UI to prevent incorrect currency formatting
- **timezone**: User timezone for date display
- **priceAutoRefresh**: Enable/disable automatic price refresh
- **priceAutoRefreshIntervalMinutes**: Interval for auto-refresh
- **priceRefreshEndpoint**: Custom endpoint for price refresh

### Settings API

- **GET /api/settings**: Retrieve current settings
- **POST /api/settings**: Update settings

### Settings UI

Access settings through the authenticated `/settings` page.

## Development

### Project Structure

```
app/
├── (authenticated)/          # Protected routes
│   ├── layout.tsx           # Authenticated layout wrapper
│   ├── page.tsx             # Dashboard
│   ├── accounts/            # Account management
│   ├── assets/              # Asset management
│   ├── holdings/            # Portfolio holdings
│   ├── pnl/                 # PNL time-series view with filters
│   ├── ledger/              # Transaction ledger
│   └── settings/            # Application settings
├── api/                     # API routes
│   ├── login/               # Authentication
│   ├── prices/              # Price management
│   ├── accounts/            # Account CRUD
│   ├── assets/              # Asset CRUD
│   └── settings/            # Settings management
└── login/                   # Login page

lib/
├── db.ts                    # Prisma client setup
├── pnlSnapshots.ts          # Portfolio snapshot persistence helpers
├── pricing.ts               # Price fetching logic
├── rateLimiter.ts           # Rate limiting implementation
└── settings.ts              # Settings management

prisma/
└── schema.prisma            # Database schema
```

### Key Libraries

- **Next.js 14**: React framework with App Router
- **Prisma**: Database ORM and migrations
- **Tailwind CSS**: Styling framework
- **Lucide React**: Icon library
- **Recharts**: Chart library for visualizations

### Development Scripts

```bash
npm run dev          # Start development server (port 1373)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
```

## Deployment

### GitHub Actions Deployment

1. **Connect Repository**: Link your GitHub repository to your hosting platform
2. **Environment Variables**: Add all required environment variables
3. **Deploy**: Your platform will automatically build and deploy
4. **Price Refresh**: The included GitHub Actions workflow will handle hourly price refresh automatically
5. **Secrets Setup**: Configure the required secrets in your GitHub repository for the workflow

### Environment Variables for Production

Ensure all variables from `.env.example` are set in your hosting platform:

- `APP_PASSWORD`
- `DATABASE_URL` (hosting platform provides this automatically)
- `FINNHUB_API_KEY`
- `COINGECKO_API_KEY`

### GitHub Actions Secrets

For the price refresh workflow to function, configure these secrets in your GitHub repository:

- `REFRESH_ENDPOINT_URL`: Full URL to your deployed `/api/prices/refresh` endpoint
- `REFRESH_AUTH_HEADER`: Optional authentication header if your middleware requires auth

### Database Considerations

- **Production Database**: Vercel uses PostgreSQL for production
- **Migrations**: Run migrations during deployment
- **Backups**: Set up regular database backups

## Monitoring and Troubleshooting

### Common Issues

#### Authentication Problems

**Issue**: Can't log in despite correct password
**Solution**: 
- Check `APP_PASSWORD` environment variable
- Clear browser cookies
- Check browser console for errors

#### Price Refresh Failures

**Issue**: Prices not updating
**Solution**:
- Check API keys are valid
- Monitor rate limit status at `/api/prices/rate-limit`
- Check Vercel function logs
- Verify assets have `AUTO` pricing mode

#### Rate Limiting Issues

**Issue**: Hitting CoinGecko rate limits
**Solution**:
- Monitor usage at `/api/prices/rate-limit`
- Consider upgrading CoinGecko plan
- Adjust refresh intervals

#### Database Issues

**Issue**: Database connection problems
**Solution**:
- Check `DATABASE_URL` environment variable
- Run migrations: `npm run prisma:migrate`
- Check Prisma client generation

### Monitoring Endpoints

- **Health Check**: `GET /api/prices/health`
- **Rate Limit Status**: `GET /api/prices/rate-limit`
- **Settings**: `GET /api/settings`

### Logging

The application includes comprehensive logging:

- **Pricing Operations**: All price fetch operations are logged
- **Rate Limiting**: Rate limiter tracks call history
- **Errors**: Detailed error logging with context
- **Performance**: Operation duration tracking

### Performance Optimization

- **Batch Processing**: Crypto prices fetched in batches
- **Rate Limiting**: Prevents API abuse and optimizes usage
- **Caching**: Latest prices cached in database
- **Retry Logic**: Exponential backoff for failed requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines

- Follow existing code style
- Add appropriate error handling
- Update documentation
- Test rate limiting behavior
- Verify database migrations

## License

This project is licensed under the MIT License.

## Support

For issues and questions:

1. Check this README for common solutions
2. Review the troubleshooting section
3. Check existing GitHub issues
4. Create a new issue with detailed information

---

**Note**: This application is designed for single-user use. For multi-user scenarios, additional authentication and authorization logic would be required.