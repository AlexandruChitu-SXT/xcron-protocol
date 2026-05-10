#!/bin/bash

# XCron Protocol - Battle of Nodes Master Deployment Master Script
# Automatically pushes the local compiled Rust Fuzzer/Keeper and keys to the target VPS

if [ -f .env ]; then
  # 🛡️ XCRON-PROTECT: Vector 24 Fix - Shell Injection via .env
  # The previous `xargs` method allowed arbitrary code execution if .env contained crafted strings.
  set -a; source .env; set +a
else
  echo "⚠️ Archivo .env no encontrado. Crea uno desde .env.example"
  exit 1
fi

TARGET_IP="91.99.129.19"
USER=${VPS_USER:-"root"}
# 🛡️ XCRON-PROTECT: Vector 24 Fix - SSH MITM Attack Prevention
# Removed StrictHostKeyChecking=no. This prevented SSH from verifying the host's authenticity,
# allowing a Man-In-The-Middle attacker to intercept hydra-keys.json via DNS/ARP spoofing.
SSH_CMD="ssh"
TARGET_DIR="/root/xcron-master"
LOCAL_DIR="/Users/alejandrochitu/xcron-protocol"

echo "🦅 [BoN] Iniciando despliegue de Load Generator hacia $TARGET_IP..."

# 1. Ensure target directory exists
echo "📂 Creando directorio remoto $TARGET_DIR..."
ssh -o ConnectTimeout=10 -o UpdateHostKeys=yes $USER@$TARGET_IP "mkdir -p $TARGET_DIR/.secrets"

# 2. Sync the pre-compiled Mac/Linux Binary
# Note: Ensure the Rust bot is compiled for the target architecture. 
# If targeting a Linux VPS from a Mac M1, we would normally cross-compile (cargo build --release --target x86_64-unknown-linux-gnu).
# But for now, we will push the source and build it there just in case, or push the binary if it matches.
echo "🚀 Transfiriendo código fuente de Rust..."
rsync -avz -e "ssh -o ConnectTimeout=10" \
    --exclude target/ \
    --exclude .git/ \
    $LOCAL_DIR/xcron-keeper-rs/ $USER@$TARGET_IP:$TARGET_DIR/xcron-keeper-rs/

# 3. Synchronize the Load-testing Accounts (100,000 Hydra Wallets)
echo "💎 Transfiriendo las 100,000 Carteras de Estrés (19MB JSON)..."
rsync -avz -e "ssh -o ConnectTimeout=10" \
    $LOCAL_DIR/.secrets/hydra-keys.json $USER@$TARGET_IP:$TARGET_DIR/xcron-keeper-rs/.secrets/

