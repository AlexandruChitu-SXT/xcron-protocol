#!/bin/bash
set -e

PEM_FILE="../.secrets/deployer.pem"
PROXY="https://devnet-gateway.multiversx.com"
CHAIN_ID="D"

DEPLOYER=$(head -n 2 ${PEM_FILE} | grep -o 'erd1[a-z0-9]*')

echo "=> Desplegando Keeper Registry..."
mxpy contract deploy --bytecode ../contracts/keeper-registry/output/keeper-registry.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --arguments 1000000000000000000 500 100 ${DEPLOYER} \
    --outfile registry_final.json

REGISTRY_ADDR=$(jq -r '.emittedTransactionData' registry_final.json)
echo "   -> Keeper Registry Data Sent: ${REGISTRY_ADDR}"
