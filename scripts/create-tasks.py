#!/usr/bin/env python3
"""Create 20 tasks rapidly for stress testing."""
import subprocess, json, time, sys, os
import urllib.request

API = 'https://devnet-api.multiversx.com'
PROXY = 'https://devnet-gateway.multiversx.com'
SCHEDULER = 'erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72'
PING_SC = 'erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r'
PEM = os.path.join(os.path.dirname(__file__), '..', '.secrets', 'deployer.pem')
CHAIN = 'D'
COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 20

def get_round():
  with urllib.request.urlopen(f'{API}/stats') as r:
    d = json.loads(r.read())
    return d['epoch'] * d['roundsPerEpoch'] + d['roundsPassed']

def get_nonce(addr):
  with urllib.request.urlopen(f'{API}/accounts/{addr}') as r:
    return json.loads(r.read())['nonce']

deployer = 'erd135zkexfnzryv7z04vppm28uajdsxfvnel2n3kdw2spv3jk0j7k8stpwpgu'
nonce = get_nonce(deployer)
current_round = get_round()

print(f'═══ Creating {COUNT} tasks ═══')
print(f'Nonce: {nonce}, Round: {current_round}\n')

endpoints = ['ping', 'claimRewards', 'compound', 'swap', 'mint']
created = 0

for i in range(COUNT):
  ep = endpoints[i % len(endpoints)]
  target_round = current_round + 3 + (i * 2) # stagger targets
  target_hex = format(target_round, '016x')
  deposit = '100000000000000000' # 0.1 EGLD

  cmd = [
    'mxpy', 'contract', 'call', SCHEDULER,
    '--function', 'scheduleTask',
    '--arguments', f'addr:{PING_SC}', f'str:{ep}', '0', f'0x00{target_hex}', '10000000', '3', '1000',
    '--pem', PEM,
    '--gas-limit', '30000000',
    '--chain', CHAIN,
    '--proxy', PROXY,
    '--nonce', str(nonce),
    '--value', deposit,
    '--send',
  ]

  result = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL)
  if 'emittedTransactionHash' in result.stdout:
    print(f'  #{i+1} {ep}() → round {target_round}')
    created += 1
  else:
    print(f'  #{i+1} failed')
  nonce += 1

print(f'\n═══ Created: {created}/{COUNT} tasks ═══')
