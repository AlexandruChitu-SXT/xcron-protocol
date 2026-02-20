#!/bin/bash
set -e

# Configuración Inicial
PEM_FILE="../.secrets/deployer.pem"
PROXY="https://devnet-gateway.multiversx.com"
CHAIN_ID="D"
GAS_LIMIT=150000000

# Extraer dirección del deployer (Treasury)
DEPLOYER=$(head -n 2 ${PEM_FILE} | grep -o 'erd1[a-z0-9]*')
echo "=> Deployer (Treasury): ${DEPLOYER}"

# Usamos los binarios que ya compilamos manualmente en el workspace.
echo "=> Keeper Registry ya fue desplegado exitosamente."
REGISTRY_ADDR="erd1qqqqqqqqqqqqqpgq3jg5fvd48xa97uyg0ancc0mzy5xvvtgh7k8s8ewnpf"
echo "   -> Keeper Registry: ${REGISTRY_ADDR}"

echo "=> Rewards ya fue desplegado exitosamente."
REWARDS_ADDR="erd1qqqqqqqqqqqqqpgq5ck78tmtupdl8jv78kuf8e379p9n97wx7k8sdzht6w"
echo "   -> Rewards: ${REWARDS_ADDR}"

echo "=> Desplegando Scheduler..."
# Init: keeper_registry, rewards_addr, min_deposit (0.01 EGLD), protocol_fee_bps (5%)
mxpy contract deploy --bytecode ../contracts/scheduler/output/scheduler.wasm \
    --pem ${PEM_FILE} --proxy ${PROXY} --chain ${CHAIN_ID} \
    --gas-limit 300000000 --send --metadata-payable \
    --arguments ${REGISTRY_ADDR} ${REWARDS_ADDR} 10000000000000000 500 > scheduler_out.log 2>&1

SCHEDULER_ADDR=$(grep '"contractAddress"' scheduler_out.log | grep -o 'erd1[a-zA-Z0-9]*')
echo "   -> Scheduler: ${SCHEDULER_ADDR}"

echo "============================================="
echo "Despliegue finalizado exitosamente."
echo "Keeper Registry: ${REGISTRY_ADDR}"
echo "Rewards:         ${REWARDS_ADDR}"
echo "Scheduler:       ${SCHEDULER_ADDR}"
echo "============================================="

# Guardar direcciones centralizadas
echo "{" > .deployed_addresses.json
echo "  \"keeperRegistry\": \"${REGISTRY_ADDR}\"," >> .deployed_addresses.json
echo "  \"rewards\": \"${REWARDS_ADDR}\"," >> .deployed_addresses.json
echo "  \"scheduler\": \"${SCHEDULER_ADDR}\"" >> .deployed_addresses.json
echo "}" >> .deployed_addresses.json
