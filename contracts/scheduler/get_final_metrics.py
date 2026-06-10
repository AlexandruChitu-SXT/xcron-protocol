import requests
import json
import base64
from multiversx_sdk import ProxyNetworkProvider

provider = ProxyNetworkProvider("https://testnet-gateway.multiversx.com")

txs = {
    "aspirin": "916c2fcb05eb8ff62d84e2a1b8846709f3c2163e5f2e8988fd54a7f2a51d61ae",
    "benzene": "71f8053cbb65b7bd9effb67739f0dcead42bda4fc100e9a63fb9af1b59763f66",
    "paracetamol": "10ad7f372a60219e2218fd4c9a96de34fa3526400677cf06f12a93b5cac8d1ec",
    "fluorobenzene": "6171265f7a6cdd90c303eb46488545b1dc25e0c38b5f0eff55355630e779deb9",
    "benzene_duplicate": "1874cc2052bb72d6569497a7596b7e100df1bf731d594fa3a5e5205566ade713"
}

def analyze_tx(name, tx_hash):
    try:
        t = provider.get_transaction(tx_hash)
        raw_tx = t.raw
        
        status_str = t.status.status
        gas_limit = raw_tx.get("gasLimit", 0)
        gas_used = raw_tx.get("gasUsed", 0)
        
        # Look for refund smart contract result
        refund_val = 0
        sc_results = raw_tx.get("smartContractResults", [])
        for scr in sc_results:
            # Check if it's a refund (data is empty or @6f6b and receiver is the sender)
            data = scr.get("data", "")
            if (data == "@6f6b" or data == "") and scr.get("receiver") == raw_tx.get("sender"):
                val_str = scr.get("value", "0")
                try:
                    refund_val = int(val_str)
                except Exception:
                    pass
                
        # Parse signalError if any
        error_msg = ""
        logs = raw_tx.get("logs", {})
        if logs:
            events = logs.get("events", [])
            for ev in events:
                if ev.get("identifier") == "signalError":
                    status_str = "reverted"
                    topics = ev.get("topics", [])
                    if len(topics) > 1:
                        try:
                            err_bytes = base64.b64decode(topics[1])
                            error_msg = err_bytes.decode('utf-8')
                        except Exception:
                            error_msg = topics[1]
                    break
                    
        # Calculate true gas used (if refund occurred)
        gas_price = raw_tx.get("gasPrice", 1000000000)
        if refund_val > 0:
            true_gas_used = gas_limit - (refund_val // gas_price)
        else:
            true_gas_used = gas_used
            
        print(f"Molecule: {name}")
        print(f"  Tx Hash: {tx_hash}")
        print(f"  Explorer: https://testnet-explorer.multiversx.com/transactions/{tx_hash}")
        print(f"  Gateway Status: {t.status.status}")
        print(f"  Execution Status: {status_str}" + (f" ({error_msg})" if error_msg else ""))
        print(f"  Gas Limit: {gas_limit}")
        print(f"  Gateway Gas Used: {gas_used}")
        print(f"  Refund Value: {refund_val}")
        print(f"  Calculated True Gas Used: {true_gas_used}")
        print("-" * 60)
        
    except Exception as e:
        print(f"Error analyzing {name}: {e}")

if __name__ == "__main__":
    print("================== DETAILED TESTNET METRICS ==================\n")
    for name, h in txs.items():
        analyze_tx(name, h)
