#!/bin/bash

# Load deployed addresses
source .deployed_addresses.json

CHAIN="D"
PROXY="https://devnet-gateway.multiversx.com"
WALLET="../.secrets/deployer.pem"

KEEPER_REGISTRY_ADDR=$(cat .deployed_addresses.json | grep keeperRegistry | awk -F '"' '{print $4}')
SCHEDULER_ADDR=$(cat .deployed_addresses.json | grep scheduler | awk -F '"' '{print $4}')
REWARDS_ADDR=$(cat .deployed_addresses.json | grep rewards | awk -F '"' '{print $4}')

echo "Contracts loaded:"
echo "Registry: $KEEPER_REGISTRY_ADDR"
echo "Scheduler: $SCHEDULER_ADDR"
echo "Rewards: $REWARDS_ADDR"

echo ">> Registering keeper..."
mxpy contract call "$KEEPER_REGISTRY_ADDR" \
    --pem "$WALLET" \
    --gas-limit 15000000 \
    --proxy "$PROXY" \
    --chain "$CHAIN" \
    --function "registerKeeper" \
    --value 1500000000000000000 \
    --send

echo "Waiting for transaction to process..."
sleep 15

echo ">> Querying active keeper count..."
mxpy contract query "$KEEPER_REGISTRY_ADDR" \
    --proxy "$PROXY" \
    --function "getActiveKeeperCount"
