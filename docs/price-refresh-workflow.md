# Price Refresh Workflow Guide

This guide explains how the automated price refresh system works using GitHub Actions, and what operators need to know to maintain and monitor it.

## Overview

The price refresh system has been migrated from Vercel Cron to a GitHub Actions workflow that runs on a schedule and can also be manually triggered. The workflow calls the existing `/api/prices/refresh` endpoint to update crypto and equity prices.

## Architecture

### Previous (Vercel Cron)
- Scheduled via `vercel.json` configuration
- Runs on Vercel's infrastructure
- Limited to Vercel deployment environment

### Current (GitHub Actions)
- Scheduled via `.github/workflows/price-refresh.yml`
- Runs on GitHub's hosted runners (ubuntu-latest)
- Calls the app's `/api/prices/refresh` endpoint over HTTPS
- Supports manual triggering via GitHub Actions UI

## GitHub Actions Workflow

### File Location
`.github/workflows/price-refresh.yml`

### Schedule
- **Automatic**: Runs every hour at the top of the hour (`0 * * * *`)
- **Manual**: Can be triggered manually via GitHub Actions UI

### Workflow Steps
1. **Settings Check**: The endpoint checks if auto-refresh is enabled in settings
2. **Trigger Price Refresh**: Makes POST request to the refresh endpoint with `X-Refresh-Mode: auto` header
3. **Log Success/Failure**: Reports status and timestamp
4. **Persist Snapshot**: After prices refresh, the backend records a `PortfolioSnapshot` row (and related components) capturing the base-currency total and breakdowns for historical PNL charts.

### Settings Toggle Handling
- **Scheduled runs** (with `X-Refresh-Mode: auto` header): Check `priceAutoRefresh` setting
  - If disabled: Return success message without performing refresh
  - If enabled: Proceed with normal refresh process
- **Manual runs** (no special header): Always execute regardless of settings

### Authentication
The workflow supports optional authentication via the `REFRESH_AUTH_HEADER` secret.

### Settings Toggle
The workflow respects the `priceAutoRefresh` setting from the app's settings page:
- When `priceAutoRefresh` is disabled, scheduled runs will skip the refresh and return a success response
- Manual refreshes (via Settings page or GitHub Actions UI) will always run regardless of this setting
- The workflow includes the `X-Refresh-Mode: auto` header to identify scheduled runs

## Required Secrets

Configure these secrets in your GitHub repository settings (`Settings` > `Secrets and variables` > `Actions`):

### Required
- `REFRESH_ENDPOINT_URL`: Full URL to your app's price refresh endpoint
  - Example: `https://your-domain.com/api/prices/refresh`
  - Example (local development): `http://localhost:3000/api/prices/refresh`

### Optional
- `REFRESH_AUTH_HEADER`: Authentication header if your middleware requires it
  - Example: `Authorization: Bearer your-token-here`
  - Example: `X-API-Key: your-api-key`

## Application Configuration

### Environment Variables on VM/Server
Ensure these are configured in your application's environment:

```bash
# Required for price fetching
COINGECKO_API_KEY=your_coingecko_api_key
FINNHUB_API_KEY=your_finnhub_api_key

# Authentication (if using middleware)
APP_PASSWORD=your_app_password
```

### Settings Page Configuration
The app respects these settings from the settings page:
- `priceAutoRefresh`: Enable/disable automatic refresh (UI toggle)
- `priceAutoRefreshIntervalMinutes`: Refresh interval preference
- `priceRefreshEndpoint`: Custom endpoint for testing

**Settings Toggle Behavior:**
- **Scheduled Runs**: GitHub Actions workflow runs respect the `priceAutoRefresh` setting
  - When disabled: Scheduled runs return success but skip the actual refresh
  - When enabled: Scheduled runs perform the full refresh as normal
- **Manual Runs**: Always execute regardless of the `priceAutoRefresh` setting
  - Settings page "Refresh Prices Now" button
  - Manual GitHub Actions workflow trigger

## Monitoring and Maintenance

### Check Workflow Status
1. Go to your repository on GitHub
2. Click the "Actions" tab
3. Look for "Price Refresh" workflow runs
4. Check individual runs for success/failure status

### Health Monitoring
Use these endpoints to monitor system health:

- **Health Check**: `GET /api/prices/health`
  - Overall system status
  - Asset update coverage
  - Rate limit status
  - Response time metrics

- **Rate Limit Status**: `GET /api/prices/rate-limit`
  - Current API usage
  - Remaining calls
  - Usage recommendations

- **PNL History**: `GET /api/pnl`
  - Confirms that each price refresh creates a new snapshot
  - Returns snapshot breakdowns for type, volatility, and account
  - Useful to cross-check raw database data with the `/pnl` UI for correctness

