#!/usr/bin/env bash
set -euo pipefail

# CCXT sync runner (Binance / Bybit).
#
# Expected env vars:
#   CCXT_SYNC_ENDPOINT_URL (required) e.g. https://<host>/api/cron/ccxt/sync
#   CCXT_SYNC_ACCOUNT_ID   (required) local account id
#   CCXT_SYNC_EXCHANGE     (required) binance|bybit
#   CCXT_SYNC_MODE         (optional) trades|balances|full (default: trades)
#   CCXT_SYNC_SINCE        (optional) ISO 8601 with timezone (override for one run)
#   CCXT_SYNC_AUTH_HEADER  (required) e.g. "Authorization: Bearer <token>"
#   ENV_FILE               (optional) path to env file to source
#
# Example ENV_FILE contents:
#   CCXT_SYNC_ENDPOINT_URL="https://example.com/api/cron/ccxt/sync"
#   CCXT_SYNC_AUTH_HEADER="Authorization: Bearer ..."
#
# Example one-off override in cron line:
#   CCXT_SYNC_ACCOUNT_ID=4 CCXT_SYNC_EXCHANGE=binance CCXT_SYNC_MODE=trades /bin/bash .../run-ccxt-sync.sh

ENV_FILE="${ENV_FILE:-/etc/tiequan-pnl-webapp.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

: "${CCXT_SYNC_ENDPOINT_URL:?CCXT_SYNC_ENDPOINT_URL is required}"
: "${CCXT_SYNC_ACCOUNT_ID:?CCXT_SYNC_ACCOUNT_ID is required}"
: "${CCXT_SYNC_EXCHANGE:?CCXT_SYNC_EXCHANGE is required}"
: "${CCXT_SYNC_AUTH_HEADER:?CCXT_SYNC_AUTH_HEADER is required}"

CCXT_SYNC_MODE="${CCXT_SYNC_MODE:-trades}"

exchange_lc="$(echo "$CCXT_SYNC_EXCHANGE" | tr '[:upper:]' '[:lower:]')"
mode_lc="$(echo "$CCXT_SYNC_MODE" | tr '[:upper:]' '[:lower:]')"

if [[ "$exchange_lc" != "binance" && "$exchange_lc" != "bybit" ]]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Invalid CCXT_SYNC_EXCHANGE: $CCXT_SYNC_EXCHANGE" >&2
  exit 1
fi

if [[ "$mode_lc" != "trades" && "$mode_lc" != "balances" && "$mode_lc" != "full" ]]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Invalid CCXT_SYNC_MODE: $CCXT_SYNC_MODE" >&2
  exit 1
fi

LOCK_FILE="${LOCK_FILE:-/tmp/tiequan-ccxt-sync-${exchange_lc}-${CCXT_SYNC_ACCOUNT_ID}-${mode_lc}.lock}"

run_sync() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Triggering CCXT sync: exchange=${exchange_lc} accountId=${CCXT_SYNC_ACCOUNT_ID} mode=${mode_lc}"

  local payload
  if [[ -n "${CCXT_SYNC_SINCE:-}" ]]; then
    payload="{\"accountId\":${CCXT_SYNC_ACCOUNT_ID},\"exchange\":\"${exchange_lc}\",\"mode\":\"${mode_lc}\",\"since\":\"${CCXT_SYNC_SINCE}\"}"
  else
    payload="{\"accountId\":${CCXT_SYNC_ACCOUNT_ID},\"exchange\":\"${exchange_lc}\",\"mode\":\"${mode_lc}\"}"
  fi

  curl -X POST "$CCXT_SYNC_ENDPOINT_URL" \
    -H "Content-Type: application/json" \
    -H "$CCXT_SYNC_AUTH_HEADER" \
    --data "$payload" \
    --fail --show-error --max-time "${CURL_MAX_TIME:-120}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ✅ CCXT sync completed"
}

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Another CCXT sync is already running for this target; exiting." >&2
    exit 0
  fi
  run_sync
else
  run_sync
fi
