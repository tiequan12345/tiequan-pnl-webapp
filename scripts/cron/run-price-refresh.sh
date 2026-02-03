#!/usr/bin/env bash
set -euo pipefail

# Hourly job runner for Tiequan price refresh / snapshot generation.
#
# Expected env vars:
#   REFRESH_ENDPOINT_URL   (required) e.g. https://<host>/api/prices/refresh
#   REFRESH_AUTH_HEADER    (optional) e.g. "Authorization: Bearer <token>"
#   ENV_FILE               (optional) path to a file to source before running
#
# Example ENV_FILE contents:
#   REFRESH_ENDPOINT_URL="https://example.com/api/prices/refresh"
#   REFRESH_AUTH_HEADER="Authorization: Bearer ..."

ENV_FILE="${ENV_FILE:-/etc/tiequan-pnl-webapp.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

: "${REFRESH_ENDPOINT_URL:?REFRESH_ENDPOINT_URL is required}"

LOCK_FILE="${LOCK_FILE:-/tmp/tiequan-price-refresh.lock}"

run_refresh() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Triggering scheduled refresh: $REFRESH_ENDPOINT_URL"

  local -a extra_headers=()
  if [[ -n "${REFRESH_AUTH_HEADER:-}" ]]; then
    extra_headers+=( -H "$REFRESH_AUTH_HEADER" )
  fi

  curl -X POST "$REFRESH_ENDPOINT_URL" \
    -H "Content-Type: application/json" \
    -H "X-Refresh-Mode: auto" \
    "${extra_headers[@]}" \
    --fail --show-error --max-time "${CURL_MAX_TIME:-30}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ✅ Refresh completed"
}

# Prevent overlap if a previous run is still executing.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Another refresh is already running; exiting." >&2
    exit 0
  fi
  run_refresh
else
  # Best-effort fallback (no strong locking)
  run_refresh
fi
