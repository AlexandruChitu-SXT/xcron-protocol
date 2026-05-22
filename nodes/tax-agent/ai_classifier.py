import requests

class TaxAgentClassifier:
    """
    Connects to the local vLLM endpoint (Keeper Node) to classify
    unknown or complex DeFi transactions (e.g. MetaESDTs, Airdrops).
    """
    def __init__(self, endpoint="http://localhost:8000/v1/chat/completions", model="qwen-27b"):
        self.endpoint = endpoint
        self.model = model

    def classify_transaction(self, tx_data: dict) -> str:
        """
        Takes raw transaction data and asks the LLM to classify it 
        for tax purposes.
        """
        prompt = f"""
Analyze the following MultiversX transaction and classify it into one of the following tax categories:
[Income, Trade, Transfer, Stake, Airdrop, Unknown]

Transaction Data:
{tx_data}

Return ONLY the category name. No other text.
"""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a crypto tax classification agent."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0,
            "max_tokens": 10
        }

        try:
            # In a real environment, we'd call the LLM here.
            # response = requests.post(self.endpoint, json=payload, timeout=5)
            # return response.json()["choices"][0]["message"]["content"].strip()
            
            # For this prototype without a running vLLM, we return a mock value
            # based on simple heuristics
            func = tx_data.get("function", "")
            if "swap" in func.lower():
                return "Trade"
            elif "farm" in func.lower() or "stake" in func.lower():
                return "Stake"
            elif "claim" in func.lower():
                return "Income"
            else:
                return "Transfer"
                
        except Exception:
            return "Unknown"

if __name__ == "__main__":
    classifier = TaxAgentClassifier()
    res = classifier.classify_transaction({"function": "swapTokensFixedInput"})
    print(f"Test classification: {res}")
