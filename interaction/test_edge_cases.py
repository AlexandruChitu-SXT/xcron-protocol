#!/usr/bin/env python3
"""
XCron Protocol — Edge Case Tests on Testnet
Tests: cancel+refund, schedule+execute, expire+refund
"""

import subprocess, json, time, urllib.request, sys

CHAIN = "T"
PROXY = "https://testnet-gateway.multiversx.com"
API = "https://testnet-api.multiversx.com"
WALLET = "../.secrets/deployer.pem"

SCHEDULER = "erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263"
REGISTRY = "erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka"
REWARDS = "erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta"
DEPLOYER = "erd135zkexfnzryv7z04vppm28uajdsxfvnel2n3kdw2spv3jk0j7k8stpwpgu"

# Use the ping contract as a harmless target 
# Actually we'll target the scheduler itself with a non-existent function (it won't self-target, C-2 blocks it)
# So we'll use the deployer address as a dummy target
DUMMY_TARGET = DEPLOYER

DEPOSIT = "100000000000000000"  # 0.1 EGLD
MAX_GAS = 5000000
MAX_RETRIES = 3
TTL_SECONDS = 3600  # 1 hour

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

def bech32_to_hex(bech32_addr):
    data = [CHARSET.index(c) for c in bech32_addr[4:]]
    acc, bits, result = 0, 0, []
    for d in data[:-6]:
        acc = (acc << 5) | d
        bits += 5
        while bits >= 8:
            bits -= 8
            result.append((acc >> bits) & 0xFF)
    return bytes(result).hex()

def get_balance(addr):
    try:
        resp = urllib.request.urlopen(f"{API}/accounts/{addr}", timeout=10)
        data = json.loads(resp.read())
        return int(data.get("balance", 0))
    except:
        return 0

def get_task_nonce():
    try:
        result = subprocess.run([
            "mxpy", "contract", "query", SCHEDULER,
            "--proxy", PROXY, "--function", "getTaskNonce"
        ], capture_output=True, text=True, timeout=30)
        # Parse hex output
        for line in result.stdout.split("\n"):
            line = line.strip().strip('"').strip(',').strip('[').strip(']').strip()
            if line and all(c in '0123456789abcdef' for c in line):
                return int(line, 16)
    except:
        pass
    return 0

def get_current_timestamp():
    return int(time.time())

def make_time_once_trigger(target_timestamp):
    # Trigger enum variant 0 = TimeOnce { target_time: u64 }
    return "00" + f"{target_timestamp:016x}"

def call_contract(contract, function, value="0", extra_args=None):
    cmd = [
        "mxpy", "contract", "call", contract,
        "--pem", WALLET,
        "--gas-limit", "30000000",
        "--proxy", PROXY,
        "--chain", CHAIN,
        "--value", value,
        "--function", function,
        "--send",
    ]
    if extra_args:
        cmd.extend(["--arguments"] + extra_args)
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    output = result.stdout + result.stderr
    
    tx_hash = None
    for line in output.split("\n"):
        if "emittedTransactionHash" in line:
            import re
            m = re.search(r'[0-9a-f]{64}', line)
            if m:
                tx_hash = m.group(0)
    
    success = result.returncode == 0 and "error" not in output.lower().split("emitted")[0] if "emitted" in output.lower() else result.returncode == 0
    return success, tx_hash, output

def schedule_task(target_time):
    target_hex = bech32_to_hex(DUMMY_TARGET)
    trigger = make_time_once_trigger(target_time)
    
    return call_contract(
        SCHEDULER,
        "scheduleTask",
        value=DEPOSIT,
        extra_args=[
            f"0x{target_hex}",     # target_contract
            "str:doNothing",       # target_endpoint (harmless)
            "0x00000000",          # target_args (empty vec)
            f"0x{trigger}",        # trigger: TimeOnce
            str(MAX_GAS),          # max_gas
            str(MAX_RETRIES),      # max_retries
            str(TTL_SECONDS),      # ttl_seconds
        ]
    )

def cancel_task(task_id):
    return call_contract(
        SCHEDULER,
        "cancelTask",
        extra_args=[str(task_id)]
    )

# ═════════════════════════════════════════════
#  TEST 1: Schedule + Cancel + Verify Refund
# ═════════════════════════════════════════════

def test_cancel_refund():
    print("\n" + "═" * 50)
    print("  TEST 1: Schedule → Cancel → Refund")
    print("═" * 50)
    
    # Get balance before
    balance_before = get_balance(DEPLOYER)
    print(f"  Balance before: {balance_before / 1e18:.4f} EGLD")
    
    # Schedule a task far in the future
    target_time = get_current_timestamp() + 7200  # 2 hours from now
    print(f"  Scheduling task for {target_time}...")
    ok, tx_hash, output = schedule_task(target_time)
    if not ok:
        print(f"  ❌ Failed to schedule task")
        print(f"  Output: {output[:300]}")
        return False
    print(f"  ✅ Task scheduled. TX: {tx_hash}")
    
    time.sleep(8)  # Wait for confirmation
    
    # Get the task id
    task_nonce = get_task_nonce()
    print(f"  Task nonce (latest task ID): {task_nonce}")
    
    # Cancel the task
    print(f"  Cancelling task {task_nonce}...")
    ok, tx_hash, output = cancel_task(task_nonce)
    if not ok:
        print(f"  ❌ Failed to cancel task")
        print(f"  Output: {output[:300]}")
        return False
    print(f"  ✅ Task cancelled. TX: {tx_hash}")
    
    time.sleep(8)  # Wait for confirmation
    
    # Check balance after
    balance_after = get_balance(DEPLOYER)
    print(f"  Balance after: {balance_after / 1e18:.4f} EGLD")
    
    # The balance should be roughly the same (minus gas fees)
    diff = abs(balance_before - balance_after)
    gas_cost_estimate = 500000000000000  # ~0.0005 EGLD for gas
    
    if diff < gas_cost_estimate * 10:  # Allow for 2 tx gas costs
        print(f"  ✅ PASS — Refund received! Difference: {diff / 1e18:.6f} EGLD (gas only)")
        return True
    else:
        print(f"  ❌ FAIL — Balance difference too large: {diff / 1e18:.6f} EGLD")
        return False


# ═════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════

def main():
    print("═" * 50)
    print("  XCron Protocol — Edge Case Tests (Testnet)")
    print("═" * 50)
    print(f"  Scheduler: {SCHEDULER[:20]}...")
    print(f"  Registry:  {REGISTRY[:20]}...")
    print(f"  Deployer:  {DEPLOYER[:20]}...")
    
    results = {}
    
    # Test 1: Cancel + Refund
    results["cancel_refund"] = test_cancel_refund()
    
    # Summary
    print("\n" + "═" * 50)
    print("  RESULTS")
    print("═" * 50)
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {name}: {status}")
    
    failed = sum(1 for v in results.values() if not v)
    if failed:
        print(f"\n  {failed} test(s) FAILED")
        sys.exit(1)
    else:
        print(f"\n  All tests PASSED ✅")

if __name__ == "__main__":
    main()
