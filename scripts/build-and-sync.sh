#!/bin/bash
# ═══════════════════════════════════════════════════
#  XCron Protocol — Build & Sync Script
# ═══════════════════════════════════════════════════
#
# Builds the scheduler contract and syncs the .mxsc.json
# to scenarios/output/ to prevent VM test mismatches.
#
# Usage:
#   ./scripts/build-and-sync.sh
#
# Requires: sc-meta (cargo install multiversx-sc-meta)
# ═══════════════════════════════════════════════════

set -e

CONTRACTS_DIR="$(cd "$(dirname "$0")/../contracts" && pwd)"
SCHEDULER_DIR="$CONTRACTS_DIR/scheduler"
MXSC_FILE="$SCHEDULER_DIR/output/scheduler.mxsc.json"
SCENARIOS_OUTPUT="$SCHEDULER_DIR/scenarios/output"

echo "🔨 Building scheduler contract..."
cd "$SCHEDULER_DIR"
sc-meta all build 2>&1 || {
    echo "⚠️  sc-meta build failed. Trying cargo build..."
    cargo build --release
}

if [ ! -f "$MXSC_FILE" ]; then
    echo "❌ Build output not found: $MXSC_FILE"
    exit 1
fi

echo "📦 Syncing .mxsc.json to scenarios/output/..."
mkdir -p "$SCENARIOS_OUTPUT"
cp "$MXSC_FILE" "$SCENARIOS_OUTPUT/"

# Verify sizes match
MAIN_SIZE=$(wc -c < "$MXSC_FILE" | tr -d ' ')
SCEN_SIZE=$(wc -c < "$SCENARIOS_OUTPUT/scheduler.mxsc.json" | tr -d ' ')

if [ "$MAIN_SIZE" -eq "$SCEN_SIZE" ]; then
    echo "✅ Sync complete. Both files: $MAIN_SIZE bytes"
else
    echo "❌ Size mismatch! Main: $MAIN_SIZE, Scenarios: $SCEN_SIZE"
    exit 1
fi

echo ""
echo "🧪 Running scenario tests..."
cd "$SCHEDULER_DIR"
cargo test -- --nocapture 2>&1 | grep -E "^test |^test result"

echo ""
echo "✅ Build, sync, and test complete!"