### Manual Refresh
Two ways to manually trigger a refresh:
1. **Via Settings Page**: Click "Refresh Prices Now" button
2. **Via GitHub Actions**: Manually run the workflow from Actions tab

## Troubleshooting

### Workflow Not Running
1. Check GitHub Actions is enabled for the repository
2. Verify the workflow file exists at `.github/workflows/price-refresh.yml`
3. Ensure repository has necessary permissions

### Refresh Failing
1. Check `REFRESH_ENDPOINT_URL` secret is correctly configured
2. Verify the endpoint is accessible from GitHub's servers
3. Check application logs for detailed error messages
4. Ensure API keys are valid and have sufficient rate limits

### Snapshots Not Created
1. Confirm the `PortfolioSnapshot` migration has been applied (`pnpm prisma migrate dev`)
2. Verify the refresh run logged `snapshot_recorded` and no snapshot-related errors
3. Query `/api/pnl` (or the database) to ensure new rows exist after a refresh
4. If the table is empty despite successful refreshes, investigate connection permissions or transaction rollback logs

### Authentication Issues
1. Verify `REFRESH_AUTH_HEADER` format matches your middleware expectations
2. Check if the authentication token has expired
3. Test the endpoint manually with curl to isolate the issue

### High Rate Limit Usage
1. Check rate limit status endpoint
2. Consider reducing refresh frequency (modify cron schedule)
3. Verify batch processing is working correctly
4. Monitor CoinGecko API usage patterns

### Stale Price Data
1. Check latest workflow run timestamp
2. Verify application is running and accessible
3. Check health endpoint for update coverage
4. Review application logs for failed refresh attempts
5. Verify `priceAutoRefresh` setting is enabled in the app settings
6. Check workflow logs for "Auto refresh disabled in settings" messages

## Cron Schedule Management

### Current Schedule
The workflow runs every hour: `0 * * * *`

### Changing the Schedule
To modify the frequency:
1. Edit `.github/workflows/price-refresh.yml`
2. Change the cron expression in the `schedule` section
3. Consider aligning with `priceAutoRefreshIntervalMinutes` setting

Common cron expressions:
- Every 15 minutes: `*/15 * * * *`
- Every 30 minutes: `*/30 * * * *`
- Every 2 hours: `0 */2 * * *`
- Daily at midnight: `0 0 * * *`

## Migration Notes

### What Changed
- **Removed**: Vercel cron configuration from `vercel.json`
- **Added**: GitHub Actions workflow at `.github/workflows/price-refresh.yml`
- **Added**: `PortfolioSnapshot`/`PortfolioSnapshotComponent` tables via Prisma migration so price refresh runs persist historical snapshots
- **Updated**: Documentation to reflect GitHub Actions scheduling

### Backward Compatibility
- The `/api/prices/refresh` endpoint remains unchanged
- Manual refresh via Settings page continues to work
- All existing API endpoints and functionality preserved

### Breaking Changes
- Scheduling is now controlled by GitHub Actions instead of Vercel
- Requires GitHub repository secrets configuration
- Network access from GitHub to your application required

## Security Considerations

### Endpoint Security
- The price refresh endpoint should be publicly accessible or use appropriate authentication
- Ensure rate limiting is in place to prevent abuse
- Monitor for unusual usage patterns

### Secret Management
- Store all secrets in GitHub repository settings, not in code
- Rotate secrets regularly
- Use environment-specific secrets for different deployments

### Network Security
- Ensure your application is accessible over HTTPS in production
- Consider IP whitelisting if your GitHub organization has static IP ranges
- Monitor network logs for suspicious activity

## Support

### Logs and Debugging
1. **GitHub Actions Logs**: Check workflow run logs for step-by-step execution details
2. **Application Logs**: Check your application's logs for detailed error information
3. **Health Endpoints**: Use `/api/prices/health` and `/api/prices/rate-limit` for system status

### Getting Help
- Review this documentation first
- Check the main `PRICE_REFRESH_IMPROVEMENTS.md` for technical details
- Examine GitHub Actions workflow logs for specific error messages
- Test endpoints manually using curl to isolate issues

## Quick Reference

### Common Commands
```bash
# Test the refresh endpoint manually
curl -X POST "https://your-domain.com/api/prices/refresh" \
  -H "Content-Type: application/json"

# Check health status
curl "https://your-domain.com/api/prices/health"

# Check rate limit status
curl "https://your-domain.com/api/prices/rate-limit"
```

### Important Files
- `.github/workflows/price-refresh.yml` - GitHub Actions workflow
- `vercel.json` - Previously contained cron config (now empty)
- `PRICE_REFRESH_IMPROVEMENTS.md` - Technical implementation details

### Key Endpoints
- `POST /api/prices/refresh` - Main refresh endpoint
- `GET /api/prices/health` - Health monitoring
- `GET /api/prices/rate-limit` - Rate limit status
- `GET /api/settings` - Application settings