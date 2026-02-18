#!/bin/bash

# ═══════════════════════════════════════════════════════════
# XCron Protocol — Devnet Deployment & Interaction Snippets
# ═══════════════════════════════════════════════════════════
#
# Prerequisites:
#   1. mxpy installed (pip install multiversx-sdk-cli)
#   2. WASM files built (cd contracts && sc-meta all build)
#   3. Devnet wallet with EGLD (use faucet)
#
# Usage:
#   source interaction/snippets.sh
#   deploy_all

CHAIN="D"  # D=devnet, T=testnet, 1=mainnet
PROXY="https://devnet-gateway.multiversx.com"
WALLET="./wallets/deployer.pem"

# WASM paths
SCHEDULER_WASM="./contracts/scheduler/wasm/target/wasm32-unknown-unknown/release/scheduler_wasm.wasm"
KEEPER_REGISTRY_WASM="./contracts/keeper-registry/wasm/target/wasm32-unknown-unknown/release/keeper_registry_wasm.wasm"
REWARDS_WASM="./contracts/rewards/wasm/target/wasm32-unknown-unknown/release/rewards_wasm.wasm"

# Contract addresses (filled after deploy)
SCHEDULER_ADDR=""
KEEPER_REGISTRY_ADDR=""
REWARDS_ADDR=""

# ═══════════════════════════════════════════════════════════
#  WALLET MANAGEMENT
# ═══════════════════════════════════════════════════════════

generate_wallet() {
    echo ">> Generating new devnet wallet..."
    mkdir -p wallets
    mxpy wallet new --format pem --outfile "$WALLET"
    echo ""
    echo ">> Wallet generated at: $WALLET"
    echo ">> Address:"
    mxpy wallet convert --infile "$WALLET" --in-format pem --out-format address-bech32
    echo ""
    echo ">> IMPORTANT: Request devnet EGLD from https://devnet-wallet.multiversx.com/faucet"
}

check_balance() {
    local ADDR=$(mxpy wallet convert --infile "$WALLET" --in-format pem --out-format address-bech32 2>/dev/null)
    echo ">> Balance for $ADDR:"
    mxpy account get --address "$ADDR" --proxy "$PROXY" 2>/dev/null | grep -E "balance|nonce"
}

# ═══════════════════════════════════════════════════════════
#  DEPLOY CONTRACTS
# ═══════════════════════════════════════════════════════════

# Deploy KeeperRegistry first (no dependencies on other contracts)
deploy_keeper_registry() {
    echo ">> Deploying KeeperRegistry..."
    
    local MIN_STAKE="1000000000000000000"    # 1 EGLD
    local SLASH_BPS="1000"                    # 10%
    local COOLDOWN="600"                      # ~1 hour
    local TREASURY_ADDR=$(mxpy wallet convert --infile "$WALLET" --in-format pem --out-format address-hex 2>/dev/null)

    local RESULT=$(mxpy contract deploy \
        --bytecode "$KEEPER_REGISTRY_WASM" \
        --pem "$WALLET" \
        --gas-limit 80000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --arguments "$MIN_STAKE" "$SLASH_BPS" "$COOLDOWN" "0x$TREASURY_ADDR" \
        --recall-nonce \
        --send 2>&1)

    echo "$RESULT"
    KEEPER_REGISTRY_ADDR=$(echo "$RESULT" | grep -oP 'erd1[a-z0-9]+' | tail -1)
    echo ">> KeeperRegistry deployed at: $KEEPER_REGISTRY_ADDR"
}

# Deploy Rewards (depends on KeeperRegistry address)
deploy_rewards() {
    echo ">> Deploying Rewards..."
    
    if [ -z "$KEEPER_REGISTRY_ADDR" ]; then
        echo "ERROR: Deploy KeeperRegistry first!"
        return 1
    fi
    
    local REGISTRY_HEX=$(mxpy wallet convert --in-format address-bech32 --out-format address-hex --value "$KEEPER_REGISTRY_ADDR" 2>/dev/null)
    local TREASURY_SPLIT_BPS="2000"  # 20% to treasury
    
    local RESULT=$(mxpy contract deploy \
        --bytecode "$REWARDS_WASM" \
        --pem "$WALLET" \
        --gas-limit 80000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --arguments "0x$REGISTRY_HEX" "$TREASURY_SPLIT_BPS" \
        --recall-nonce \
        --send 2>&1)

    echo "$RESULT"
    REWARDS_ADDR=$(echo "$RESULT" | grep -oP 'erd1[a-z0-9]+' | tail -1)
    echo ">> Rewards deployed at: $REWARDS_ADDR"
}

# Deploy Scheduler (depends on both KeeperRegistry and Rewards)
deploy_scheduler() {
    echo ">> Deploying Scheduler..."
    
    if [ -z "$KEEPER_REGISTRY_ADDR" ] || [ -z "$REWARDS_ADDR" ]; then
        echo "ERROR: Deploy KeeperRegistry and Rewards first!"
        return 1
    fi
    
    local REGISTRY_HEX=$(mxpy wallet convert --in-format address-bech32 --out-format address-hex --value "$KEEPER_REGISTRY_ADDR" 2>/dev/null)
    local REWARDS_HEX=$(mxpy wallet convert --in-format address-bech32 --out-format address-hex --value "$REWARDS_ADDR" 2>/dev/null)
    local MIN_DEPOSIT="100000000000000000"   # 0.1 EGLD
    local PROTOCOL_FEE_BPS="1500"              # 15%
    
    local RESULT=$(mxpy contract deploy \
        --bytecode "$SCHEDULER_WASM" \
        --pem "$WALLET" \
        --gas-limit 100000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --arguments "0x$REGISTRY_HEX" "0x$REWARDS_HEX" "$MIN_DEPOSIT" "$PROTOCOL_FEE_BPS" \
        --recall-nonce \
        --send 2>&1)

    echo "$RESULT"
    SCHEDULER_ADDR=$(echo "$RESULT" | grep -oP 'erd1[a-z0-9]+' | tail -1)
    echo ">> Scheduler deployed at: $SCHEDULER_ADDR"
}

