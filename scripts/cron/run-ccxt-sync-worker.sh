#!/usr/bin/env bash
set -euo pipefail

# CCXT sync queue worker runner.
#
# Expected env vars:
#   CCXT_SYNC_WORKER_ENDPOINT_URL (required) e.g. https://<host>/api/cron/ccxt/sync-jobs
#   CCXT_SYNC_AUTH_HEADER         (required) e.g. "Authorization: Bearer <token>"
#   CCXT_SYNC_WORKER_MAX_JOBS     (optional) number of jobs to process per run (default: 1)
#   CCXT_SYNC_WORKER_EXCHANGE     (optional) binance|bybit (process only this exchange queue)
#   CURL_MAX_TIME                 (optional) curl timeout in seconds (default: 1800)
#   ENV_FILE                      (optional) path to env file to source

ENV_FILE="${ENV_FILE:-/etc/tiequan-pnl-webapp.env}"

# Preserve explicit runtime overrides (e.g. cron inline vars) so env-file defaults
# do not clobber them.
endpoint_override="${CCXT_SYNC_WORKER_ENDPOINT_URL-}"
endpoint_override_set="${CCXT_SYNC_WORKER_ENDPOINT_URL+x}"
max_jobs_override="${CCXT_SYNC_WORKER_MAX_JOBS-}"
max_jobs_override_set="${CCXT_SYNC_WORKER_MAX_JOBS+x}"
exchange_override="${CCXT_SYNC_WORKER_EXCHANGE-}"
exchange_override_set="${CCXT_SYNC_WORKER_EXCHANGE+x}"
auth_override="${CCXT_SYNC_AUTH_HEADER-}"
auth_override_set="${CCXT_SYNC_AUTH_HEADER+x}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -n "$endpoint_override_set" ]]; then CCXT_SYNC_WORKER_ENDPOINT_URL="$endpoint_override"; fi
if [[ -n "$max_jobs_override_set" ]]; then CCXT_SYNC_WORKER_MAX_JOBS="$max_jobs_override"; fi
if [[ -n "$exchange_override_set" ]]; then CCXT_SYNC_WORKER_EXCHANGE="$exchange_override"; fi
if [[ -n "$auth_override_set" ]]; then CCXT_SYNC_AUTH_HEADER="$auth_override"; fi

: "${CCXT_SYNC_WORKER_ENDPOINT_URL:?CCXT_SYNC_WORKER_ENDPOINT_URL is required}"
: "${CCXT_SYNC_AUTH_HEADER:?CCXT_SYNC_AUTH_HEADER is required}"

CCXT_SYNC_WORKER_MAX_JOBS="${CCXT_SYNC_WORKER_MAX_JOBS:-1}"

exchange_lc=""
if [[ -n "${CCXT_SYNC_WORKER_EXCHANGE:-}" ]]; then
  exchange_lc="$(echo "$CCXT_SYNC_WORKER_EXCHANGE" | tr '[:upper:]' '[:lower:]')"
  if [[ "$exchange_lc" != "binance" && "$exchange_lc" != "bybit" ]]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Invalid CCXT_SYNC_WORKER_EXCHANGE: $CCXT_SYNC_WORKER_EXCHANGE" >&2
    exit 1
  fi
fi

target_label="${exchange_lc:-all}"
LOCK_FILE="${LOCK_FILE:-/tmp/tiequan-ccxt-sync-worker-${target_label}.lock}"

run_worker() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Triggering CCXT sync worker: maxJobs=${CCXT_SYNC_WORKER_MAX_JOBS} exchange=${target_label}"

  local payload
  if [[ -n "$exchange_lc" ]]; then
    payload="{\"maxJobs\":${CCXT_SYNC_WORKER_MAX_JOBS},\"exchange\":\"${exchange_lc}\"}"
  else
    payload="{\"maxJobs\":${CCXT_SYNC_WORKER_MAX_JOBS}}"
  fi

  curl -X POST "$CCXT_SYNC_WORKER_ENDPOINT_URL" \
    -H "Content-Type: application/json" \
    -H "$CCXT_SYNC_AUTH_HEADER" \
    --data "$payload" \
    --fail --show-error --max-time "${CURL_MAX_TIME:-1800}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ✅ CCXT sync worker completed"
}

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] CCXT sync worker already running for target=${target_label}; exiting." >&2
    exit 0
  fi
  run_worker
else
  run_worker
fi
