import sys
from pathlib import Path
from multiversx_sdk import (
    Account,
    Address,
    Transaction,
    TransactionComputer,
    ProxyNetworkProvider,
    SmartContractTransactionsFactory,
    TransactionsFactoryConfig,
    AddressComputer
)
from Crypto.Hash import keccak

# Setup
provider = ProxyNetworkProvider("https://testnet-gateway.multiversx.com")
config = TransactionsFactoryConfig("T")
factory = SmartContractTransactionsFactory(config)

user_pem = Path("../../.secrets/e2e_user.pem")
keeper_pem = Path("../../.secrets/e2e_keeper.pem")

from multiversx_sdk import UserSigner

user_signer = UserSigner.from_pem_file(user_pem)
keeper_signer = UserSigner.from_pem_file(keeper_pem)

user_address = user_signer.get_pubkey().to_address("erd")
keeper_address = keeper_signer.get_pubkey().to_address("erd")

user_nonce = provider.get_account(user_address).nonce
keeper_nonce = provider.get_account(keeper_address).nonce

scheduler_addr = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263")
ping_addr = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r")

secret = bytes([1]*32)
task_id = 1002

# Compute expected_hash: Keccak256(S || OwnerAddress || TaskId || TargetAddress)
k = keccak.new(digest_bits=256)
k.update(secret)
k.update(user_address.get_public_key())
k.update(task_id.to_bytes(8, byteorder='big'))
k.update(ping_addr.get_public_key())
expected_hash = k.digest()

# Build Task Payload
payload = bytearray()
payload += task_id.to_bytes(8, byteorder='big') # id
payload += user_address.get_public_key() # owner
payload += ping_addr.get_public_key() # target_contract
payload += (4).to_bytes(4, byteorder='big') + b'ping' # target_endpoint (length + str)
payload += (0).to_bytes(4, byteorder='big') # target_args (empty vec)
payload += (4).to_bytes(1, byteorder='big') # trigger: QuantumSealedHash
payload += expected_hash # expected_hash
payload += (10000000).to_bytes(8, byteorder='big') # max_gas
payload += (8).to_bytes(4, byteorder='big') + (100000000000000000).to_bytes(8, byteorder='big') # deposit
payload += (3).to_bytes(1, byteorder='big') # max_retries
payload += (0).to_bytes(1, byteorder='big') # retry_count
payload += (150000000).to_bytes(8, byteorder='big') # ttl_seconds
import time
current_time_ms = int(time.time() * 1000)
payload += (current_time_ms).to_bytes(8, byteorder='big') # created_at
payload += (0).to_bytes(1, byteorder='big') # status (Pending)
payload += (0).to_bytes(1, byteorder='big') # assigned_keeper (None)
payload += (0).to_bytes(8, byteorder='big') # completed_at
payload += (0).to_bytes(1, byteorder='big') # post_task_id
payload += (0).to_bytes(1, byteorder='big') # require_xwap_safe
payload += (0).to_bytes(1, byteorder='big') # confidential

payload_hex = payload.hex()
print(f"Task Payload: {payload_hex}")

print("\n--- 1. User schedules Quantum Task ---")
tx = Transaction(
    sender=user_address.to_bech32(),
    receiver=scheduler_addr.to_bech32(),
    value="100000000000000000",
    gas_limit=20000000,
    data=b"scheduleQuantumTask@" + payload_hex.encode(),
    chain_id="T"
)
tx.nonce = user_nonce

computer = TransactionComputer()
tx.signature = user_signer.sign(computer.compute_bytes_for_signing(tx))
hash1 = provider.send_transaction(tx)
print(f"Tx Hash: {hash1}")

import time
print("Waiting for tx...")
time.sleep(15)

print("\n--- 2. Keeper executes Quantum Task ---")
tx2 = Transaction(
    sender=keeper_address.to_bech32(),
    receiver=scheduler_addr.to_bech32(),
    gas_limit=50000000,
    data=b"executeQuantumTask@" + payload_hex.encode() + b"@" + secret.hex().encode(),
    chain_id="T"
)
tx2.nonce = keeper_nonce
tx2.signature = keeper_signer.sign(computer.compute_bytes_for_signing(tx2))
hash2 = provider.send_transaction(tx2)
print(f"Tx Hash: {hash2}")
