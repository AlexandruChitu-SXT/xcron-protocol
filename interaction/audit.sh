#!/bin/bash
SCHEDULER="erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72"
REGISTRY="erd1qqqqqqqqqqqqqpgqds77tlndkknyrkvuv9s2958lgvwclslv7k8sv86jce"

echo "=== AUDITORIA DEVNET XCRON ==="
echo "1. SCHEDULER"
mxpy contract query $SCHEDULER --function="getProtocolFeeBps" --proxy="https://devnet-api.multiversx.com" | grep -A 10 "result"
echo "2. KEEPER REGISTRY"
mxpy contract query $REGISTRY --function="getActiveKeeperCount" --proxy="https://devnet-api.multiversx.com" | grep -A 10 "result"
mxpy contract query $REGISTRY --function="getMinStake" --proxy="https://devnet-api.multiversx.com" | grep -A 10 "result"
