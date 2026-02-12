#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible alias for older typo'd path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/ccxt-status.sh" "$@"
