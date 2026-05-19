#!/bin/bash
set -e

echo "============================================"
echo " MX-8004: Smart Contracts — Setup"
echo "============================================"

# Prerequisites
command -v cargo >/dev/null 2>&1 || { echo " Rust not found. Install via https://rustup.rs"; exit 1; }
echo " cargo $(cargo --version | cut -d' ' -f2)"

# WASM target
echo " Installing wasm32-unknown-unknown target..."
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# sc-meta
if ! command -v sc-meta >/dev/null 2>&1; then
  echo " Installing multiversx-sc-meta..."
  cargo install multiversx-sc-meta
fi
echo " sc-meta installed"

# Build contracts
echo " Building all contracts..."
sc-meta all build

echo ""
echo "Built artifacts:"
for contract in identity-registry validation-registry reputation-registry; do
  WASM="$contract/output/$contract.wasm"
  if [ -f "$WASM" ]; then
    echo "  $contract.wasm ($(wc -c < "$WASM" | tr -d ' ') bytes)"
  else
    echo "  $contract.wasm — missing"
  fi
done

# Run tests
echo ""
echo " Running tests..."
cargo test

echo ""
echo " Setup complete!"
echo "  WASM files in: <contract>/output/<contract>.wasm"
