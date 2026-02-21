#!/bin/bash
set -e

PEM_FILE="../.secrets/deployer.pem"
PROXY="https://devnet-gateway.multiversx.com"
CHAIN_ID="D"
SCHEDULER_ADDR="erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72"
FEE_BPS=1500

echo "=> Setting protocol fee to 15% (1500 bps)..."
mxpy contract call ${SCHEDULER_ADDR} --function setProtocolFeeBps \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 10000000 --send \
    --arguments ${FEE_BPS} --outfile set_fee.json

echo "   -> Protocol fee set successfully."
