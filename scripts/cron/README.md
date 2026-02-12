# Cron (hourly price refresh / snapshots)

This repo previously used GitHub Actions (`.github/workflows/price-refresh.yml`) to trigger an hourly refresh by calling the app endpoint.

If you want to run it from a server using `crontab`, use `scripts/cron/run-price-refresh.sh`.

## 1) Create an env file on the server

Create `/etc/tiequan-pnl-webapp.env` (or any path you prefer):

```bash
REFRESH_ENDPOINT_URL="https://<your-host>/api/prices/refresh"
# Optional:
REFRESH_AUTH_HEADER="Authorization: Bearer <token>"
```

Make it readable only by the user running cron:

```bash
sudo chmod 600 /etc/tiequan-pnl-webapp.env
sudo chown <user>:<group> /etc/tiequan-pnl-webapp.env
```

## 2) Make the script executable

```bash
chmod +x /path/to/repo/scripts/cron/run-price-refresh.sh
```

## 3) Install the cron entry

Tip: in production, your repo path may differ from local dev. Use the real absolute path on that machine (for example `/home/ubuntu/tiequan-pnl-webapp`), not your local path.

Edit crontab:

```bash
crontab -e
```

Add:

```cron
# Run every hour at the top of the hour (UTC)
0 * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env /bin/bash /path/to/repo/scripts/cron/run-price-refresh.sh >> /var/log/tiequan-price-refresh.log 2>&1
```

Notes:
- Cron runs with a minimal environment: always use absolute paths.
- If you want local time instead of UTC, ensure the server timezone is set appropriately.
- The script uses `flock` (if available) to prevent overlapping executions.

## TradeStation order sync (recommended)

Use the helper script `scripts/cron/run-tradestation-order-sync.sh` to import recent orders on a schedule.

Example env file additions:

```bash
TS_ORDER_SYNC_ENDPOINT_URL="https://port.tiequan.app/api/tradestation/sync"
TS_ORDER_SYNC_ACCOUNT_ID="4"
# Optional
TS_ORDER_SYNC_AUTH_HEADER="Authorization: Bearer <token>"
```

Make the script executable:

```bash
chmod +x /path/to/repo/scripts/cron/run-tradestation-order-sync.sh
```

Example cron entry (every 30 minutes):

```cron
*/30 * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env /bin/bash /path/to/repo/scripts/cron/run-tradestation-order-sync.sh >> /var/log/tiequan-tradestation-orders.log 2>&1
```

## CCXT sync queue (Binance / Bybit)

CCXT sync now runs as **async jobs**:
1. enqueue jobs (`/api/cron/ccxt/sync`)
2. process queue (`/api/cron/ccxt/sync-jobs`)

Use both helper scripts:
- `scripts/cron/run-ccxt-sync.sh` (enqueue)
- `scripts/cron/run-ccxt-sync-worker.sh` (worker)

### Env file additions

```bash
# Auth token must match CCXT_CRON_SYNC_TOKEN in app env
CCXT_SYNC_AUTH_HEADER="Authorization: Bearer <token>"

# Enqueue endpoint
CCXT_SYNC_ENDPOINT_URL="https://port.tiequan.app/api/cron/ccxt/sync"

# Worker endpoint
CCXT_SYNC_WORKER_ENDPOINT_URL="https://port.tiequan.app/api/cron/ccxt/sync-jobs"
CCXT_SYNC_WORKER_MAX_JOBS="1"
# Optional default target queue for worker (override per cron line)
# CCXT_SYNC_WORKER_EXCHANGE="binance"

# You can define enqueue defaults here and override per cron line
CCXT_SYNC_ACCOUNT_ID="4"
CCXT_SYNC_EXCHANGE="binance"
CCXT_SYNC_MODE="trades"
# Optional one-off override cutoff (ISO 8601 with timezone)
# CCXT_SYNC_SINCE="2026-02-11T13:30:00.000Z"
```

Make the scripts executable:

```bash
chmod +x /path/to/repo/scripts/cron/run-ccxt-sync.sh
chmod +x /path/to/repo/scripts/cron/run-ccxt-sync-worker.sh
```

Example cron entries:

```cron
# Workers: run in parallel, one per exchange (recommended for rate limits)
* * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env CCXT_SYNC_WORKER_EXCHANGE=binance /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync-worker.sh >> /var/log/tiequan-ccxt-worker-binance.log 2>&1
* * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env CCXT_SYNC_WORKER_EXCHANGE=bybit /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync-worker.sh >> /var/log/tiequan-ccxt-worker-bybit.log 2>&1

# Binance trades enqueue every 15 minutes
*/15 * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env CCXT_SYNC_ACCOUNT_ID=4 CCXT_SYNC_EXCHANGE=binance CCXT_SYNC_MODE=trades /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync.sh >> /var/log/tiequan-ccxt-binance-trades-enqueue.log 2>&1

# Bybit trades enqueue every 15 minutes, offset to reduce contention
5,20,35,50 * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env CCXT_SYNC_ACCOUNT_ID=5 CCXT_SYNC_EXCHANGE=bybit CCXT_SYNC_MODE=trades /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync.sh >> /var/log/tiequan-ccxt-bybit-trades-enqueue.log 2>&1

# Hourly balances enqueue for Binance
10 * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env CCXT_SYNC_ACCOUNT_ID=4 CCXT_SYNC_EXCHANGE=binance CCXT_SYNC_MODE=balances /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync.sh >> /var/log/tiequan-ccxt-binance-balances-enqueue.log 2>&1
```

Notes:
- If `CCXT_SYNC_SINCE` is omitted, the app uses saved `sync_since` by default.
- Use absolute paths in cron entries.
- Both scripts use `flock` (if available) to prevent overlapping runs.
- Worker lock files are exchange-scoped when `CCXT_SYNC_WORKER_EXCHANGE` is set, so Binance + Bybit workers can run at the same time.

## TradeStation daily cash reconciliation

Use the helper script `scripts/cron/run-tradestation-cash-reconcile.sh` to reconcile TradeStation cash balances to the ledger once per day.

Example env file additions:

```bash
TS_CASH_SYNC_ENDPOINT_URL="https://port.tiequan.app/api/tradestation/sync"
TS_CASH_SYNC_ACCOUNT_ID="4"
# Optional
TS_CASH_SYNC_AUTH_HEADER="Authorization: Bearer <token>"
```

Make the script executable:

```bash
chmod +x /path/to/repo/scripts/cron/run-tradestation-cash-reconcile.sh
```

Example cron entry (daily at 01:15 UTC):

```cron
15 1 * * * ENV_FILE=/etc/tiequan-pnl-webapp.env /bin/bash /path/to/repo/scripts/cron/run-tradestation-cash-reconcile.sh >> /var/log/tiequan-tradestation-cash.log 2>&1
```

## 4) (Optional) Remove the GitHub Actions schedule

Once cron is running reliably, you can delete `.github/workflows/price-refresh.yml` to avoid double-triggering.
