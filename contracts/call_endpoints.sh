#!/bin/bash
set -e

PEM="../.secrets/wallet.pem"
PROXY="https://testnet-gateway.multiversx.com"
CHAIN="T"
ADDR_V65="erd1qqqqqqqqqqqqqpgq9q5erwssdue297j34glwcfh0laceuwgk7k8s6ufu06"
ADDR_V66="erd1qqqqqqqqqqqqqpgqdhxep6f8lqw896fg6aupqplghvz0kgp67k8sy3zvqg"

ARGS="100000000000000000000 100000000"

echo "Calling updatePrice on v0.65.0..."
mxpy contract call $ADDR_V65 --pem=$PEM \
 --gas-limit=10000000 \
 --function="updatePrice" \
 --arguments $ARGS \
 --proxy=$PROXY --chain=$CHAIN \
 --outfile="call_v65.json" --send --wait-result

HASH_V65=$(jq -r '.emittedTransactionHash' call_v65.json)
echo "Call Tx v0.65.0: $HASH_V65"

echo "Calling updatePrice on v0.66.0..."
mxpy contract call $ADDR_V66 --pem=$PEM \
 --gas-limit=10000000 \
 --function="updatePrice" \
 --arguments $ARGS \
 --proxy=$PROXY --chain=$CHAIN \
 --outfile="call_v66.json" --send --wait-result

HASH_V66=$(jq -r '.emittedTransactionHash' call_v66.json)
echo "Call Tx v0.66.0: $HASH_V66"

echo "Fetching execution gas..."
GAS_V65=$(curl -s https://testnet-api.multiversx.com/transactions/$HASH_V65 | jq '.operations[0].message')
GAS_V66=$(curl -s https://testnet-api.multiversx.com/transactions/$HASH_V66 | jq '.operations[0].message')

echo "----------------------------------------"
echo "Execution Results:"
echo "Gas Log v0.65.0: $GAS_V65"
echo "Gas Log v0.66.0: $GAS_V66"
echo "----------------------------------------"