# ═══════════════════════════════════════════════════════════
#  WIRE CONTRACTS (set cross-references)
# ═══════════════════════════════════════════════════════════

wire_contracts() {
    echo ">> Wiring contract addresses..."
    
    if [ -z "$SCHEDULER_ADDR" ] || [ -z "$KEEPER_REGISTRY_ADDR" ] || [ -z "$REWARDS_ADDR" ]; then
        echo "ERROR: Deploy all contracts first!"
        return 1
    fi
    
    local SCHEDULER_HEX=$(mxpy wallet convert --in-format address-bech32 --out-format address-hex --value "$SCHEDULER_ADDR" 2>/dev/null)
    
    # 1. Add Scheduler as authorized caller on KeeperRegistry
    echo ">> Setting Scheduler as authorized caller on KeeperRegistry..."
    mxpy contract call "$KEEPER_REGISTRY_ADDR" \
        --pem "$WALLET" \
        --gas-limit 10000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --function "addAuthorizedCaller" \
        --arguments "0x$SCHEDULER_HEX" \
        --recall-nonce \
        --send
    
    # 2. Add Scheduler as authorized scheduler on Rewards
    echo ">> Setting Scheduler as authorized on Rewards..."
    mxpy contract call "$REWARDS_ADDR" \
        --pem "$WALLET" \
        --gas-limit 10000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --function "addAuthorizedScheduler" \
        --arguments "0x$SCHEDULER_HEX" \
        --recall-nonce \
        --send
    
    echo ">> Wiring complete ✅"
}

# ═══════════════════════════════════════════════════════════
#  KEEPER MANAGEMENT
# ═══════════════════════════════════════════════════════════

# Whitelist a keeper on the Scheduler (Phase 1)
whitelist_keeper() {
    local KEEPER_ADDR=$1
    if [ -z "$KEEPER_ADDR" ]; then
        echo "Usage: whitelist_keeper <keeper_bech32_address>"
        return 1
    fi
    
    local KEEPER_HEX=$(mxpy wallet convert --in-format address-bech32 --out-format address-hex --value "$KEEPER_ADDR" 2>/dev/null)
    
    echo ">> Whitelisting keeper $KEEPER_ADDR on Scheduler..."
    mxpy contract call "$SCHEDULER_ADDR" \
        --pem "$WALLET" \
        --gas-limit 10000000 \
        --proxy "$PROXY" \
        --chain "$CHAIN" \
        --function "addWhitelistedKeeper" \
        --arguments "0x$KEEPER_HEX" \
        --recall-nonce \
        --send
}

# ═══════════════════════════════════════════════════════════
#  QUERIES (read-only)
# ═══════════════════════════════════════════════════════════

query_task_nonce() {
    echo ">> Current task nonce:"
    mxpy contract query "$SCHEDULER_ADDR" \
        --proxy "$PROXY" \
        --function "getTaskNonce"
}

query_active_keepers() {
    echo ">> Active keeper count:"
    mxpy contract query "$KEEPER_REGISTRY_ADDR" \
        --proxy "$PROXY" \
        --function "getActiveKeeperCount"
}

query_treasury() {
    echo ">> Treasury balance:"
    mxpy contract query "$REWARDS_ADDR" \
        --proxy "$PROXY" \
        --function "getTreasuryBalance"
}

# ═══════════════════════════════════════════════════════════
#  DEPLOY ALL
# ═══════════════════════════════════════════════════════════

deploy_all() {
    echo "═════════════════════════════════════════════"
    echo "  XCron Protocol — Devnet Deployment"
    echo "═════════════════════════════════════════════"
    echo ""
    
    deploy_keeper_registry
    sleep 15  # Wait for block confirmation
    
    deploy_rewards
    sleep 15
    
    deploy_scheduler
    sleep 15
    
    wire_contracts
    sleep 10
    
    echo ""
    echo "═════════════════════════════════════════════"
    echo "  DEPLOYMENT COMPLETE"
    echo "═════════════════════════════════════════════"
    echo "  Scheduler:       $SCHEDULER_ADDR"
    echo "  KeeperRegistry:  $KEEPER_REGISTRY_ADDR"
    echo "  Rewards:          $REWARDS_ADDR"
    echo "═════════════════════════════════════════════"
    
    # Save addresses for keeper bot
    cat > .deployed_addresses.json << EOF
{
    "network": "devnet",
    "scheduler": "$SCHEDULER_ADDR",
    "keeperRegistry": "$KEEPER_REGISTRY_ADDR",
    "rewards": "$REWARDS_ADDR"
}
EOF
    echo ">> Addresses saved to .deployed_addresses.json"
}
