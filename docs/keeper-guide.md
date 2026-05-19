# Keeper Node Guide

Run a keeper node to earn EGLD by executing automated tasks on the XCron network.

## Requirements

- A MultiversX wallet with EGLD for the keeper bond
- Node.js 18+ installed
- A server that runs 24/7 (VPS recommended)

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/AlexandruChitu-SXT/xcron-keeper.git
cd xcron-keeper
npm install
```

### 2. Configure

Copy the example config and set your wallet path:

```bash
cp keeper-config.example.json keeper-config.json
```

Edit `keeper-config.json`:

```json
{
    "network": {
        "api": "https://api.multiversx.com",
        "chainId": "1"
    },
    "contracts": {
        "scheduler": "erd1qqq...",
        "keeperRegistry": "erd1qqq..."
    },
    "keeper": {
        "walletPem": "/path/to/your-keeper.pem",
        "pollIntervalMs": 6000
    }
}
```

### 3. Register as Keeper

Before running the bot, register on-chain by staking the minimum bond.

You can do this through the [XCron Dashboard](https://xcron.io/keeper) or via CLI:

```bash
mxpy contract call <REGISTRY_ADDRESS> \
    --pem /path/to/your.pem \
    --function "registerKeeper" \
    --value 1000000000000000000 \
    --gas-limit 15000000 \
    --proxy https://gateway.multiversx.com \
    --chain 1 --send
```

### 4. Start the Bot

```bash
npm start
```

The bot will:
1. Poll the Scheduler contract for ripe tasks (every 6 seconds)
2. Evaluate if a task is profitable to execute
3. Send the `executeTask` transaction
4. Collect the 70% keeper reward

## Monitoring

The bot logs all activity to stdout:

```
[2026-02-24 12:00:06] Scanning for ripe tasks...
[2026-02-24 12:00:06] Found 2 ripe tasks
[2026-02-24 12:00:07] Executing task #42 → erd1qqq...::claimRewards
[2026-02-24 12:00:13] [SUCCESS] Task #42 executed. Reward: 0.035 EGLD. TX: abc123...
```

## Economics

| Parameter | Value |
|-----------|-------|
| Minimum bond | 1 EGLD |
| Keeper reward | 70% of execution fee |
| Slash — Strike 1 | 5% of bond |
| Slash — Strike 2 | 15% of bond |
| Slash — Strike 3 | 20% of bond + auto-expulsion |
| Unstaking cooldown | 12 hours |
| Early exit penalty | 5% of bond (if < 30 days) |

## Task Assignment (Round-Robin)

Tasks are assigned to keepers in rotation. Each keeper gets a **30-second exclusive window** to execute their assigned task. If they don't execute in time, the task becomes available to any keeper.

This prevents gas wars and ensures fair distribution across all keepers.

## Reliability Tips

- Run on a VPS with 99.9% uptime
- Use a process manager (`pm2`, `systemd`) to auto-restart on crashes
- Monitor your keeper's on-chain stats via the Dashboard
- Keep enough EGLD in your wallet for gas fees

## Unstaking

To stop operating:

1. Call `requestUnstake` on the Keeper Registry
2. Wait 12 hours (cooldown period)
3. Call `withdrawStake` to receive your bond back

Early exit (< 30 days): 5% penalty on bond.
