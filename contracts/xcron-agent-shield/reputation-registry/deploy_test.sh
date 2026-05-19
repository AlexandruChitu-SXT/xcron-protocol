#!/bin/bash
set -e

echo "======================================================="
echo " XCron AVS Devnet Deployment & Test"
echo "======================================================="

PEM="../../../../.secrets/deployer.pem"
WASM="output/reputation-registry.wasm"

# Check if PEM exists
if [ ! -f "$PEM" ]; then
  echo " Error: PEM file not found at $PEM"
  exit 1
fi

echo " Deploying Reputation Registry (AVS) to Devnet..."

# Deploying (Arguments: two zero addresses for validation and identity registries)
mxpy contract deploy --bytecode=$WASM --pem=$PEM \
 --gas-limit=60000000 \
 --arguments 0x0000000000000000000000000000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000000000000000000000000000 \
 --proxy=https://devnet-gateway.multiversx.com --chain=D \
 --outfile="deploy.json" --send

echo " Deployment transaction sent. Waiting 15 seconds for network confirmation..."
sleep 15

SC_ADDRESS=$(jq -r '.emittedTransactionData[0].contractAddress' deploy.json)
TX_HASH=$(jq -r '.emittedTransactionData[0].hash' deploy.json)

echo ""
echo " Contract successfully deployed on Devnet!"
echo "  TX Hash: $TX_HASH"
echo "  Smart Contract: $SC_ADDRESS"
echo ""

echo " Querying AVS engine on-chain..."
echo "  Target: evaluateAgentFairValue"
echo "  Parameters:"
echo "   - Agent Nonce: 1"
echo "   - Monthly Earnings: 50 EGLD"
echo "   - Expected APR: 15% (1500 bps)"

mxpy contract query $SC_ADDRESS --function="evaluateAgentFairValue" \
 --arguments 1 50 1500 \
 --proxy=https://devnet-gateway.multiversx.com > query_result.json

cat query_result.json

echo ""
echo " Devnet Test Complete! The AVS is live."
