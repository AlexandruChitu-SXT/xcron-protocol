# 🧵 Thread: Why XCron uses a hybrid price oracle — and why it's BETTER

---

**1/**
Everyone asks: "How will XCron handle price-based triggers? You need an oracle."

We thought about it. And we decided NOT to build an on-chain oracle.

Here's why 👇

---

**2/**
A traditional on-chain oracle writes prices to the blockchain every few minutes.

That's 288 transactions/day. Just to update prices. Even when nobody needs them.

On @MultiversX, that gas isn't expensive — but it's still wasted resources for the network.

---

**3/**
XCron takes a different approach: hybrid.

Our keeper bots read prices from Binance, xExchange, and CoinGecko — off-chain, in real time, for free.

When a condition is met (e.g., EGLD drops below $25), THEN the keeper executes the task on-chain.

Zero unnecessary transactions. Only real actions.

---

**4/**
"But isn't off-chain less trustworthy?"

Our keepers have skin in the game:
- They stake EGLD as bond
- If they cheat, they get slashed (lose 10% of their bond)
- Every execution is logged on-chain with the price sources

You can verify what happened after the fact.

---

**5/**
With Supernova, this gets even better:

- Keeper reads price: ~100ms
- Evaluates condition: ~1ms
- Executes on-chain: ~600ms (sub-second finality)

Total: **less than 1 second** from condition met to execution.

An on-chain oracle? You'd wait 5-10 minutes for the next price update. Then another block for execution.

---

**6/**
This isn't new. @MultiversX is building its entire Agent Economy on hybrid principles:

- x402: off-chain agents, on-chain payments
- MCP: off-chain LLMs, on-chain interactions
- ACP: off-chain commerce, on-chain settlement

XCron follows the same philosophy. Off-chain intelligence, on-chain execution.

---

**7/**
What does this save the ecosystem?

✅ No spam transactions just to update prices
✅ Network resources used only for real user actions
✅ Faster execution than any on-chain oracle
✅ $0 cost for price monitoring

The network stays clean. Validators process what matters.

---

**8/**
Phase 2: Hybrid price checks (keeper reads APIs)
Phase 3: Optional on-chain verification against xExchange pools

We start lean. We add verification when adoption demands it.

Honest. Efficient. Built for @MultiversX.

#XCron #MultiversX #DeFi #Supernova