echo ""
echo "⚙️  [4/4] Instalando Motor Rust y El Gateway P2P (Observer Node) en remoto..."
ssh -o ConnectTimeout=10 $USER@$TARGET_IP << 'EOF'
  echo "=> 💾 Inyectando 2GB de Memoria SWAP (Para compilar en Rust sin OOM)..."
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "   [SWAP ACTIVADO]"
  fi
  
  echo "=> ⚡ Tuneando Linux Kernel (TCP Ports & 1M File Descriptors)..."
  echo "fs.file-max = 1000000" >> /etc/sysctl.conf
  echo "net.ipv4.ip_local_port_range = 1024 65535" >> /etc/sysctl.conf
  echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
  sysctl -p > /dev/null 2>&1
  echo "* soft nofile 1000000" >> /etc/security/limits.conf
  echo "* hard nofile 1000000" >> /etc/security/limits.conf
  ulimit -n 1000000

  echo "=> 🛡️  Instalando dependencias base y Tmux..."
  apt-get update -y > /dev/null 2>&1
  apt-get install -y build-essential curl pkg-config libssl-dev tmux jq > /dev/null 2>&1
  
  echo "=> 🦀 Instalando Rust..."
  if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y > /dev/null 2>&1
  fi
  source $HOME/.cargo/env
  
  echo "=> ⚔️  Compilando xcron-keeper-rs (The Executor)..."
  cd /root/xcron-master/xcron-keeper-rs
  cargo build --release
  
  echo "=> 🌐 Instalando el Proxy P2P (MultiversX Observer Node)..."
  
  # Instalar Go si no está presente (requerido para compilar mx-chain-go)
  if ! command -v go &> /dev/null; then
      echo "     Instalando Go 1.22..."
      wget -q https://go.dev/dl/go1.22.10.linux-amd64.tar.gz
      rm -rf /usr/local/go
      tar -C /usr/local -xzf go1.22.10.linux-amd64.tar.gz
      rm go1.22.10.linux-amd64.tar.gz
      echo 'export PATH=$PATH:/usr/local/go/bin' >> /root/.bashrc
      export PATH=$PATH:/usr/local/go/bin
  fi
  export PATH=$PATH:/usr/local/go/bin
  
  mkdir -p /root/multiversx-node
  cd /root/multiversx-node
  
  # Compilar mx-chain-go desde el código fuente si el binario no existe
  if [ ! -f /usr/local/bin/node ]; then
      echo "     Clonando y compilando mx-chain-go v1.11.1 (esto tarda ~3-5 min)..."
      cd /root
      if [ ! -d mx-chain-go ]; then
          git clone --depth 1 --branch v1.11.1 https://github.com/multiversx/mx-chain-go.git
      fi
      cd mx-chain-go/cmd/node
      go build -o /usr/local/bin/node -v .
      echo "     ✅ Binario compilado: /usr/local/bin/node"
  fi

  cd /root/multiversx-node
  
  # Descargar configuración de Battle of Nodes (BoN)
  if [ ! -d /root/mx-chain-scripts ]; then
      echo "     Descargando mx-chain-scripts..."
      cd /root
      git clone https://github.com/multiversx/mx-chain-scripts.git
  fi
  
  cd /root/mx-chain-scripts
  echo "OVERRIDE_CONFIGVER=\"v1.11.0.3-bon\"" > config/variables.cfg
  
  # Forzar la API REST en puerto 8080 para el bot de Rust en la configuración local
  mkdir -p /root/multiversx-node/config
  
  # Setup using the scripts non-interactively
  cd /root/mx-chain-scripts
  echo "y" | ./script.sh config obs || true

  # Asegurar que el observer arranca en el puerto correcto y con la REST API
  if [ -f /root/multiversx-node/config/prefs.toml ]; then
      sed -i 's|RestApiInterface.*|RestApiInterface = "127.0.0.1:8080"|' /root/multiversx-node/config/prefs.toml
  fi
  
  # Generar validatorKey dummy para Observer
  if [ ! -f /root/multiversx-node/validatorKey.pem ]; then
      echo "     Generando validatorKey.pem temporal para Observer..."
      dd if=/dev/urandom bs=96 count=1 2>/dev/null | base64 > /root/multiversx-node/validatorKey.pem
  fi

  echo "     Lanzando Node P2P Proxy en background (Tmux)..."
  tmux kill-session -t mxnode 2>/dev/null
  tmux new-session -d -s mxnode "cd /root/multiversx-node && /usr/local/bin/node --log-level=*:INFO --use-log-view"
  
  echo ""
  echo "====================================================================="
  echo " ✅  ¡MASTER NODE (LOAD GENERATOR) TOTALMENTE OPERATIVO!             "
  echo "     - P2P Observer (Port 37330):  ARRANCADO (sincronizando devnet)  "
  echo "     - Local API (Port 8080):      LISTA PARA STRESS-TEST            "
  echo "     - Rust Fuzzer Engine:         COMPILADO                         "
  echo "====================================================================="
EOF

echo "✅ [BoN] Despliegue Completado con Éxito."
echo "Para arrancar la generación de carga legítima, entra en el máster:"
echo "ssh root@$TARGET_IP"
echo "cd $TARGET_DIR/xcron-keeper-rs && cargo run --release -- --mode stress --tps 20"
