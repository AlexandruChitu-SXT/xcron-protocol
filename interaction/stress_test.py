#!/usr/bin/env python3
"""
XCron Protocol — Stress Test: Schedule 22 tasks on Devnet
Mix: 18 TimeOnce + 4 TimeRecurring
"""

import subprocess, json, time

CHAIN = "D"
PROXY = "https://devnet-gateway.multiversx.com"
WALLET = "./wallets/deployer.pem"
SCHEDULER = "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh"
REWARDS = "erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt"

DEPOSIT = "100000000000000000"   # 0.1 EGLD
MAX_GAS = 5000000
MAX_RETRIES = 1
TTL_ROUNDS = 14400

import urllib.request

def get_current_round():
    url = "https://devnet-api.multiversx.com/blocks?shard=1&size=1&fields=round"
    resp = urllib.request.urlopen(url)
    data = json.loads(resp.read())
    return data[0]["round"]

def bech32_to_hex(bech32_addr):
    """Convert erd1... to hex using the bech32 algorithm."""
    CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    data = []
    for c in bech32_addr[4:]:  # skip 'erd1'
        data.append(CHARSET.index(c))
    # Convert 5-bit groups to 8-bit
    acc = 0
    bits = 0
    result = []
    for d in data[:-6]:  # skip checksum
        acc = (acc << 5) | d
        bits += 5
        while bits >= 8:
            bits -= 8
            result.append((acc >> bits) & 0xFF)
    return bytes(result).hex()

def schedule_task(target_hex, trigger_hex, label):
    """Call mxpy contract call with the scheduleTask endpoint."""
    cmd = [
        "mxpy", "contract", "call", SCHEDULER,
        "--pem", WALLET,
        "--gas-limit", "30000000",
        "--proxy", PROXY,
        "--chain", CHAIN,
        "--value", DEPOSIT,
        "--function", "scheduleTask",
        "--arguments",
        f"0x{target_hex}",       # target_contract
        "str:getTreasuryBalance", # target_endpoint
        "0x00000000",             # target_args (empty vec)
        f"0x{trigger_hex}",      # trigger
        str(MAX_GAS),             # max_gas
        str(MAX_RETRIES),         # max_retries
        str(TTL_ROUNDS),          # ttl_rounds
        "--send",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    output = result.stdout + result.stderr
    # Look for hash
    for line in output.split("\n"):
        if "hash" in line.lower() or "emitted" in line.lower():
            print(f"  {line.strip()}")
    if result.returncode != 0 and "error" in output.lower():
        print(f"  ⚠ Error: {output[:200]}")
    return result.returncode == 0

def make_time_once_trigger(target_round):
    return "00" + f"{target_round:016x}"

def make_time_recurring_trigger(start_round, interval, remaining):
    return "01" + f"{start_round:016x}" + f"{interval:016x}" + f"{remaining:016x}"

def main():
    current_round = get_current_round()
    target_hex = bech32_to_hex(REWARDS)
    
    print(f"═══════════════════════════════════════════════")
    print(f"  XCron Stress Test — 22 Tasks")
    print(f"  Current round: {current_round}")
    print(f"  Target contract: {REWARDS[:20]}...")
    print(f"═══════════════════════════════════════════════")
    print()
    
    count = 0
    
    # Batch 1: 6 immediate tasks (+5 to +10)
    print("📦 Batch 1: 6 immediate TimeOnce tasks")
    for offset in range(5, 11):
        trigger = make_time_once_trigger(current_round + offset)
        label = f"once-imm-{offset}"
        print(f"  [{count+1}/22] {label}: round {current_round + offset}")
        schedule_task(target_hex, trigger, label)
        count += 1
        time.sleep(1)
    
    # Batch 2: 6 near-future tasks (+15 to +20)
    print("\n📦 Batch 2: 6 near-future TimeOnce tasks")
    for offset in range(15, 21):
        trigger = make_time_once_trigger(current_round + offset)
        label = f"once-1m-{offset}"
        print(f"  [{count+1}/22] {label}: round {current_round + offset}")
        schedule_task(target_hex, trigger, label)
        count += 1
        time.sleep(1)
    
    # Batch 3: 6 medium-future tasks (+25 to +30)
    print("\n📦 Batch 3: 6 medium-future TimeOnce tasks")
    for offset in range(25, 31):
        trigger = make_time_once_trigger(current_round + offset)
        label = f"once-2m-{offset}"
        print(f"  [{count+1}/22] {label}: round {current_round + offset}")
        schedule_task(target_hex, trigger, label)
        count += 1
        time.sleep(1)
    
    # Batch 4: 4 TimeRecurring tasks
    print("\n📦 Batch 4: 4 TimeRecurring tasks")
    recurring_configs = [
        (8, 5, 3, "recur-fast"),      # every 5 rounds, 3 execs
        (12, 10, 3, "recur-medium"),   # every 10 rounds, 3 execs
        (20, 15, 2, "recur-slow"),     # every 15 rounds, 2 execs
        (6, 3, 5, "recur-rapid"),      # every 3 rounds, 5 execs
    ]
    for offset, interval, remaining, label in recurring_configs:
        trigger = make_time_recurring_trigger(current_round + offset, interval, remaining)
        print(f"  [{count+1}/22] {label}: start={current_round + offset}, every {interval} rounds, {remaining}x")
        schedule_task(target_hex, trigger, label)
        count += 1
        time.sleep(1)
    
    print()
    print(f"═══════════════════════════════════════════════")
    print(f"  ✅ All {count} tasks scheduled!")
    print(f"  Monitor keeper bot logs for execution.")
    print(f"═══════════════════════════════════════════════")

if __name__ == "__main__":
    main()
