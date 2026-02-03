#!/usr/bin/env bash
set -euo pipefail

# TradeStation order sync runner.
#
# Expected env vars:
#   TS_ORDER_SYNC_ENDPOINT_URL (required) e.g. https://<host>/api/tradestation/sync
#   TS_ORDER_SYNC_ACCOUNT_ID   (required) local account id
#   TS_ORDER_SYNC_AUTH_HEADER  (optional) e.g. "Authorization: Bearer <token>"
#   ENV_FILE                   (optional) path to env file to source
#
# Example ENV_FILE contents:
#   TS_ORDER_SYNC_ENDPOINT_URL="https://example.com/api/tradestation/sync"
#   TS_ORDER_SYNC_ACCOUNT_ID="42"
#   TS_ORDER_SYNC_AUTH_HEADER="Authorization: Bearer ..."

ENV_FILE="${ENV_FILE:-/etc/tiequan-pnl-webapp.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

: "${TS_ORDER_SYNC_ENDPOINT_URL:?TS_ORDER_SYNC_ENDPOINT_URL is required}"
: "${TS_ORDER_SYNC_ACCOUNT_ID:?TS_ORDER_SYNC_ACCOUNT_ID is required}"

LOCK_FILE="${LOCK_FILE:-/tmp/tiequan-tradestation-order-sync.lock}"

run_sync() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Triggering TradeStation order sync: $TS_ORDER_SYNC_ENDPOINT_URL"

  local -a extra_headers=()
  if [[ -n "${TS_ORDER_SYNC_AUTH_HEADER:-}" ]]; then
    extra_headers+=( -H "$TS_ORDER_SYNC_AUTH_HEADER" )
  fi

  curl -X POST "$TS_ORDER_SYNC_ENDPOINT_URL" \
    -H "Content-Type: application/json" \
    "${extra_headers[@]}" \
    --data "{\"accountId\":${TS_ORDER_SYNC_ACCOUNT_ID},\"mode\":\"orders\"}" \
    --fail --show-error --max-time "${CURL_MAX_TIME:-60}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ✅ Order sync completed"
}

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Another order sync is already running; exiting." >&2
    exit 0
  fi
  run_sync
else
  run_sync
fi
