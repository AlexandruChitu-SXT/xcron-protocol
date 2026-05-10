#!/bin/bash

# XCron State Compression (XSC) - Testnet E2E Validation Script v4
# Orchestrates deployment, root updates, and packed proof verification.

PROXY="https://testnet-gateway.multiversx.com"
CHAIN="T"
PEM="../e2e_enclave.pem"
CONTRACT_ADDRESS="erd1qqqqqqqqqqqqqpgq9nl0l94xuhnf7lmmwspkylvylcsklwgftwwqrtunnf"

# 1. Update Root (Broadcasting the compressed state)
echo "[1/2] Updating Merkle Root on Testnet..."
ROOT_HASH="0xf3059c2f31f803b6c243f238cc70b97ae1d4a79f48340d7cf3abbc60bb797acc"

mxpy contract call $CONTRACT_ADDRESS \
    --pem $PEM --proxy $PROXY --chain $CHAIN --gas-limit 5000000 \
    --function updateRoot --arguments $ROOT_HASH --send

echo "[WAIT] Sleeping 2s for finality (Supernova UX)..."
sleep 2

# 2. Verify Proof (Using the Packed Proof optimization)
echo "[2/2] Verifying Packed Proof for Agent 777..."
LEAF="0x357e4a577b4323de2f692b30415cb9018d56ecad093cbab1ff03d232b8d81547"
PACKED_PROOF="0xe508dada77fa83d4e4fdb586b6ae4ae0e89caa4375a511debe231d08e4706f416bf4d3ec70e7ac703bca24b147f83bb6aad58edeb8b66087ed384302f481baa433b729ec5b055abac6849f9ad05cc96253287d1baa0e68f7350baa2597cfd8794bfcb1ff672ba8f33816d0acb446b259512f39116424719bad226fd80c014e7b20412151667512e8283bf0c6c3d27847e93f6504ae4315f6d37c40eb9f7f389cbd09048fc24d622618e277a27aec3a8157353a1cbdba9f4f6c73f58b6ce5d37509eb63fc11017dd990603318b32f35703d7ca07d1760d8d93ba39b4116656b59ecff04d4087f151a602d75e96173b97e5efa90ea0030c2fd8ec567794979ff34a0dba4c7b27830038b3ebaf0b215f8f94a09c7109db8273024ec3bc455ac5fb6f5c4676b87a2d1d86305ad9484f1fc17eb92696630a41671bfc612ef5ea2a57bd71aefd59d5e32a6096340e4f74306792dc1e11c730ca9fd2945ce1a3b56f69fc4bf7393247b0e7e81a32f9cabb348857ac9cb20863c2475db7f0c8131da68d0ebc22cb052adac84071bd15fe90ac148aa2789a44b878a90883e90777cd95de9ecc45afa0d8f621e77470f572d5e8a974c4b5bd72432944b1c2f55b1626bb0bc"

mxpy contract query $CONTRACT_ADDRESS \
    --proxy $PROXY --function verifyProof \
    --arguments $LEAF $PACKED_PROOF
