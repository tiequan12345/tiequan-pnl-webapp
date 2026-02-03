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

## 4) (Optional) Remove the GitHub Actions schedule

Once cron is running reliably, you can delete `.github/workflows/price-refresh.yml` to avoid double-triggering.
