import sys
import json
import urllib.request
import csv
from datetime import datetime

class MultiversXIndexer:
    def __init__(self, address: str):
        self.address = address
        self.api_url = "https://api.multiversx.com"

    def fetch_paginated(self, endpoint: str) -> list:
        print(f"Fetching {endpoint} for {self.address}...")
        all_items = []
        seen = set()
        size = 100
        before_ts = None
        import time

        while True:
            url = f"{self.api_url}/accounts/{self.address}/{endpoint}?size={size}"
            if before_ts is not None:
                url += f"&before={before_ts}"
                
            try:
                req = urllib.request.Request(url, headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=15) as response:
                    data = json.loads(response.read().decode())
                    if not data:
                        break
                    
                    new_items_found = False
                    for item in data:
                        item_str = json.dumps(item, sort_keys=True)
                        if item_str not in seen:
                            seen.add(item_str)
                            all_items.append(item)
                            new_items_found = True
                    
                    if not new_items_found:
                        break
                        
                    before_ts = data[-1].get("timestamp")
                    if len(all_items) % 1000 == 0:
                        print(f"  -> Fetched {len(all_items)} {endpoint}...")
                
                # Sleep between successful requests to avoid HTTP 429
                time.sleep(0.5)
                
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    print(f"Rate limited (HTTP 429). Backing off for 30s...")
                    time.sleep(30)
                else:
                    print(f"Error fetching data: {e}. Retrying in 5s...")
                    time.sleep(5)
                continue
        print(f"Finished {endpoint}. Total: {len(all_items)}")
        return all_items

    def process_data(self, transfers: list, transactions: list) -> list:
        tx_fees = {}
        for tx in transactions:
            hash = tx.get("txHash")
            fee_raw = float(tx.get("fee", 0))
            if tx.get("sender") == self.address:
                tx_fees[hash] = fee_raw / (10**18)
        
        rows = []
        for t in transfers:
            tx_hash = t.get("txHash")
            timestamp = datetime.fromtimestamp(t.get("timestamp", 0)).strftime('%Y-%m-%d %H:%M:%S UTC')
            sender = t.get("sender")
            receiver = t.get("receiver")
            type_transfer = t.get("type", "unknown")
            token = t.get("token", "EGLD")
            decimals = int(t.get("decimals", 18))

            value_raw = float(t.get("value", 0))
            value_adjusted = value_raw / (10 ** decimals)

            sent_amount = ""
            sent_currency = ""
            received_amount = ""
            received_currency = ""
            
            # Koinly strict rule: Do not put 0.0 in Amount columns
            if value_adjusted > 0:
                if sender == self.address:
                    sent_amount = value_adjusted
                    sent_currency = token
                elif receiver == self.address:
                    received_amount = value_adjusted
                    received_currency = token

            fee_amount = tx_fees.get(tx_hash, "")
            fee_currency = "EGLD" if fee_amount != "" else ""
            
            # If nothing was sent, received, or paid in fees, skip
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
                "Description": f"{type_transfer} Transfer",
                "TxHash": tx_hash
            })
            
        return rows

    def generate_csv(self):
        transfers = self.fetch_paginated("transfers")
        transactions = self.fetch_paginated("transactions")
        
        if not transfers:
            print("No transfers found.")
            return

        rows = self.process_data(transfers, transactions)
        rows.sort(key=lambda x: x["Date"])
        
        output_file = f"tax_report_{self.address[:8]}.csv"
        
        fieldnames = ["Date", "Sent Amount", "Sent Currency", "Received Amount", "Received Currency", "Fee Amount", "Fee Currency", "Net Worth Amount", "Net Worth Currency", "Label", "Description", "TxHash"]
        with open(output_file, mode='w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
        print(f"Tax report generated successfully: {output_file}")

if __name__ == "__main__":
    addr = "erd1xhg2fwxvg96ntjqlr233scfrwcgmrqsd7l8u3maymke5dectkn7slsmkw3"
    indexer = MultiversXIndexer(addr)
    indexer.generate_csv()
