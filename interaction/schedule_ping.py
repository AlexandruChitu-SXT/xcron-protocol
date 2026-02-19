#!/usr/bin/env python3
"""
XCron Protocol — Schedule ping tasks on Devnet
Target: ping contract → endpoint: ping
Purpose: verify the keeper executes tasks and rewards accumulate correctly.
"""

import subprocess, json, time, urllib.request

CHAIN = "D"
PROXY = "https://devnet-gateway.multiversx.com"
WALLET = "./wallets/deployer.pem"
SCHEDULER = "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh"
PING = "erd1qqqqqqqqqqqqqpgq85c5nze8vnrkcd3sr7cscclj7tmv6nxn7k8sa9cq2a"

DEPOSIT = "200000000000000000"   # 0.2 EGLD (covers gas + fee)
MAX_GAS = 5000000
MAX_RETRIES = 3
TTL_ROUNDS = 14400               # ~24h

def get_current_round():
    url = "https://devnet-api.multiversx.com/blocks?shard=1&size=1&fields=round"
    resp = urllib.request.urlopen(url, timeout=10)
    data = json.loads(resp.read())
    return data[0]["round"]

def bech32_to_hex(bech32_addr):
    CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    data = [CHARSET.index(c) for c in bech32_addr[4:]]
    acc, bits, result = 0, 0, []
    for d in data[:-6]:
        acc = (acc << 5) | d
        bits += 5
        while bits >= 8:
            bits -= 8
            result.append((acc >> bits) & 0xFF)
    return bytes(result).hex()

def make_time_once_trigger(target_round):
    return "00" + f"{target_round:016x}"

def schedule_ping_task(trigger_hex, label):
    ping_hex = bech32_to_hex(PING)
    cmd = [
        "mxpy", "contract", "call", SCHEDULER,
        "--pem", WALLET,
        "--gas-limit", "30000000",
        "--proxy", PROXY,
        "--chain", CHAIN,
        "--value", DEPOSIT,
        "--function", "scheduleTask",
        "--arguments",
        f"0x{ping_hex}",   # target_contract = ping
        "str:ping",        # target_endpoint = ping()
        "0x00000000",      # target_args (empty vec)
        f"0x{trigger_hex}", # trigger
        str(MAX_GAS),       # max_gas
        str(MAX_RETRIES),   # max_retries
        str(TTL_ROUNDS),    # ttl_rounds
        "--send",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    output = result.stdout + result.stderr
    tx_hash = None
    for line in output.split("\n"):
        if "hash" in line.lower():
            print(f"  {line.strip()}")
            # Try to extract hash
            import re
            m = re.search(r'[0-9a-f]{64}', line)
            if m:
                tx_hash = m.group(0)
    if result.returncode != 0:
        print(f"  ⚠ stderr: {result.stderr[:300]}")
    return result.returncode == 0, tx_hash

def main():
    print("Fetching current round...")
    current_round = get_current_round()

    print(f"═══════════════════════════════════════════════")
    print(f"  XCron — Schedule Ping Tasks for Rewards Demo")
    print(f"  Current round : {current_round}")
    print(f"  Target (ping) : {PING[:20]}...")
    print(f"  Deposit/task  : 0.2 EGLD")
    print(f"═══════════════════════════════════════════════")

    tasks = [
        (current_round + 5,  "ping-imm-1"),
        (current_round + 10, "ping-imm-2"),
        (current_round + 15, "ping-imm-3"),
    ]

    for i, (target_round, label) in enumerate(tasks):
        trigger = make_time_once_trigger(target_round)
        print(f"\n[{i+1}/{len(tasks)}] {label}: round {target_round}")
        ok, tx_hash = schedule_ping_task(trigger, label)
        if ok:
            print(f"  ✅ Scheduled!")
            if tx_hash:
                print(f"  → https://devnet-explorer.multiversx.com/transactions/{tx_hash}")
        else:
            print(f"  ❌ Failed")
        time.sleep(2)

    print(f"\n═══════════════════════════════════════════════")
    print(f"  ✅ Done! {len(tasks)} ping tasks scheduled.")
    print(f"  Start the keeper bot to execute them:")
    print(f"    cd keeper && npx ts-node src/index.ts")
    print(f"═══════════════════════════════════════════════")

if __name__ == "__main__":
    main()
