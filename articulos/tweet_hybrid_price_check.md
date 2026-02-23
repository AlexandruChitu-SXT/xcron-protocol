# Tweet: Hybrid Price Check — XCron Protocol

We just shipped hybrid price triggers for XCron 🧬

Here's how it works:
→ Users store price conditions ON-CHAIN (auditable, transparent)
→ Keepers check prices OFF-CHAIN via Binance/CoinGecko (0 gas cost)
→ Execution ONLY happens when the condition is met

Why hybrid?
• Full oracles cost 50-100M gas PER price check
• Our approach: 0 gas until execution
• Conditions are on-chain = anyone can audit them
• Prices are off-chain = free, fast, multi-source

Example: "Execute my DeFi rebalance when EGLD > $50"
The keeper watches the price for free. The moment it hits $50 → executes on-chain.

Built for Supernova speed. When blocks go sub-second, our keepers will react in real-time.

This is what infrastructure looks like. Not another oracle. A smarter one.

#MultiversX #XCron #DeFi #Supernova
