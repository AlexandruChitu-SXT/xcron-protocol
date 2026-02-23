# Dev Update — Feb 22, 2025

Building in public 🔨

Today's XCron progress:

🔧 Bug Fix
→ Recurring tasks weren't rescheduling. Root cause: transfer_execute consumed all gas before reschedule logic could run. Moved reschedule BEFORE external calls. Now tasks chain: #17 → #18 → #19 ✅

⚡ Gas Optimization
→ Removed cross-contract call to KeeperRegistry (-15M gas)
→ Reduced internal fee transfer from 15M to 5M gas
→ Result: 55% less gas per execution

🧬 Hybrid Price Check (NEW)
→ Price conditions stored ON-CHAIN (auditable)
→ Prices fetched OFF-CHAIN via Binance/CoinGecko (0 gas)
→ Keeper only executes when condition is met
→ Full E2E: contract + keeper + price service

🔐 Security Audit
→ TTL expiry check added
→ ConditionOnChain blocked until Phase 2
→ Reward cap verified
→ Sensitive data scan: clean

All verified. Both builds passing. Pushed to main.

Tomorrow: Supernova-ready optimizations.

#MultiversX #BuildInPublic #XCron
