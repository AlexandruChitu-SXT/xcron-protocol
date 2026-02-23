# Tweet: Gas Optimization (UPDATED — verified on testnet)

Just optimized XCron's Scheduler contract. Here's what we did and why:

We found that recurring tasks weren't re-scheduling after execution. The reason? Our transfer_execute calls were consuming all remaining gas before the reschedule logic could run.

The fix:
→ Moved reschedule logic BEFORE external calls (storage ops cost ~5M gas, external calls eat everything)
→ Removed a cross-contract call to KeeperRegistry — replaced with on-chain events (saved 15M gas per execution)
→ Reduced gas for internal protocol fee transfer from 15M to 5M

Result: ~55% less gas per task execution.

Recurring tasks now chain automatically: Task #17 → executed → created #18 → executed → created #19. Verified on testnet.

Sometimes the best optimization is just putting things in the right order.

Contract upgraded. Keeper running in daemon mode. #XCron #MultiversX
