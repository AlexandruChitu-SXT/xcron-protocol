#!/bin/bash
set -e

# Configuración Inicial
PEM_FILE="../.secrets/deployer.pem"
PROXY="https://testnet-gateway.multiversx.com"
CHAIN_ID="T"

# Extraer dirección del deployer (Treasury)
DEPLOYER=$(head -n 2 ${PEM_FILE} | grep -o 'erd1[a-z0-9]*')
echo "=> Deployer (Treasury): ${DEPLOYER}"

# 1. Desplegando Keeper Registry
echo "=> Desplegando Keeper Registry..."
TREASURY_HEX=$(mxpy wallet bech32 --decode "$DEPLOYER" 2>/dev/null)
mxpy contract deploy --bytecode ../contracts/keeper-registry/output/keeper-registry.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --arguments 1000000000000000000 1000 600 "0x${TREASURY_HEX}" \
    --outfile registry_deploy.json


REGISTRY_ADDR=$(jq -r '.contractAddress' registry_deploy.json)
echo "   -> Keeper Registry: ${REGISTRY_ADDR}"
sleep 15

# 2. Desplegando Rewards
echo "=> Desplegando Rewards..."
REGISTRY_HEX=$(mxpy wallet bech32 --decode "$REGISTRY_ADDR" 2>/dev/null)
mxpy contract deploy --bytecode ../contracts/rewards/output/rewards.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --arguments "0x${REGISTRY_HEX}" 2000 \
    --outfile rewards_deploy.json


REWARDS_ADDR=$(jq -r '.contractAddress' rewards_deploy.json)
echo "   -> Rewards: ${REWARDS_ADDR}"
sleep 15

# 3. Desplegando Scheduler
echo "=> Desplegando Scheduler..."
# Init: keeper_registry, rewards_addr, min_deposit (0.01 EGLD), protocol_fee_bps (5%)
mxpy contract deploy --bytecode ../contracts/scheduler/output/scheduler.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --arguments ${REGISTRY_ADDR} ${REWARDS_ADDR} 10000000000000000 500 \
    --outfile scheduler_deploy.json


SCHEDULER_ADDR=$(jq -r '.contractAddress' scheduler_deploy.json)
echo "   -> Scheduler: ${SCHEDULER_ADDR}"
sleep 15

# 4. Desplegando Ping (Test)
echo "=> Desplegando Ping (Test SC)..."
mxpy contract deploy --bytecode ../contracts/ping/output/ping.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --outfile ping_deploy.json


PING_ADDR=$(jq -r '.contractAddress' ping_deploy.json)
echo "   -> Ping: ${PING_ADDR}"

echo "=> Configurando Permisos Cruzados (Wiring)..."
SCHEDULER_HEX=$(mxpy wallet bech32 --decode "$SCHEDULER_ADDR" 2>/dev/null)

echo "   -> Autorizando Scheduler en KeeperRegistry..."
mxpy contract call "${REGISTRY_ADDR}" --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 10000000 --function "addAuthorizedCaller" --arguments "0x${SCHEDULER_HEX}" --send > /dev/null

echo "   -> Autorizando Scheduler en Rewards..."
mxpy contract call "${REWARDS_ADDR}" --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 10000000 --function "addAuthorizedScheduler" --arguments "0x${SCHEDULER_HEX}" --send > /dev/null
sleep 5

echo "============================================="
echo "Despliegue Maestro finalizado exitosamente."
echo "Keeper Registry: ${REGISTRY_ADDR}"
echo "Rewards:         ${REWARDS_ADDR}"
echo "Scheduler:       ${SCHEDULER_ADDR}"
echo "Ping:            ${PING_ADDR}"
echo "============================================="

# Guardar direcciones centralizadas
echo "{" > .deployed_addresses.json
echo "  \"keeperRegistry\": \"${REGISTRY_ADDR}\"," >> .deployed_addresses.json
echo "  \"rewards\": \"${REWARDS_ADDR}\"," >> .deployed_addresses.json
echo "  \"scheduler\": \"${SCHEDULER_ADDR}\"," >> .deployed_addresses.json
echo "  \"ping\": \"${PING_ADDR}\"" >> .deployed_addresses.json
echo "}" >> .deployed_addresses.json
echo "Guardado auto-enrutador en .deployed_addresses.json"
