#!/bin/bash

# XCronProtocol - High TPS Demo Launcher
# ------------------------------------------------------------------

# Colores y Formatos
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${CYAN}${BOLD}"
cat << "EOF"
██╗  ██╗ ██████╗██████╗  ██████╗ ███╗   ██╗
╚██╗██╔╝██╔════╝██╔══██╗██╔═══██╗████╗  ██║
 ╚███╔╝ ██║     ██████╔╝██║   ██║██╔██╗ ██║
 ██╔██╗ ██║     ██╔══██╗██║   ██║██║╚██╗██║
██╔╝ ██╗╚██████╗██║  ██║╚██████╔╝██║ ╚████║
╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝

    [ PROTOCOL KEEPER - TOKIO CORE ]
EOF
echo -e "${NC}"

echo -e "${YELLOW}>>> PREPARING RUST ASYNCHRONOUS ENGINE...${NC}"
cd xcron-keeper-rs || exit 1

echo -e "${CYAN}[1/3] Compiling XCron Keeper in Release Mode (Optimized)...${NC}"
cargo build --release --quiet
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Compilation failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful.${NC}\n"

echo -e "${PURPLE}>>> TARGETING BATTLE OF NODES (SUPERNOVA TESTNET) <<<${NC}"
echo -e "${CYAN}[2/3] Loading 500 Wallets into RAM...${NC}"
echo -e "${CYAN}[3/3] Setting Payload Data: \"XCronProtocol\"${NC}"

# Pausa para drama
sleep 1.5

echo -e "\n${RED}${BOLD}⚠️  WARNING: INITIATING HIGH TPS STRESS TEST ⚠️${NC}"
echo -e "Target Throughput: 50,000 TPS"
echo -e "Wallet Swarm:      500 Active Connections"
echo -e "Payload:           XCronProtocol\n"

read -p "Press [ENTER] to ignite the swarm or [CTRL+C] to abort..."

echo -e "\n${GREEN}🚀 IGNITION! Executing Tokio Tasks...${NC}"

# Comando para ejecutar el bot directamente con el binario compilado (bypass a 'cargo run' para no tener overhead)
# Usaremos --broadcasters altas y --tps 50000 
./target/release/xcron-keeper-rs \
    --mode tps-demo \
    --tps 50000 \
    --broadcasters 2500 \
    --wallets 500 \
    --gateway "https://testnet-api.multiversx.com" \
    --chain-id "T" \
    --wallets-file "../.secrets/hydra-keys.json"
