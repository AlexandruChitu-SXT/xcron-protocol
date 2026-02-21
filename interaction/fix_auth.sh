#!/bin/bash
PEM_FILE="../.secrets/deployer.pem"
SCHEDULER_ADDR="erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72"
REGISTRY_ADDR="erd1qqqqqqqqqqqqqpgqds77tlndkknyrkvuv9s2958lgvwclslv7k8sv86jce"

echo "=> Authorizing Scheduler on Keeper Registry..."
mxpy contract call ${REGISTRY_ADDR} --function addAuthorizedCaller \
    --pem ${PEM_FILE} --proxy "https://devnet-api.multiversx.com" --chain D \
    --gas-limit 10000000 --send \
    --arguments ${SCHEDULER_ADDR}
