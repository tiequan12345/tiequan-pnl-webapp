#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DB_PATH="${DB_PATH:-$REPO_ROOT/prisma/dev.db}"
RUNNING_TIMEOUT_MINUTES="${CCXT_SYNC_JOB_RUNNING_TIMEOUT_MINUTES:-30}"
HEARTBEAT_STALE_SECONDS="${CCXT_STATUS_HEARTBEAT_STALE_SECONDS:-120}"
RECENT_LIMIT="${CCXT_STATUS_RECENT_LIMIT:-8}"
SQLITE_BUSY_TIMEOUT_MS="${CCXT_STATUS_SQLITE_BUSY_TIMEOUT_MS:-5000}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required but not found." >&2
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

if ! [[ "$RUNNING_TIMEOUT_MINUTES" =~ ^[0-9]+$ ]]; then
  echo "CCXT_SYNC_JOB_RUNNING_TIMEOUT_MINUTES must be an integer." >&2
  exit 1
fi

if ! [[ "$HEARTBEAT_STALE_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "CCXT_STATUS_HEARTBEAT_STALE_SECONDS must be an integer." >&2
  exit 1
fi

if ! [[ "$RECENT_LIMIT" =~ ^[0-9]+$ ]]; then
  echo "CCXT_STATUS_RECENT_LIMIT must be an integer." >&2
  exit 1
fi

if ! [[ "$SQLITE_BUSY_TIMEOUT_MS" =~ ^[0-9]+$ ]]; then
  echo "CCXT_STATUS_SQLITE_BUSY_TIMEOUT_MS must be an integer." >&2
  exit 1
fi

run_sqlite() {
  sqlite3 -cmd ".timeout ${SQLITE_BUSY_TIMEOUT_MS}" "$DB_PATH" "$@"
}

echo "CCXT Sync Status"
echo "Generated: $(date -u +%Y-%m-%d\ %H:%M:%S\ UTC)"
echo "Database:  $DB_PATH"
echo "Thresholds: timeout=${RUNNING_TIMEOUT_MINUTES}m, stale-heartbeat=${HEARTBEAT_STALE_SECONDS}s"
echo "Columns: Recon=result_json.reconciled, Pos=result_json.reconciledPositions (fallback: POSITION rows touched), Bal=result_json.reconciledBalances (fallback: BALANCE rows touched)"
echo

# Summary counts first for a quick at-a-glance status.
echo "== Queue Snapshot =="
run_sqlite <<'SQL'
.mode column
.header on
SELECT
  status AS "Status",
  COUNT(*) AS "Count"
FROM CcxtSyncJob
GROUP BY status
ORDER BY CASE status
  WHEN 'RUNNING' THEN 1
  WHEN 'QUEUED' THEN 2
  WHEN 'FAILED' THEN 3
  WHEN 'SUCCESS' THEN 4
  ELSE 5
END;
SQL
echo

echo "== Active Jobs (RUNNING + QUEUED) =="
run_sqlite <<SQL
.mode column
.header on
WITH cfg AS (
  SELECT
    CAST(strftime('%s','now') AS INTEGER) * 1000 AS now_ms,
    ${RUNNING_TIMEOUT_MINUTES} * 60 * 1000 AS running_timeout_ms,
    ${HEARTBEAT_STALE_SECONDS} * 1000 AS heartbeat_stale_ms
), jobs AS (
  SELECT
    id,
    exchange_id,
    mode,
    status,
    attempts,
    progress_json,
    error_message,
    CASE
      WHEN created_at IS NULL THEN NULL
      WHEN typeof(created_at) IN ('integer','real') THEN CAST(created_at AS INTEGER)
      WHEN created_at GLOB '[0-9]*' THEN CAST(created_at AS INTEGER)
      ELSE CAST(strftime('%s', created_at) AS INTEGER) * 1000
    END AS created_ms,
    CASE
      WHEN started_at IS NULL THEN NULL
      WHEN typeof(started_at) IN ('integer','real') THEN CAST(started_at AS INTEGER)
      WHEN started_at GLOB '[0-9]*' THEN CAST(started_at AS INTEGER)
      ELSE CAST(strftime('%s', started_at) AS INTEGER) * 1000
    END AS started_ms,
    CASE
      WHEN heartbeat_at IS NULL THEN NULL
      WHEN typeof(heartbeat_at) IN ('integer','real') THEN CAST(heartbeat_at AS INTEGER)
      WHEN heartbeat_at GLOB '[0-9]*' THEN CAST(heartbeat_at AS INTEGER)
      ELSE CAST(strftime('%s', heartbeat_at) AS INTEGER) * 1000
    END AS heartbeat_ms,
    CASE
      WHEN next_run_at IS NULL THEN NULL
      WHEN typeof(next_run_at) IN ('integer','real') THEN CAST(next_run_at AS INTEGER)
      WHEN next_run_at GLOB '[0-9]*' THEN CAST(next_run_at AS INTEGER)
      ELSE CAST(strftime('%s', next_run_at) AS INTEGER) * 1000
    END AS next_run_ms
  FROM CcxtSyncJob
)
SELECT
  id AS "ID",
  exchange_id AS "Ex",
  mode AS "Mode",
  status AS "Status",
  attempts AS "Try",
  CASE
    WHEN status = 'RUNNING' THEN
      CASE
        WHEN (cfg.now_ms - COALESCE(started_ms, created_ms)) < 60000 THEN printf('%ds', (cfg.now_ms - COALESCE(started_ms, created_ms)) / 1000)
        WHEN (cfg.now_ms - COALESCE(started_ms, created_ms)) < 3600000 THEN printf('%dm %02ds', (cfg.now_ms - COALESCE(started_ms, created_ms)) / 60000, ((cfg.now_ms - COALESCE(started_ms, created_ms)) / 1000) % 60)
        WHEN (cfg.now_ms - COALESCE(started_ms, created_ms)) < 86400000 THEN printf('%dh %02dm', (cfg.now_ms - COALESCE(started_ms, created_ms)) / 3600000, ((cfg.now_ms - COALESCE(started_ms, created_ms)) / 60000) % 60)
        ELSE printf('%dd %02dh', (cfg.now_ms - COALESCE(started_ms, created_ms)) / 86400000, ((cfg.now_ms - COALESCE(started_ms, created_ms)) / 3600000) % 24)
      END
    ELSE
      CASE
        WHEN (cfg.now_ms - created_ms) < 60000 THEN printf('%ds', (cfg.now_ms - created_ms) / 1000)
        WHEN (cfg.now_ms - created_ms) < 3600000 THEN printf('%dm %02ds', (cfg.now_ms - created_ms) / 60000, ((cfg.now_ms - created_ms) / 1000) % 60)
        WHEN (cfg.now_ms - created_ms) < 86400000 THEN printf('%dh %02dm', (cfg.now_ms - created_ms) / 3600000, ((cfg.now_ms - created_ms) / 60000) % 60)
        ELSE printf('%dd %02dh', (cfg.now_ms - created_ms) / 86400000, ((cfg.now_ms - created_ms) / 3600000) % 24)
      END
  END AS "Age",
  CASE
    WHEN status = 'RUNNING' AND heartbeat_ms IS NULL THEN 'NO_HEARTBEAT'
    WHEN status = 'RUNNING' AND (cfg.now_ms - COALESCE(started_ms, created_ms)) > cfg.running_timeout_ms THEN 'TIMEOUT'
    WHEN status = 'RUNNING' AND (cfg.now_ms - heartbeat_ms) > cfg.heartbeat_stale_ms THEN 'STALE_HEARTBEAT'
    WHEN status = 'QUEUED' AND next_run_ms IS NOT NULL AND next_run_ms > cfg.now_ms THEN 'WAIT_RETRY'
    ELSE ''
  END AS "Flag",
  CASE
    WHEN status = 'RUNNING' AND heartbeat_ms IS NOT NULL THEN printf('%ds', (cfg.now_ms - heartbeat_ms) / 1000)
    ELSE ''
  END AS "HB",
  COALESCE(json_extract(progress_json, '$.stage'), '') AS "Stage",
  COALESCE(json_extract(progress_json, '$.symbol'), '') AS "Symbol",
  COALESCE(json_extract(progress_json, '$.page'), '') AS "Pg",
  CASE
    WHEN next_run_ms IS NULL THEN ''
    WHEN next_run_ms <= cfg.now_ms THEN 'due'
    ELSE printf('+%dm', (next_run_ms - cfg.now_ms) / 60000)
  END AS "Next",
  CASE
    WHEN error_message IS NULL THEN ''
    WHEN length(error_message) > 42 THEN substr(error_message, 1, 42) || '...'
    ELSE error_message
  END AS "Error"
FROM jobs, cfg
WHERE status IN ('RUNNING', 'QUEUED')
ORDER BY CASE status WHEN 'RUNNING' THEN 1 ELSE 2 END, COALESCE(started_ms, created_ms) DESC;
SQL
echo

echo "== Potentially Stuck RUNNING Jobs =="
stuck_count="$(run_sqlite <<SQL
WITH cfg AS (
  SELECT
    CAST(strftime('%s','now') AS INTEGER) * 1000 AS now_ms,
    ${RUNNING_TIMEOUT_MINUTES} * 60 * 1000 AS running_timeout_ms,
    ${HEARTBEAT_STALE_SECONDS} * 1000 AS heartbeat_stale_ms
), jobs AS (
  SELECT
    status,
    CASE
      WHEN created_at IS NULL THEN NULL
      WHEN typeof(created_at) IN ('integer','real') THEN CAST(created_at AS INTEGER)
      WHEN created_at GLOB '[0-9]*' THEN CAST(created_at AS INTEGER)
      ELSE CAST(strftime('%s', created_at) AS INTEGER) * 1000
    END AS created_ms,
    CASE
      WHEN started_at IS NULL THEN NULL
      WHEN typeof(started_at) IN ('integer','real') THEN CAST(started_at AS INTEGER)
      WHEN started_at GLOB '[0-9]*' THEN CAST(started_at AS INTEGER)
      ELSE CAST(strftime('%s', started_at) AS INTEGER) * 1000
    END AS started_ms,
    CASE
      WHEN heartbeat_at IS NULL THEN NULL
      WHEN typeof(heartbeat_at) IN ('integer','real') THEN CAST(heartbeat_at AS INTEGER)
      WHEN heartbeat_at GLOB '[0-9]*' THEN CAST(heartbeat_at AS INTEGER)
      ELSE CAST(strftime('%s', heartbeat_at) AS INTEGER) * 1000
    END AS heartbeat_ms
  FROM CcxtSyncJob
)
SELECT COUNT(*)
FROM jobs, cfg
WHERE status = 'RUNNING'
  AND (
    (cfg.now_ms - COALESCE(started_ms, created_ms)) > cfg.running_timeout_ms
    OR (heartbeat_ms IS NULL AND (cfg.now_ms - COALESCE(started_ms, created_ms)) > cfg.heartbeat_stale_ms)
    OR (heartbeat_ms IS NOT NULL AND (cfg.now_ms - heartbeat_ms) > cfg.heartbeat_stale_ms)
  );
SQL
)"

if [[ "$stuck_count" -eq 0 ]]; then
  echo "None"
else
  run_sqlite <<SQL
.mode column
.header on
WITH cfg AS (
  SELECT
    CAST(strftime('%s','now') AS INTEGER) * 1000 AS now_ms,
    ${RUNNING_TIMEOUT_MINUTES} * 60 * 1000 AS running_timeout_ms,
    ${HEARTBEAT_STALE_SECONDS} * 1000 AS heartbeat_stale_ms
), jobs AS (
  SELECT
    id,
    exchange_id,
    mode,
    status,
    attempts,
    progress_json,
    error_message,
    CASE
      WHEN created_at IS NULL THEN NULL
      WHEN typeof(created_at) IN ('integer','real') THEN CAST(created_at AS INTEGER)
      WHEN created_at GLOB '[0-9]*' THEN CAST(created_at AS INTEGER)
      ELSE CAST(strftime('%s', created_at) AS INTEGER) * 1000
    END AS created_ms,
    CASE
      WHEN started_at IS NULL THEN NULL
      WHEN typeof(started_at) IN ('integer','real') THEN CAST(started_at AS INTEGER)
      WHEN started_at GLOB '[0-9]*' THEN CAST(started_at AS INTEGER)
      ELSE CAST(strftime('%s', started_at) AS INTEGER) * 1000
    END AS started_ms,
    CASE
      WHEN heartbeat_at IS NULL THEN NULL
      WHEN typeof(heartbeat_at) IN ('integer','real') THEN CAST(heartbeat_at AS INTEGER)
      WHEN heartbeat_at GLOB '[0-9]*' THEN CAST(heartbeat_at AS INTEGER)
      ELSE CAST(strftime('%s', heartbeat_at) AS INTEGER) * 1000
    END AS heartbeat_ms
  FROM CcxtSyncJob
)
SELECT
  id AS "ID",
  exchange_id AS "Ex",
  mode AS "Mode",
  attempts AS "Try",
  printf('%dm', (cfg.now_ms - COALESCE(started_ms, created_ms)) / 60000) AS "RunFor",
  CASE
    WHEN heartbeat_ms IS NULL THEN 'none'
    ELSE printf('%ds ago', (cfg.now_ms - heartbeat_ms) / 1000)
  END AS "Heartbeat",
  CASE
    WHEN (cfg.now_ms - COALESCE(started_ms, created_ms)) > cfg.running_timeout_ms THEN 'TIMEOUT'
    WHEN heartbeat_ms IS NULL THEN 'NO_HEARTBEAT'
    ELSE 'STALE_HEARTBEAT'
  END AS "Reason",
  COALESCE(json_extract(progress_json, '$.stage'), '') AS "Stage",
  COALESCE(json_extract(progress_json, '$.symbol'), '') AS "Symbol",
  CASE
    WHEN error_message IS NULL THEN ''
    WHEN length(error_message) > 48 THEN substr(error_message, 1, 48) || '...'
    ELSE error_message
  END AS "Error"
FROM jobs, cfg
WHERE status = 'RUNNING'
  AND (
    (cfg.now_ms - COALESCE(started_ms, created_ms)) > cfg.running_timeout_ms
    OR (heartbeat_ms IS NULL AND (cfg.now_ms - COALESCE(started_ms, created_ms)) > cfg.heartbeat_stale_ms)
    OR (heartbeat_ms IS NOT NULL AND (cfg.now_ms - heartbeat_ms) > cfg.heartbeat_stale_ms)
  )
ORDER BY COALESCE(started_ms, created_ms) ASC;
SQL
fi
echo

mapfile -t exchanges < <(run_sqlite "SELECT DISTINCT exchange_id FROM CcxtSyncJob ORDER BY exchange_id;")

if [[ "${#exchanges[@]}" -eq 0 ]]; then
  echo "No CCXT sync jobs found."
  exit 0
fi

for exch in "${exchanges[@]}"; do
  echo "== Recent ${exch} Jobs (limit ${RECENT_LIMIT}) =="
  run_sqlite <<SQL
.mode column
.header on
WITH cfg AS (
  SELECT CAST(strftime('%s','now') AS INTEGER) * 1000 AS now_ms
), jobs AS (
  SELECT
    id,
    account_id,
    exchange_id,
    mode,
    status,
    attempts,
    progress_json,
    result_json,
    error_message,
    CASE
      WHEN created_at IS NULL THEN NULL
      WHEN typeof(created_at) IN ('integer','real') THEN CAST(created_at AS INTEGER)
      WHEN created_at GLOB '[0-9]*' THEN CAST(created_at AS INTEGER)
      ELSE CAST(strftime('%s', created_at) AS INTEGER) * 1000
    END AS created_ms,
    CASE
      WHEN started_at IS NULL THEN NULL
      WHEN typeof(started_at) IN ('integer','real') THEN CAST(started_at AS INTEGER)
      WHEN started_at GLOB '[0-9]*' THEN CAST(started_at AS INTEGER)
      ELSE CAST(strftime('%s', started_at) AS INTEGER) * 1000
    END AS started_ms,
    CASE
      WHEN finished_at IS NULL THEN NULL
      WHEN typeof(finished_at) IN ('integer','real') THEN CAST(finished_at AS INTEGER)
      WHEN finished_at GLOB '[0-9]*' THEN CAST(finished_at AS INTEGER)
      ELSE CAST(strftime('%s', finished_at) AS INTEGER) * 1000
    END AS finished_ms,
    CASE
      WHEN heartbeat_at IS NULL THEN NULL
      WHEN typeof(heartbeat_at) IN ('integer','real') THEN CAST(heartbeat_at AS INTEGER)
      WHEN heartbeat_at GLOB '[0-9]*' THEN CAST(heartbeat_at AS INTEGER)
      ELSE CAST(strftime('%s', heartbeat_at) AS INTEGER) * 1000
    END AS heartbeat_ms,
    CASE
      WHEN since IS NULL THEN NULL
      WHEN typeof(since) IN ('integer','real') THEN CAST(since AS INTEGER)
      WHEN since GLOB '[0-9]*' THEN CAST(since AS INTEGER)
      ELSE CAST(strftime('%s', since) AS INTEGER) * 1000
    END AS since_ms,
    CASE
      WHEN next_run_at IS NULL THEN NULL
      WHEN typeof(next_run_at) IN ('integer','real') THEN CAST(next_run_at AS INTEGER)
      WHEN next_run_at GLOB '[0-9]*' THEN CAST(next_run_at AS INTEGER)
      ELSE CAST(strftime('%s', next_run_at) AS INTEGER) * 1000
    END AS next_run_ms
  FROM CcxtSyncJob
  WHERE exchange_id = '$exch'
)
SELECT
  id AS "ID",
  account_id AS "Acct",
  mode AS "Mode",
  status AS "Status",
  attempts AS "Try",
  CASE
    WHEN finished_ms IS NOT NULL THEN
      CASE
        WHEN (cfg.now_ms - finished_ms) < 60000 THEN printf('%ds ago', (cfg.now_ms - finished_ms) / 1000)
        WHEN (cfg.now_ms - finished_ms) < 3600000 THEN printf('%dm ago', (cfg.now_ms - finished_ms) / 60000)
        WHEN (cfg.now_ms - finished_ms) < 86400000 THEN printf('%dh ago', (cfg.now_ms - finished_ms) / 3600000)
        ELSE printf('%dd ago', (cfg.now_ms - finished_ms) / 86400000)
      END
    WHEN started_ms IS NOT NULL THEN
      CASE
        WHEN (cfg.now_ms - started_ms) < 60000 THEN printf('run %ds', (cfg.now_ms - started_ms) / 1000)
        WHEN (cfg.now_ms - started_ms) < 3600000 THEN printf('run %dm', (cfg.now_ms - started_ms) / 60000)
        ELSE printf('run %dh', (cfg.now_ms - started_ms) / 3600000)
      END
    ELSE
      CASE
        WHEN (cfg.now_ms - created_ms) < 60000 THEN printf('q %ds', (cfg.now_ms - created_ms) / 1000)
        WHEN (cfg.now_ms - created_ms) < 3600000 THEN printf('q %dm', (cfg.now_ms - created_ms) / 60000)
        ELSE printf('q %dh', (cfg.now_ms - created_ms) / 3600000)
      END
  END AS "Age",
  CASE
    WHEN started_ms IS NOT NULL AND finished_ms IS NOT NULL THEN printf('%02d:%02d', (finished_ms - started_ms) / 60000, ((finished_ms - started_ms) / 1000) % 60)
    WHEN started_ms IS NOT NULL THEN printf('~%02d:%02d', (cfg.now_ms - started_ms) / 60000, ((cfg.now_ms - started_ms) / 1000) % 60)
    ELSE printf('~%02d:%02d q', (cfg.now_ms - created_ms) / 60000, ((cfg.now_ms - created_ms) / 1000) % 60)
  END AS "Dur",
  CASE
    WHEN heartbeat_ms IS NULL THEN ''
    ELSE printf('%ds', (cfg.now_ms - heartbeat_ms) / 1000)
  END AS "HB",
  CASE
    WHEN since_ms IS NULL THEN ''
    ELSE datetime(since_ms / 1000, 'unixepoch')
  END AS "Since",
  COALESCE(json_extract(result_json, '$.created'), '') AS "Created",
  COALESCE(json_extract(result_json, '$.updated'), '') AS "Updated",
  COALESCE(json_extract(result_json, '$.reconciled'), '') AS "Recon",
  COALESCE(json_extract(result_json, '$.reconciledPositions'), (
    SELECT COUNT(*)
    FROM LedgerTransaction lt
    WHERE lt.account_id = jobs.account_id
      AND lt.external_reference IS NOT NULL
      AND lt.external_reference LIKE ('CCXT:' || jobs.exchange_id || ':POSITION:' || jobs.account_id || ':%')
      AND (
        CASE
          WHEN lt.date_time IS NULL THEN NULL
          WHEN typeof(lt.date_time) IN ('integer','real') THEN CAST(lt.date_time AS INTEGER)
          WHEN lt.date_time GLOB '[0-9]*' THEN CAST(lt.date_time AS INTEGER)
          ELSE CAST(strftime('%s', lt.date_time) AS INTEGER) * 1000
        END
      ) BETWEEN (COALESCE(jobs.started_ms, jobs.created_ms) - 5000)
        AND (COALESCE(jobs.finished_ms, jobs.started_ms, jobs.created_ms) + 5000)
  )) AS "Pos",
  COALESCE(json_extract(result_json, '$.reconciledBalances'), (
    SELECT COUNT(*)
    FROM LedgerTransaction lt
    WHERE lt.account_id = jobs.account_id
      AND lt.tx_type = 'RECONCILIATION'
      AND lt.external_reference IS NOT NULL
      AND lt.external_reference LIKE ('CCXT:' || jobs.exchange_id || ':BALANCE:' || jobs.account_id || ':%')
      AND (
        CASE
          WHEN lt.date_time IS NULL THEN NULL
          WHEN typeof(lt.date_time) IN ('integer','real') THEN CAST(lt.date_time AS INTEGER)
          WHEN lt.date_time GLOB '[0-9]*' THEN CAST(lt.date_time AS INTEGER)
          ELSE CAST(strftime('%s', lt.date_time) AS INTEGER) * 1000
        END
      ) BETWEEN (COALESCE(jobs.started_ms, jobs.created_ms) - 5000)
        AND (COALESCE(jobs.finished_ms, jobs.started_ms, jobs.created_ms) + 5000)
  )) AS "Bal",
  COALESCE(json_extract(progress_json, '$.stage'), '') AS "Stage",
  COALESCE(json_extract(progress_json, '$.symbol'), '') AS "Symbol",
  COALESCE(json_extract(progress_json, '$.page'), '') AS "Pg",
  CASE
    WHEN next_run_ms IS NULL THEN ''
    WHEN next_run_ms <= cfg.now_ms THEN 'due'
    ELSE printf('+%dm', (next_run_ms - cfg.now_ms) / 60000)
  END AS "Next",
  CASE
    WHEN error_message IS NULL THEN ''
    WHEN length(error_message) > 52 THEN substr(error_message, 1, 52) || '...'
    ELSE error_message
  END AS "Error"
FROM jobs, cfg
ORDER BY id DESC
LIMIT ${RECENT_LIMIT};
SQL
  echo
done

echo "== Summary by Exchange + Mode =="
run_sqlite <<'SQL'
.mode column
.header on
WITH jobs AS (
  SELECT
    exchange_id,
    mode,
    status,
    CASE
      WHEN started_at IS NULL THEN NULL
      WHEN typeof(started_at) IN ('integer','real') THEN CAST(started_at AS INTEGER)
      WHEN started_at GLOB '[0-9]*' THEN CAST(started_at AS INTEGER)
      ELSE CAST(strftime('%s', started_at) AS INTEGER) * 1000
    END AS started_ms,
    CASE
      WHEN finished_at IS NULL THEN NULL
      WHEN typeof(finished_at) IN ('integer','real') THEN CAST(finished_at AS INTEGER)
      WHEN finished_at GLOB '[0-9]*' THEN CAST(finished_at AS INTEGER)
      ELSE CAST(strftime('%s', finished_at) AS INTEGER) * 1000
    END AS finished_ms
  FROM CcxtSyncJob
)
SELECT
  exchange_id AS "Ex",
  mode AS "Mode",
  COUNT(*) AS "Total",
  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS "OK",
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS "Fail",
  SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) AS "Run",
  SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) AS "Queued",
  CASE
    WHEN AVG(CASE WHEN finished_ms IS NOT NULL AND started_ms IS NOT NULL THEN (finished_ms - started_ms) END) IS NULL THEN ''
    ELSE printf('%02d:%02d',
      AVG(CASE WHEN finished_ms IS NOT NULL AND started_ms IS NOT NULL THEN (finished_ms - started_ms) END) / 60000,
      (AVG(CASE WHEN finished_ms IS NOT NULL AND started_ms IS NOT NULL THEN (finished_ms - started_ms) END) / 1000) % 60
    )
  END AS "AvgDur"
FROM jobs
GROUP BY exchange_id, mode
ORDER BY exchange_id, mode;
SQL
