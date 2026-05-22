#!/bin/bash
set -e

PEM="../.secrets/wallet.pem"
PROXY="https://testnet-gateway.multiversx.com"
CHAIN="T"
DUMMY_ADDR="erd1zkrt7ltz5zaj77t3ls4h3f94n94ny3zec57zrkeeyl3cj9e2g4tqljcjq3"

echo "Deploying v0.65.0..."
mxpy contract deploy --bytecode=xwap_v65.wasm --pem=$PEM \
 --gas-limit=150000000 \
 --arguments addr:$DUMMY_ADDR \
 --proxy=$PROXY --chain=$CHAIN \
 --outfile="deploy_v65.json" --send --wait-result

ADDR_V65=$(jq -r '.contractAddress' deploy_v65.json)
HASH_V65=$(jq -r '.emittedTransactionHash' deploy_v65.json)
echo "v0.65.0 Deployed: $ADDR_V65 (Tx: $HASH_V65)"

echo "Deploying v0.66.0..."
mxpy contract deploy --bytecode=xwap_v66.wasm --pem=$PEM \
 --gas-limit=150000000 \
 --arguments addr:$DUMMY_ADDR \
 --proxy=$PROXY --chain=$CHAIN \
 --outfile="deploy_v66.json" --send --wait-result

ADDR_V66=$(jq -r '.contractAddress' deploy_v66.json)
HASH_V66=$(jq -r '.emittedTransactionHash' deploy_v66.json)
echo "v0.66.0 Deployed: $ADDR_V66 (Tx: $HASH_V66)"

echo "Fetching gas used from API..."
GAS_V65=$(curl -s https://testnet-api.multiversx.com/transactions/$HASH_V65 | jq '.gasUsed')
GAS_V66=$(curl -s https://testnet-api.multiversx.com/transactions/$HASH_V66 | jq '.gasUsed')

echo "----------------------------------------"
echo "Results:"
echo "Gas Used v0.65.0 (Deploy): $GAS_V65"
echo "Gas Used v0.66.0 (Deploy): $GAS_V66"
echo "----------------------------------------"
