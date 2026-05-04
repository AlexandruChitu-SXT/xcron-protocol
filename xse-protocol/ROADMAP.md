# Development Roadmap

This roadmap defines the path from the current architectural prototype to a production-ready, institution-grade execution layer for Fluxa and the MultiversX ecosystem.

## Phase 1: The Boundary (Current Phase)
- [x] Define Execution Intent JSON Schema.
- [x] Define Execution Receipt JSON Schema.
- [x] Create Security Assumptions Document.
- [x] Create Threat Model.
- [ ] Build Dry-Run CLI parser in Rust.
- [ ] Implement strict unit tests for validation (expired intent, slippage violation, etc.).

## Phase 2: Simulation & Testnet
- [ ] Implement simulated exchange backend for full dry-run CI testing.
- [ ] Integrate Binance Testnet API (using testnet API keys).
- [ ] Implement real HMAC signing inside the Rust worker for the Testnet.
- [ ] Build partial-fill and error handling logic.

## Phase 3: The Enclave Reality
- [ ] Dockerize the Rust worker for AWS Nitro Enclaves.
- [ ] Build the Nitro Enclave Image (EIF) and publish the PCR0 hash.
- [ ] Implement KMS/Attestation logic to securely provision the RSA private key into the enclave on boot.

## Phase 4: MultiversX On-Chain Rails
- [ ] Deploy the XSE Authorizer Smart Contract on Devnet.
- [ ] Link Execution Intents to On-Chain hashes for auditability.
- [ ] Build the Relayer logic to trigger the enclave based on a Smart Contract event.

## Phase 5: Production & Fluxa Adapter
- [ ] Full security audit of the Rust execution worker.
- [ ] Build the API adapter for Fluxa to seamlessly submit Intents and reconcile Receipts.
- [ ] Launch Restricted Live Mode (whitelisted users only).
