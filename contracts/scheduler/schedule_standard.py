import time
from multiversx_sdk import *

def main():
    provider = ProxyNetworkProvider("https://testnet-gateway.multiversx.com")
    signer = UserSigner.from_pem_file("../../.secrets/e2e_user.pem")
    wallet = Address.new_from_bech32("erd1sp9lge3qk80qmvf2qectnluugtzfrd46mmgpps20yqy0tdrk3e6q47qm7m")
    contract = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263")
    ping_addr = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r")
    
    target_time = int(time.time() * 1000)
    
    # We will invoke scheduleTask with a similar size payload to what QuantumTask hides.
    # We will give it one argument: 100 bytes of zeros, to simulate a somewhat heavy payload.
    # target_contract (Address), target_endpoint (bytes), target_args (list of bytes)
    # trigger (enum), max_gas (u64), max_retries (u8), ttl_seconds (u64 option)
    
    # trigger = TimeOnce(target_time) -> 0x00 + target_time (8 bytes)
    trigger_bytes = b"\x00" + target_time.to_bytes(8, byteorder='big')
    
    # Let's use SmartContractTransactionsFactory to build the transaction so we don't mess up data encoding!
    # But wait, without ABI it might fail? We can just append hex directly to 'data'.
    
    # Let's manually construct the data string:
    # function name
    data = b"scheduleTask"
    
    # target_contract
    data += b"@" + ping_addr.get_public_key().hex().encode()
    
    # target_endpoint ("ping")
    data += b"@" + b"ping".hex().encode()
    
    # target_args (we'll pass NO arguments to keep it fair to the first test)
    # But wait, in MX, passing no arguments for a ManagedVec when it's not the last arg?
    # Usually you just pass an empty byte array? No, the data string would have missing args.
    # Actually, a transaction to an endpoint taking a ManagedVec as a middle argument is tricky manually.
    
    # Let's use the ABI! It is much safer!
    pass

if __name__ == "__main__":
    main()
