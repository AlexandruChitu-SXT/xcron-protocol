#!/usr/bin/env python3
"""Fund 50 keeper wallets from deployer and register them in KeeperRegistry."""
import subprocess, json, csv, time, sys, os

DEPLOYER_PEM = os.path.join(os.path.dirname(__file__), '..', '.secrets', 'deployer.pem')
ADDRESSES_CSV = os.path.join(os.path.dirname(__file__), '..', '.secrets', 'keepers', 'addresses.csv')
KEEPER_REGISTRY = 'erd1qqqqqqqqqqqqqpgqdeyw8mmzkza4tlndeztty0f6hgng5z4s7k8suagqha'
PROXY = 'https://devnet-gateway.multiversx.com'
API = 'https://devnet-api.multiversx.com'
CHAIN = 'D'
FUND_VALUE = '20000000000000000'  # 0.02 EGLD
STAKE_VALUE = '10000000000000000' # 0.01 EGLD

def get_nonce(address):
  import urllib.request
  try:
    with urllib.request.urlopen(f'{API}/accounts/{address}') as r:
      return json.loads(r.read())['nonce']
  except:
    return 0

def send_tx(pem, receiver, value, nonce, gas=50000, data=None):
  cmd = ['mxpy', 'tx', 'new',
      '--receiver', receiver,
      '--value', value,
      '--pem', pem,
      '--gas-limit', str(gas),
      '--chain', CHAIN,
      '--proxy', PROXY,
      '--nonce', str(nonce),
      '--send']
  if data:
    cmd = ['mxpy', 'contract', 'call', receiver,
        '--function', data,
        '--pem', pem,
        '--gas-limit', str(gas),
        '--chain', CHAIN,
        '--proxy', PROXY,
        '--nonce', str(nonce),
        '--value', value,
        '--send']
  result = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL)
  return 'emittedTransactionHash' in result.stdout

# Load addresses
with open(ADDRESSES_CSV) as f:
  keepers = list(csv.DictReader(f))
print(f'═══ XCron Batch Fund & Register ═══')
print(f'Keepers: {len(keepers)}')

# Phase 1: Fund
nonce = get_nonce('erd135zkexfnzryv7z04vppm28uajdsxfvnel2n3kdw2spv3jk0j7k8stpwpgu')
print(f'\n Phase 1: Funding (nonce={nonce})...\n')
funded = 0
for k in keepers:
  ok = send_tx(DEPLOYER_PEM, k['address'], FUND_VALUE, nonce)
  status = '' if ok else ''
  print(f' {status} #{k["index"]} {k["address"][:20]}...')
  if ok: funded += 1
  nonce += 1
print(f'\n Funded: {funded}/{len(keepers)}')

# Wait for confirmations
print(f'\n Waiting 20s for confirmations...')
time.sleep(20)

# Phase 2: Register
print(f'\n Phase 2: Registering keepers...\n')
registered = 0
for k in keepers:
  kn = get_nonce(k['address'])
  ok = send_tx(k['pem'], KEEPER_REGISTRY, STAKE_VALUE, kn, gas=15000000, data='registerKeeper')
  status = '' if ok else ''
  print(f' {status} #{k["index"]} registered')
  if ok: registered += 1
print(f'\n Registered: {registered}/{len(keepers)}')

# Final check
print(f'\n═══ Summary ═══')
print(f'  Funded: {funded}')
print(f'  Registered: {registered}')
