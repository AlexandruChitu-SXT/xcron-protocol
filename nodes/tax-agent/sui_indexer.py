import json
import urllib.request
import csv
from datetime import datetime

class SuiIndexer:
    def __init__(self, address: str):
        self.address = address
        self.rpc_url = "https://fullnode.mainnet.sui.io:443"

    def fetch_transactions(self) -> list:
        print(f"Fetching Sui transactions for {self.address}...")
        all_txs = []
        has_next_page = True
        next_cursor = None
        pages = 0

        while has_next_page and pages < 10:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "suix_queryTransactionBlocks",
                "params": [
                    {
                        "filter": {"FromAddress": self.address},
                        "options": {"showBalanceChanges": True, "showEffects": True}
                    },
                    next_cursor,
                    50,
                    False
                ]
            }
            
            try:
                req = urllib.request.Request(self.rpc_url, data=json.dumps(payload).encode('utf-8'), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    if "result" not in data:
                        break
                    result = data["result"]
                    all_txs.extend(result.get("data", []))
                    has_next_page = result.get("hasNextPage", False)
                    next_cursor = result.get("nextCursor")
                    pages += 1
            except Exception as e:
                print(f"RPC Error: {e}")
                break

        return all_txs

    def process_data(self, transactions: list) -> list:
        rows = []
        for tx in transactions:
            tx_hash = tx.get("digest")
            timestamp_ms = int(tx.get("timestampMs", 0))
            timestamp = datetime.fromtimestamp(timestamp_ms / 1000.0).strftime('%Y-%m-%d %H:%M:%S UTC')
            
            # Get Fees
            fee_amount = ""
            fee_currency = ""
            effects = tx.get("effects", {})
            gas_used = effects.get("gasUsed", {})
            if gas_used:
                comp_cost = int(gas_used.get("computationCost", 0))
                storage_cost = int(gas_used.get("storageCost", 0))
                storage_rebate = int(gas_used.get("storageRebate", 0))
                total_gas = (comp_cost + storage_cost) - storage_rebate
                if total_gas > 0:
                    fee_amount = total_gas / (10**9) # SUI decimals
                    fee_currency = "SUI"
            
            balance_changes = tx.get("balanceChanges", [])
            
            sent_tokens = []
            received_tokens = []
            
            for change in balance_changes:
                owner = change.get("owner", {})
                if "AddressOwner" in owner and owner["AddressOwner"] == self.address:
                    coin_type = change.get("coinType", "Unknown").split("::")[-1]
                    amount_raw = int(change.get("amount", 0))
                    
                    decimals = 9
                    if coin_type.upper() in ["USDC", "USDT"]:
                        decimals = 6
                        
                    amount_adjusted = amount_raw / (10 ** decimals)
                    
                    if amount_adjusted < 0:
                        # If this token is just the gas fee deduction, ignore it to prevent Koinly from counting it twice
                        if coin_type.upper() == "SUI" and abs(amount_adjusted) == fee_amount:
                            continue
                        sent_tokens.append((abs(amount_adjusted), coin_type))
                    elif amount_adjusted > 0:
                        received_tokens.append((amount_adjusted, coin_type))

            # Grab the primary tokens
            sent_amount = ""
            sent_currency = ""
            if len(sent_tokens) > 0:
                sent_amount = sent_tokens[0][0]
                sent_currency = sent_tokens[0][1].upper()

            received_amount = ""
            received_currency = ""
            if len(received_tokens) > 0:
                received_amount = received_tokens[0][0]
                received_currency = received_tokens[0][1].upper()

            if sent_amount == "" and received_amount == "" and fee_amount == "":
                continue

            rows.append({
                "Date": timestamp,
                "Sent Amount": sent_amount,
                "Sent Currency": sent_currency,
                "Received Amount": received_amount,
                "Received Currency": received_currency,
                "Fee Amount": fee_amount,
                "Fee Currency": fee_currency,
                "Net Worth Amount": "",
                "Net Worth Currency": "",
                "Label": "",
                "Description": "Sui Tx",
                "TxHash": tx_hash
            })
            
        return rows

    def generate_csv(self):
        transactions = self.fetch_transactions()
        if not transactions:
            return

        rows = self.process_data(transactions)
        rows.sort(key=lambda x: x["Date"])
        
        output_file = f"sui_tax_report_{self.address[:6]}.csv"
        
        fieldnames = ["Date", "Sent Amount", "Sent Currency", "Received Amount", "Received Currency", "Fee Amount", "Fee Currency", "Net Worth Amount", "Net Worth Currency", "Label", "Description", "TxHash"]
        with open(output_file, mode='w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
        print(f"Sui tax report generated successfully: {output_file}")

if __name__ == "__main__":
    addr = "0x7ed98246c5dc12075b2f37af2bda7b2d50371b36124ae84644e971f0508c6de3"
    indexer = SuiIndexer(addr)
    indexer.generate_csv()
