import sys
import time
from pathlib import Path
from multiversx_sdk import *

def main():
    provider = ProxyNetworkProvider("https://testnet-gateway.multiversx.com")
    wallet_pem = Path("../../.secrets/e2e_user.pem").expanduser().resolve()
    wallet_secret = UserPEM.from_file(wallet_pem, 0).secret_key
    signer = UserSigner(wallet_secret)
    wallet = Address.new_from_bech32("erd1sp9lge3qk80qmvf2qectnluugtzfrd46mmgpps20yqy0tdrk3e6q47qm7m")
    contract = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263")
    ping_addr = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r")
    
    target_time = int(time.time() * 1000)
    tx = Transaction(
        sender=wallet.to_bech32(),
        receiver=contract.to_bech32(),
        gas_limit=20000000,
        value=100000000000000000,
        chain_id="T",
        data=b"scheduleTask@" + ping_addr.get_public_key().hex().encode() + b"@70696e67@@01@" + target_time.to_bytes(8, 'big').hex().encode() + b"@00989680@03"
    )
    
    computer = TransactionComputer()
    tx.nonce = provider.get_account(wallet).nonce
    tx.signature = signer.sign(computer.compute_bytes_for_signing(tx))
    hash = provider.send_transaction(tx)
    print(hash)

if __name__ == "__main__":
    main()
