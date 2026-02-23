# 🧵 Thread: XCron now supports price-based triggers — and no, it's not an oracle

---

**1/**
We just added conditional triggers to XCron.

Now your automated tasks can check market price before executing.

"Compound my rewards every day, BUT only if EGLD is above $25."

Here's how it works 👇

---

**2/**
XCron is NOT an oracle. We don't publish prices. We don't run price feeds.

Our keeper bots simply READ prices from existing sources — Binance, xExchange, CoinGecko — before deciding to execute your task.

Think of it as a smart alarm clock that checks the weather before waking you up.

---

**3/**
Why not build an on-chain oracle?

Because it would spam the network. Writing prices every 5 min = 288 useless transactions/day.

Our approach: 0 transactions until your condition is actually met. Only real actions hit the chain.

Better for the network. Better for validators. Better for everyone.

---

**4/**
"Is it reliable?"

We read from the same sources you check before trading. Binance, xExchange, CoinGecko.

If you trust those prices when you trade manually, you can trust them when XCron trades for you.

---

**5/**
"Can the keeper fake the price?"

Every keeper has EGLD staked as bond. If they misbehave → slashed, they lose money.

Every execution is recorded on-chain. You can verify what happened.

The incentive is to execute correctly, not to cheat.

---

**6/**
With Supernova, the full cycle takes less than 1 second:

→ Read price: 100ms
→ Check condition: 1ms
→ Execute on-chain: 600ms

An on-chain oracle? You'd wait 5-10 minutes for the next price update.

Sub-second conditional execution. Only on @MultiversX.

---

**7/**
This fits perfectly with @MultiversX's vision:

x402 → off-chain agents, on-chain payments
MCP → off-chain LLMs, on-chain actions
XCron → off-chain price checks, on-chain execution

Hybrid by design. Efficient by nature.

---

**8/**
XCron is still XCron. Automation protocol. Not an oracle.

We just taught the alarm clock to check the weather before ringing.

---

**9/**
Now let's talk speed. Real numbers, no hype.

Chainlink on Ethereum:
→ Price updates: every 1-5 minutes (heartbeat)
→ Block confirmation: 12 seconds
→ Worst case reaction: ~5 MINUTES

XCron on @MultiversX:
→ Price check: every 1-6 seconds (keeper poll)
→ Block confirmation: 6 seconds
→ Worst case reaction: ~12 SECONDS

---

**10/**
That's not a small difference. It's 25x faster.

For a stop-loss: Chainlink could cost you 5 minutes of price movement. In crypto, that can be 5-10% of your position.

XCron reacts in seconds. Not minutes. Seconds.

---

**11/**
And with Supernova? Block time drops to sub-second.

XCron's worst case goes from 12 seconds to ~2 seconds.

We can't promise sub-second reaction (yet). But we can promise: **seconds vs minutes.** That's real, that's verified, and that's a math problem anyone can check.

---

**12/**
Summary:

✅ Hybrid price checks — $0 cost
✅ No network spam — only real actions
✅ 25x faster reaction than Chainlink
✅ Built for @MultiversX's Agent Economy
✅ Supernova makes it even faster

Phase 2: price-based triggers
Phase 3: on-chain verification via xExchange pools

Building step by step. #XCron #MultiversX #DeFi
