#!/bin/bash
set -e

# Build 0.66.0 (current)
echo "Building 0.66.0..."
cd /Users/alejandrochitu/xcron-protocol/contracts/xwap
sc-meta all build
cp output/xwap.wasm ../../xwap_v66.wasm

# Bump down to 0.65.0 for xwap and common (since xwap depends on common)
echo "Bumping down to 0.65.0..."
cd /Users/alejandrochitu/xcron-protocol/contracts
python3 -c "
import glob
for path in glob.glob('**/Cargo.toml', recursive=True):
    with open(path, 'r') as f: content = f.read()
    content = content.replace('\"0.66.0\"', '\"0.65.0\"')
    with open(path, 'w') as f: f.write(content)
"
cargo update

echo "Building 0.65.0..."
cd /Users/alejandrochitu/xcron-protocol/contracts/xwap
sc-meta all build
cp output/xwap.wasm ../../xwap_v65.wasm

# Restore back to 0.66.0
echo "Restoring to 0.66.0..."
cd /Users/alejandrochitu/xcron-protocol/contracts
python3 -c "
import glob
for path in glob.glob('**/Cargo.toml', recursive=True):
    with open(path, 'r') as f: content = f.read()
    content = content.replace('\"0.65.0\"', '\"0.66.0\"')
    with open(path, 'w') as f: f.write(content)
"
cargo update
echo "Done!"
