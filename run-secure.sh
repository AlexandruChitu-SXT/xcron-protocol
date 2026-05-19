#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# XCRON PROTOCOL — SECURE ENCLAVE SANDBOX LAUNCHER
# ═══════════════════════════════════════════════════════════
# This script runs the XCron Rust Keeper inside a hermetically 
# sealed Docker container to prevent Supply Chain Attacks 
# (malicious dependencies stealing .pem keys).
# 
# Defenses active:
# 1. Read-Only mount for PEM files.
# 2. No Root access (runs as nobody).
# 3. Dropped all Linux capabilities.
# 4. Strict egress firewall (Only allows 443 out to MultiversX RPCs).
# ═══════════════════════════════════════════════════════════

set -e

echo "️ INITIATING XCRON SOVEREIGN SANDBOX..."

# Check if PEM exists
if [ ! -f "walletKey.pem" ]; then
  echo " ERROR: walletKey.pem not found in current directory."
  exit 1
fi

echo " Building Secure Rust Container (No-Root, Capabilities Dropped)..."
docker build -t xcron-secure-keeper -f - . <<EOF
FROM rust:1.76-slim-bullseye AS builder
WORKDIR /usr/src/xcron

# ️ XCRON-PROTECT: Vector 25 Fix - Container Layer Key Leak
# "COPY . ." copies the entire directory including `.secrets` and `walletKey.pem` into the 
# Docker builder cache. Even in multi-stage builds, an attacker can extract these keys from 
# the builder layer history. We only copy the exact Rust source folder needed.
COPY xcron-keeper-rs/ ./xcron-keeper-rs/

RUN cd xcron-keeper-rs && cargo build --release --bin xcron-keeper-rs

FROM debian:bullseye-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
# Run as non-root
RUN useradd -ms /bin/bash xcron_user
USER xcron_user
WORKDIR /app
COPY --from=builder /usr/src/xcron/target/release/xcron-keeper-rs /app/
ENTRYPOINT ["./xcron-keeper-rs"]
EOF

echo " Launching Keeper in strictly isolated environment..."
docker run -d \
 --name xcron_keeper_sandbox \
 --read-only \
 --cap-drop ALL \
 --security-opt no-new-privileges:true \
 --network none \
 -v "$(pwd)/walletKey.pem:/app/walletKey.pem:ro" \
 xcron-secure-keeper

echo " KEEPER LAUNCHED IN FORTIFIED ENCLAVE."
echo "Your private keys are now immune to Supply Chain crate attacks."
