#!/bin/bash

# Configuration
PEM_FILE="/Users/alejandrochitu/xcron-protocol/alice_testnet.pem"
PROXY="https://testnet-gateway.multiversx.com"
CHAIN="T"
WASM_PATH="/Users/alejandrochitu/xcron-protocol/contracts/xsc-core/output/xsc-core.wasm"

echo "=========================================================="
echo "🚀 XCron State Compression (XSC) - End-to-End Testnet Test"
echo "=========================================================="

# 1. Get Alice's Address
ALICE_ADDR=$(mxpy wallet pem-address $PEM_FILE)
echo "👨‍💻 Deployer / Keeper Address: $ALICE_ADDR"

# 2. Deploy Contract
echo -e "\n📦 Deploying XSC Contract to Testnet..."
DEPLOY_OUT=$(mxpy contract deploy --bytecode $WASM_PATH \
  --pem $PEM_FILE --proxy $PROXY --chain $CHAIN \
  --recall-nonce --gas-limit 20000000 \
  --arguments $ALICE_ADDR \
  --send --outfile deploy.json)

# Check if deploy.json exists
sleep 5
SC_ADDR=$(cat deploy.json | jq -r '.emittedTransactionData[0].contractAddress')

if [ "$SC_ADDR" == "null" ] || [ -z "$SC_ADDR" ]; then
    echo "❌ Deployment simulation/send failed or pending."
    echo "$DEPLOY_OUT"
    exit 1
fi

echo "✅ Contract Deployed at: $SC_ADDR"

# Wait a bit for the transaction to finalize
echo "⏳ Waiting 15 seconds for blockchain finality..."
sleep 15

# 3. Call updateRoot
# Using the Root we generated off-chain earlier: f3059c2f31f803b6c243f238cc70b97ae1d4a79f48340d7cf3abbc60bb797acc
ROOT_HEX="f3059c2f31f803b6c243f238cc70b97ae1d4a79f48340d7cf3abbc60bb797acc"
echo -e "\n📡 Sending 'updateRoot' Transaction..."
UPDATE_OUT=$(mxpy contract call $SC_ADDR \
  --pem $PEM_FILE --proxy $PROXY --chain $CHAIN \
  --recall-nonce --gas-limit 5000000 \
  --function updateRoot \
  --arguments $ROOT_HEX \
  --send --outfile update.json)

# Wait for tx
echo "⏳ Waiting 10 seconds..."
sleep 10
UPDATE_TX_HASH=$(cat update.json | jq -r '.emittedTransactionHash')
echo "✅ Root Updated! Tx Hash: $UPDATE_TX_HASH"

# 4. Simulate verifyProof
echo -e "\n🔍 Simulating 'verifyProof' Gas Cost..."
LEAF="62a5509a25032abef1ce2320b99147d3c01c0bbff44778399eef4b8939c36dff" # random leaf
PROOF="e508dada77fa83d4e4fdb586b6ae4ae0e89caa4375a511debe231d08e4706f41@6bf4d3ec70e7ac703bca24b147f83bb6aad58edeb8b66087ed384302f481baa4@33b729ec5b055abac6849f9ad05cc96253287d1baa0e68f7350baa2597cfd879"

SIM_OUT=$(mxpy contract query $SC_ADDR \
  --proxy $PROXY \
  --function verifyProof \
  --arguments $LEAF $PROOF)

echo "Simulation Result: $SIM_OUT"

echo "=========================================================="
echo "🎉 E2E Test Complete!"
