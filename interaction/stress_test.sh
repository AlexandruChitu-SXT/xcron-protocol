#!/bin/bash

# ═══════════════════════════════════════════════════════════
# XCron Protocol — Stress Test: Schedule 22 tasks on Devnet
# ═══════════════════════════════════════════════════════════
# 
# Tasks are scheduled with trigger rounds a few rounds in the future
# so the keeper bot can pick them up and execute them.
#
# Mix: 18 TimeOnce + 4 TimeRecurring

CHAIN="D"
PROXY="https://devnet-gateway.multiversx.com"
WALLET="./wallets/deployer.pem"
SCHEDULER="erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh"
REWARDS="erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt"

# Get current round from API
CURRENT_ROUND=$(curl -s "https://devnet-api.multiversx.com/blocks?shard=1&size=1&fields=round" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['round'])")
echo "Current round: $CURRENT_ROUND"

# Target = self-contract (Rewards has a simple getTreasuryBalance view)
# The endpoint just needs to be callable
TARGET_CONTRACT_HEX=$(mxpy wallet convert --in-format address-bech32 --out-format address-hex --value "$REWARDS" 2>/dev/null)

# scheduleTask arguments layout:
# - target_contract: ManagedAddress (hex)
# - target_endpoint: ManagedBuffer (string)
# - target_args: ManagedVec<ManagedBuffer> (empty = 0x00000000)
# - trigger: Trigger enum
#     TimeOnce = 0x00 + target_round(u64)
#     TimeRecurring = 0x01 + start_round(u64) + interval(u64) + remaining_execs(u64)
# - max_gas: u64
# - max_retries: u8
# - ttl_rounds: u64

DEPOSIT="100000000000000000"    # 0.1 EGLD
MAX_GAS="5000000"               # 5M gas (for a simple view call)
MAX_RETRIES="1"
TTL_ROUNDS="14400"              # ~24 hours

schedule_time_once() {
    local OFFSET=$1
    local LABEL=$2
    local TARGET_ROUND=$((CURRENT_ROUND + OFFSET))
    local TARGET_ROUND_HEX=$(printf '%016x' $TARGET_ROUND)
    
    # Trigger: TimeOnce = 0x00 + target_round
    local TRIGGER="0x00${TARGET_ROUND_HEX}"
    
    echo "Scheduling TimeOnce task ($LABEL): round $TARGET_ROUND (+${OFFSET})"
    
    mxpy contract call "$SCHEDULER" \
        --pem "$WALLET" \
        --gas-limit 30000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --value "$DEPOSIT" \
        --function "scheduleTask" \
        --arguments "0x$TARGET_CONTRACT_HEX" "str:getTreasuryBalance" "0x00000000" "$TRIGGER" "$MAX_GAS" "$MAX_RETRIES" "$TTL_ROUNDS" \
        --recall-nonce \
        --send 2>&1 | grep -E "hash|emitted"
    
    sleep 2
}

schedule_time_recurring() {
    local OFFSET=$1
    local INTERVAL=$2
    local REMAINING=$3
    local LABEL=$4
    local START_ROUND=$((CURRENT_ROUND + OFFSET))
    local START_HEX=$(printf '%016x' $START_ROUND)
    local INTERVAL_HEX=$(printf '%016x' $INTERVAL)
    local REMAINING_HEX=$(printf '%016x' $REMAINING)
    
    # Trigger: TimeRecurring = 0x01 + start_round + interval + remaining_execs
    local TRIGGER="0x01${START_HEX}${INTERVAL_HEX}${REMAINING_HEX}"
    
    echo "Scheduling TimeRecurring task ($LABEL): start=$START_ROUND, interval=$INTERVAL, remaining=$REMAINING"
    
    mxpy contract call "$SCHEDULER" \
        --pem "$WALLET" \
        --gas-limit 30000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --value "$DEPOSIT" \
        --function "scheduleTask" \
        --arguments "0x$TARGET_CONTRACT_HEX" "str:getTreasuryBalance" "0x00000000" "$TRIGGER" "$MAX_GAS" "$MAX_RETRIES" "$TTL_ROUNDS" \
        --recall-nonce \
        --send 2>&1 | grep -E "hash|emitted"
    
    sleep 2
}

echo "═══════════════════════════════════════════════"
echo "  XCron Stress Test — 22 Tasks"
echo "═══════════════════════════════════════════════"
echo ""

# Batch 1: 6 immediate tasks (round +5 to +10)
for i in $(seq 5 10); do
    schedule_time_once $i "batch1-imm-$i"
done

# Batch 2: 6 tasks in ~1 minute (+15 to +20)
for i in $(seq 15 20); do
    schedule_time_once $i "batch2-1m-$i"
done

# Batch 3: 6 tasks in ~2 minutes (+25 to +30)
for i in $(seq 25 30); do
    schedule_time_once $i "batch3-2m-$i"
done

# Batch 4: 4 TimeRecurring tasks
schedule_time_recurring 8  5  3 "recur-fast"     # every 5 rounds, 3 execs
schedule_time_recurring 12 10 3 "recur-medium"   # every 10 rounds, 3 execs
schedule_time_recurring 20 15 2 "recur-slow"     # every 15 rounds, 2 execs
schedule_time_recurring 6  3  5 "recur-rapid"    # every 3 rounds, 5 execs

echo ""
echo "═══════════════════════════════════════════════"
echo "  All 22 tasks scheduled!"
echo "  Monitor keeper bot logs for execution."
echo "═══════════════════════════════════════════════"
