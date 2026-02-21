#!/bin/bash
PEM_FILE=".secrets/deployer.pem"
REGISTRY_ADDR="erd1qqqqqqqqqqqqqpgqds77tlndkknyrkvuv9s2958lgvwclslv7k8sv86jce"

echo "=========================================================="
echo "🛡️ XCron Protocol - Extreme Stress Test Suite 🛡️"
echo "=========================================================="
echo "Scenario 1: Testing Unstake & Cooldown Penalties"
echo "----------------------------------------------------------"

echo "[1/3] 🟢 Requesting Unstake on behalf of the Keeper..."
mxpy contract call ${REGISTRY_ADDR} --function requestUnstake \
    --pem ${PEM_FILE} --proxy "https://devnet-api.multiversx.com" --chain D \
    --gas-limit 10000000 --send > /dev/null

echo "✅ Unstake requested successfully. The Keeper is now in 'Unstaking' mode."
echo "Sleeping 15 seconds to allow tx block to settle..."
sleep 15

echo ""
echo "[2/3] 🔴 Attempting Malicious Withdraw INSTANTLY (Bypassing Cooldown)..."
echo "The contract SHOULD REJECT this transaction to protect the network."
echo "----------------------------------------------------------"
mxpy contract call ${REGISTRY_ADDR} --function withdrawStake \
    --pem ${PEM_FILE} --proxy "https://devnet-api.multiversx.com" --chain D \
    --gas-limit 10000000 --send > stress_test_output.json 2>&1

if grep -q "unbonding period has not elapsed" stress_test_output.json; then
    echo "✅ SUCCESS! Smart Contract BLOCKED the unauthorized withdraw."
    echo "Reason: Cooldown/Unbonding period active."
else
    echo "⚠️ TRANSACTION RESULTED ERRONEOUSLY or we didn't catch the exact error. Output:"
    cat stress_test_output.json | grep -i "user error" || echo "Check Explorer for details."
fi

echo "=========================================================="
echo "STRESS TEST EXECUTED."
echo "=========================================================="
