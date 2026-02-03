#!/usr/bin/env bash
set -euo pipefail

# Daily TradeStation cash reconciliation runner.
#
# Expected env vars:
#   TS_CASH_SYNC_ENDPOINT_URL (required) e.g. https://<host>/api/tradestation/sync
#   TS_CASH_SYNC_ACCOUNT_ID   (required) local account id
#   TS_CASH_SYNC_AUTH_HEADER  (optional) e.g. "Authorization: Bearer <token>"
#   ENV_FILE                  (optional) path to env file to source
#
# Example ENV_FILE contents:
#   TS_CASH_SYNC_ENDPOINT_URL="https://example.com/api/tradestation/sync"
#   TS_CASH_SYNC_ACCOUNT_ID="42"
#   TS_CASH_SYNC_AUTH_HEADER="Authorization: Bearer ..."

ENV_FILE="${ENV_FILE:-/etc/tiequan-pnl-webapp.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

: "${TS_CASH_SYNC_ENDPOINT_URL:?TS_CASH_SYNC_ENDPOINT_URL is required}"
: "${TS_CASH_SYNC_ACCOUNT_ID:?TS_CASH_SYNC_ACCOUNT_ID is required}"

LOCK_FILE="${LOCK_FILE:-/tmp/tiequan-tradestation-cash-reconcile.lock}"

run_reconcile() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Triggering TradeStation cash reconcile: $TS_CASH_SYNC_ENDPOINT_URL"

  local -a extra_headers=()
  if [[ -n "${TS_CASH_SYNC_AUTH_HEADER:-}" ]]; then
    extra_headers+=( -H "$TS_CASH_SYNC_AUTH_HEADER" )
  fi

  curl -X POST "$TS_CASH_SYNC_ENDPOINT_URL" \
    -H "Content-Type: application/json" \
    "${extra_headers[@]}" \
    --data "{\"accountId\":${TS_CASH_SYNC_ACCOUNT_ID},\"mode\":\"cash\"}" \
    --fail --show-error --max-time "${CURL_MAX_TIME:-30}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ✅ Cash reconciliation completed"
}

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Another cash reconcile is already running; exiting." >&2
    exit 0
  fi
  run_reconcile
else
  run_reconcile
fi
