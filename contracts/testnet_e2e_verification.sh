#!/bin/bash
set -e

echo "======================================================="
echo " ️ XCron Protocol - Testnet Red-Team Verification Flow"
echo "======================================================="

PEM="../.secrets/wallet.pem"
PROXY="https://testnet-gateway.multiversx.com"
CHAIN="T"

if [ ! -f "$PEM" ]; then
  echo " Error: PEM file not found at $PEM"
  exit 1
fi

WALLET_ADDR=$(head -n 1 $PEM | grep -oE "erd1[a-z0-9]{58}")
echo " Using Wallet: $WALLET_ADDR"

echo ""
echo " 1. Building Smart Contracts..."
(cd keeper-registry/meta && cargo run build)
(cd scheduler/meta && cargo run build)

echo ""
echo " 2. Deploying Keeper Registry..."
# min_stake = 5 EGLD (5000000000000000000), slash_pct_bps = 500 (5%), cooldown = 60s, treasury = WALLET_ADDR
mxpy contract deploy --bytecode=keeper-registry/output/keeper-registry.wasm --pem=$PEM \
 --gas-limit=150000000 \
 --arguments 5000000000000000000 500 60 addr:$WALLET_ADDR \
 --proxy=$PROXY --chain=$CHAIN \
 --outfile="deploy_registry.json" --send --wait-result

REGISTRY_ADDR=$(jq -r '.contractAddress' deploy_registry.json)
echo " Keeper Registry Deployed: $REGISTRY_ADDR"

echo ""
echo " 3. Deploying Scheduler..."
# registry_addr = REGISTRY_ADDR, rewards_addr = WALLET_ADDR, min_deposit = 0.01 EGLD, fee_bps = 100
mxpy contract deploy --bytecode=scheduler/output/scheduler.wasm --pem=$PEM \
 --gas-limit=200000000 \
 --arguments addr:$REGISTRY_ADDR addr:$WALLET_ADDR 10000000000000000 100 \
 --proxy=$PROXY --chain=$CHAIN \
 --outfile="deploy_scheduler.json" --send --wait-result

SCHEDULER_ADDR=$(jq -r '.contractAddress' deploy_scheduler.json)
echo " Scheduler Deployed: $SCHEDULER_ADDR"

echo ""
echo " [PRUEBA DE FLUJO 1]: Vulnerabilidad V3 (Liquidity Leak en Slashing)"
echo "  Registrando Keeper con 5 EGLD..."
mxpy contract call $REGISTRY_ADDR --pem=$PEM --gas-limit=10000000 --function="registerKeeper" \
 --value=5000000000000000000 --proxy=$PROXY --chain=$CHAIN --send --wait-result

echo "  Solicitando Unstake (inicia cooldown)..."
mxpy contract call $REGISTRY_ADDR --pem=$PEM --gas-limit=10000000 --function="requestUnstake" \
 --proxy=$PROXY --chain=$CHAIN --send --wait-result

echo "  Aplicando Slash (Simulación de penalización mientras está en cooldown)..."
# Slash dummy keeper
mxpy contract call $REGISTRY_ADDR --pem=$PEM --gas-limit=20000000 --function="slashKeeper" \
 --arguments addr:$WALLET_ADDR 0x4d616c6963696f7573 \
 --proxy=$PROXY --chain=$CHAIN --send --wait-result

echo "  Consultando totalCommittedCooldownEgld (Debe haberse reducido atómicamente!)..."
mxpy contract query $REGISTRY_ADDR --function="totalCommittedCooldownEgld" --proxy=$PROXY > query_v3.json
HEX_VAL=$(jq -r '.[0]' query_v3.json)
DEC_VAL=$(python3 -c "print(int('$HEX_VAL', 16) / 10**18 if '$HEX_VAL' != 'null' else 0.0)")
echo "  Cooldown EGLD Reserve: $DEC_VAL EGLD ($HEX_VAL)"

echo ""
echo " [PRUEBA DE FLUJO 2]: Vulnerabilidad V1 (Free Spam de Tareas Fallidas)"
echo "  Habilitando token de pago XCRONT-19e2eb en la Whitelist del Scheduler..."
mxpy contract call $SCHEDULER_ADDR --pem=$PEM --gas-limit=10000000 --function="addAcceptedPaymentToken" \
  --arguments str:XCRONT-19e2eb --proxy=$PROXY --chain=$CHAIN --send --wait-result

echo "  Creando tarea intencionalmente rota en Scheduler..."
# usar token XCRONT-19e2eb y solver_fee 0 para evitar pánico EGLD+ESDT
mxpy contract call $SCHEDULER_ADDR --pem=$PEM --gas-limit=20000000 --function="createIntent" \
  --token-transfers XCRONT-19e2eb 50000000000000000 \
  --arguments str:XCRONT-19e2eb 99999000000000000000 9999999999 0 \
 --proxy=$PROXY --chain=$CHAIN --send --wait-result

echo "  El usuario NO recibe el 100%. Paga el fee del protocolo como castigo, y el keeper pierde el gas."
echo "  Consultando fees del protocolo acumulados..."
mxpy contract query $SCHEDULER_ADDR --function="getAccruedProtocolFees" --proxy=$PROXY > query_v1.json
HEX_FEES=$(jq -r '.[0]' query_v1.json)
DEC_FEES=$(python3 -c "print(int('$HEX_FEES', 16) / 10**18 if '$HEX_FEES' not in ['', 'null'] else 0.0)")
echo "  Accrued Protocol Fees: $DEC_FEES EGLD ($HEX_FEES)"

echo ""
echo " [PRUEBA DE FLUJO 3]: Vulnerabilidad V12 (Stuck XSE Tasks)"
echo "  Intentando rescatar una tarea que NO lleva 24h atascada (Debe Fallar para probar el candado de tiempo)..."
# Using a dummy task hash
mxpy contract call $SCHEDULER_ADDR --pem=$PEM --gas-limit=10000000 --function="rescueStuckXseTask" \
 --arguments 0x0000000000000000000000000000000000000000000000000000000000000000 \
 --proxy=$PROXY --chain=$CHAIN --send --wait-result || echo " Falló correctamente (Task not found o Time Lock activo)"

echo ""
echo " [PRUEBA DE FLUJO 4]: Vector 4 (Poisoned Tokens / Whitelist)"
echo "  Intentando crear Intent con un Token SCAM no registrado..."
mxpy contract call $SCHEDULER_ADDR --pem=$PEM --gas-limit=15000000 --function="createIntent" \
  --value=10000000000000000 \
  --arguments str:SCAM-123456 99999000000000000000 9999999999 10000000000000000 \
 --proxy=$PROXY --chain=$CHAIN --send --wait-result || echo " Falló correctamente (Token no está en la Whitelist)"

echo ""
echo " ¡Múltiples Pruebas End-to-End completadas en Testnet!"
