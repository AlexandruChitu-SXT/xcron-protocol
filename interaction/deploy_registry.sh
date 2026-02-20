#!/bin/bash
set -e

PEM_FILE="../.secrets/deployer.pem"
PROXY="https://devnet-gateway.multiversx.com"
CHAIN_ID="D"

echo "=> Desplegando Keeper Registry..."
mxpy contract deploy --bytecode keeper-registry.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --outfile registry_final.json

REGISTRY_ADDR=$(jq -r '.emittedTransactionData' registry_final.json)
echo "   -> Keeper Registry Data Sent: ${REGISTRY_ADDR}"
