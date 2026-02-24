# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Async callbacks** — Keepers only paid on confirmed target execution success
- **On-chain oracle** — `ConditionOnChain` triggers query xExchange pair contracts directly
- **Round-robin task assignment** — Fair distribution with 30-second exclusive grace period
- **Progressive slashing** — Strike 1: 5%, Strike 2: 15%, Strike 3: 20% + auto-expulsion
- **Early exit penalty** — 5% stake penalty if keeper unstakes before 30 days
- **Stuck task recovery** — `recoverStuckTask` endpoint for tasks stuck in Executing > 24h
- **`consecutiveFailures`** tracking in KeeperInfo struct
- **SDK `ConditionOnChain` encoding** — Full trigger encoding for oracle-based tasks
- **LICENSE** — MIT license file
- **Scenario tests** — `recover_stuck_task`, `round_robin_assignment`

### Changed
- `executeTask` now uses `register_promise` + `execution_callback` instead of `transfer_execute`
- `recordExecution` now applies progressive slashing on failure
- `withdrawStake` now checks for early exit penalty
- Frontend contract addresses synced with deployed contracts
- SDK devnet addresses filled (keeperRegistry, rewards)
- `start.sh` updated (keeper bot now in private repo)
- All documentation updated to reflect current features

### Removed
- 120+ junk files (old deploy scripts, tweets, logs, Gemini metadata)
- `xcron/`, `interaction/`, `articulos/` directories
- Old `contracts/src/lib.rs` duplicate

## [1.0.0] — 2026-02-18

### Added
- Initial release: Scheduler, KeeperRegistry, Rewards contracts
- Frontend dashboard with real-time prices
- Keeper bot with intelligent execution
- TypeScript SDK
- Deployed on MultiversX Devnet
- E2E flow: scheduleTask → keeper detects → executeTask → rewards distributed
