import sys
import json
import requests
import time

# Keeper node configuration
LOCAL_LLM_API = "http://localhost:8000/v1/chat/completions"

def run_degradation_test():
    print("Running JSON degradation test to ensure Q8+ quantization standard...")
    
    prompt = """
You are a strict financial validation node. You must calculate the outcome and return ONLY valid JSON.
Calculation:
Start with 1000 EGLD.
Subtract 2.5% fee.
Add 50 EGLD reward.
Divide by 3.

Return the result strictly in this schema:
{
  "status": "success",
  "data": {
    "final_balance": float,
    "is_valid": boolean
  }
}
No other text.
    """

    payload = {
        "model": "qwen-27b", # Replace with actual loaded model name
        "messages": [
            {"role": "system", "content": "You are a JSON-only financial calculator."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0,
        "max_tokens": 100
    }

    try:
        start_time = time.time()
        response = requests.post(LOCAL_LLM_API, json=payload, timeout=30)
        response.raise_for_status()
        end_time = time.time()
        
        content = response.json()["choices"][0]["message"]["content"]
        
        # Strip potential markdown blocks
        if content.startswith("```json"):
            content = content.strip("```json").strip("```")
            
        parsed = json.loads(content)
        
        expected_balance = ((1000 * 0.975) + 50) / 3
        
        if "final_balance" not in parsed["data"]:
            print("[FAIL] Missing 'final_balance' key in JSON. Likely Q4/Q2 degradation.")
            sys.exit(1)
            
        # Check precision
        diff = abs(parsed["data"]["final_balance"] - expected_balance)
        if diff > 0.01:
            print(f"[FAIL] Mathematical hallucination. Expected {expected_balance}, got {parsed['data']['final_balance']}")
            sys.exit(1)
            
        print(f"[PASS] JSON schema and mathematical reasoning intact (Latency: {end_time - start_time:.2f}s). Node safe to start.")
        sys.exit(0)
        
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Inference engine not reachable or timed out: {e}")
        print("Ensure vLLM with PagedAttention is running on port 8000.")
        sys.exit(1)
    except json.JSONDecodeError:
        print("[FAIL] Invalid JSON output generated. Quantization degradation detected (Likely Q2/Q4).")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Unknown error during degradation test: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_degradation_test()
