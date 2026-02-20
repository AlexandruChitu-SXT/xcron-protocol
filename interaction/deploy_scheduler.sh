#!/bin/bash
set -e

PEM_FILE="../.secrets/deployer.pem"
PROXY="https://devnet-gateway.multiversx.com"
CHAIN_ID="D"

## Lee los addresses de Registry y Rewards
REGISTRY_ADDR="erd1qqqqqqqqqqqqqpgqyj7m4ysa2z5kaf2awx2dlfpxjjq4lthw7k8scmjjv4" # <- This is the old one. We will grab the new one!
REWARDS_ADDR="erd1qqqqqqqqqqqqqpgq5ck78tmtupdl8jv78kuf8e379p9n97wx7k8sdzht6w"

echo "=> Desplegando Scheduler..."
# Arguments: keeper_registry(Address), rewards_addr(Address), min_deposit(BigUint), protocol_fee_bps(u64)
# We use proper prefixes to avoid casting ambiguity by mxpy:
# 10000000000000000 -> 0.01 EGLD
# 500 -> 5%
mxpy contract deploy --bytecode scheduler.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 75000000 --send --metadata-payable \
    --arguments ${REGISTRY_ADDR} ${REWARDS_ADDR} 10000000000000000 500 \
    --outfile scheduler_final.json

SCHEDULER_ADDR=$(jq -r '.emittedTransactionData' scheduler_final.json)
echo "   -> Scheduler Data Sent: ${SCHEDULER_ADDR}"
