#!/bin/bash
set -e

echo "======================================================="
echo " XCron Agent Marketplace Testnet Deployment"
echo "======================================================="

PEM="../../../.secrets/wallet.pem"
WASM="output/xcron-agent-marketplace.wasm"

# Check if PEM exists
if [ ! -f "$PEM" ]; then
  echo " Error: PEM file not found at $PEM"
  exit 1
fi

# Check if WASM exists
if [ ! -f "$WASM" ]; then
  echo " Error: WASM not found at $WASM. Run 'sc-meta all build' first."
  exit 1
fi

echo " Deploying XCron Agent Marketplace to Testnet..."

# Reputation Registry (AVS) deployed on Testnet - from screenshot
AVS_ADDRESS="erd1qqqqqqqqqqqqqpgqpjy3f4s7k7qq9r2vl604a764zgm4d7xc7k8suaqrck"
# Treasury = same owner wallet
TREASURY_ADDRESS="erd135zkexfnzryv7z04vppm28uajdsxfvnel2n3kdw2spv3jk0j7k8stpwpgu"
# Agent NFT token ID (placeholder for testnet)
AGENT_TOKEN_ID="str:XCRONAGENT-abcdef"

mxpy contract deploy --bytecode=$WASM --pem=$PEM \
 --gas-limit=30000000 \
 --arguments $AVS_ADDRESS $TREASURY_ADDRESS $AGENT_TOKEN_ID \
 --proxy=https://testnet-gateway.multiversx.com --chain=T \
 --outfile="deploy.json" --send

echo " Deployment TX sent. Waiting 15s for confirmation..."
sleep 15

SC_ADDRESS=$(jq -r '.contractAddress' deploy.json 2>/dev/null || echo "CHECK deploy.json")
TX_HASH=$(jq -r '.emittedTransactionHash' deploy.json 2>/dev/null || echo "CHECK deploy.json")

echo ""
echo " Marketplace deployed on Testnet!"
echo "  TX Hash: $TX_HASH"
echo "  Smart Contract: $SC_ADDRESS"
echo ""
