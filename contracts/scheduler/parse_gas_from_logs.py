import requests
import json
import base64
import re
from multiversx_sdk import ProxyNetworkProvider

provider = ProxyNetworkProvider("https://testnet-gateway.multiversx.com")

txs = {
    "aspirin": "916c2fcb05eb8ff62d84e2a1b8846709f3c2163e5f2e8988fd54a7f2a51d61ae",
    "benzene": "71f8053cbb65b7bd9effb67739f0dcead42bda4fc100e9a63fb9af1b59763f66",
    "paracetamol": "10ad7f372a60219e2218fd4c9a96de34fa3526400677cf06f12a93b5cac8d1ec",
    "fluorobenzene": "6171265f7a6cdd90c303eb46488545b1dc25e0c38b5f0eff55355630e779deb9",
    "benzene_duplicate": "1874cc2052bb72d6569497a7596b7e100df1bf731d594fa3a5e5205566ade713"
}

def analyze_logs(name, tx_hash):
    try:
        t = provider.get_transaction(tx_hash)
        raw_tx = t.raw
        
        logs = raw_tx.get("logs", {})
        events = logs.get("events", []) if logs else []
        
        print(f"Molecule: {name}")
        print(f"  Tx Hash: {tx_hash}")
        
        found_gas_log = False
        for ev in events:
            topics = ev.get("topics", [])
            for top in topics:
                try:
                    # Decode base64
                    decoded = base64.b64decode(top).decode('utf-8')
                    if "gas used =" in decoded:
                        print(f"  Found Gas Log: {decoded}")
                        # Extract gas used
                        match = re.search(r"gas used\s*=\s*(\d+)", decoded)
                        if match:
                            print(f"  --> VM Gas Used: {match.group(1)}")
                            found_gas_log = True
                except Exception:
                    pass
                    
        if not found_gas_log:
            print("  No 'gas used' log found.")
        print("-" * 60)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    for name, h in txs.items():
        analyze_logs(name, h)
