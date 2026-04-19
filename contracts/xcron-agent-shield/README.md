# XCron Agent Shield (Institutional AI Security Standard)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MultiversX](https://img.shields.io/badge/Blockchain-MultiversX-blue.svg)](https://multiversx.com)

A protocol standard for **Institutional Autonomous Agents** on MultiversX. Three smart contracts provide identity, on-chain job validation, and mathematical Paranoia Vaults to secure agent treasuries against hallucination and prompt-injection attacks.

## Architecture

| Registry | Role |
|---|---|
| **Identity Registry** | Issues soulbound NFTs as agent identities. Stores metadata (name, URI, public key) in NFT attributes and mirrors service configs in contract storage for cross-contract reads. |
| **Validation Registry** | Records jobs, accepts proof submissions, and verifies completion via an oracle. Serves as the source of truth for employer-agent-job relationships. |
| **Reputation Registry** | Collects feedback gated by authorization and verified job completion. Cross-references both Identity and Validation registries to prevent Sybil attacks and frontrunning. |

## Protocol Flow

```mermaid
sequenceDiagram
    participant User as Employer (User)
    participant VAL as Validation Registry
    participant Agent as Autonomous Agent
    participant Validator as Validator
    participant REP as Reputation Registry

    User->>VAL: init_job(job_id, agent_id)
    Note over VAL: Records Employer & Time

    Agent->>VAL: submit_proof(job_id, proof_hash)
    Note over VAL: Pending Verification

    Agent->>VAL: validation_request(job_id, validator, uri, hash)
    Note over VAL: Validator Nominated

    Validator->>VAL: validation_response(hash, score, uri, hash, tag)
    Note over VAL: Job Verified

    User->>REP: submit_feedback(job_id, rating)
    Note over REP: Score Updated (CMA)
```

## Quick Start

```bash
git clone https://github.com/AlexandruChitu-SXT/xcron-protocol.git
cd xcron-protocol/contracts/xcron-agent-shield
chmod +x setup.sh && ./setup.sh
```

The setup script installs the WASM target, `sc-meta` (if missing), builds all contracts, and runs tests.

### Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Rust | 1.78+ | Yes |
| `wasm32-unknown-unknown` | — | Auto-installed by setup.sh |
| `multiversx-sc-meta` | latest | Auto-installed by setup.sh |
| Docker | — | For chain simulator tests |

### Make Commands

```bash
make build              # Build all contracts (sc-meta all build)
make test               # Run unit & scenario tests
make coverage           # Generate LCOV coverage report
make coverage-html      # Generate HTML coverage report
make coverage-summary   # Print coverage summary to terminal
```

### Chain Simulator

Requires Docker. Spins up a local MultiversX chain for integration testing.

```bash
make cs-install         # Install the chain simulator
make cs-start           # Start the simulator (background)
make cs-test            # Run chain simulator tests
make cs-stop            # Stop the simulator
```

### CI Pipelines

```bash
make ci                 # build + test + coverage
make ci-full            # build + test + coverage + chain simulator tests
```

## Project Structure

```
xcron-agent-shield/
  common/                  # Shared types and structs
  identity-registry/       # Identity NFT contract
  validation-registry/     # Job validation contract
  reputation-registry/     # Reputation scoring contract
  proxies/                 # Auto-generated contract proxies
  tests/                   # Integration & chain simulator tests
  docs/                    # Specification and plans
```

## Specification

See [docs/specification.md](docs/specification.md) for the full protocol specification.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
