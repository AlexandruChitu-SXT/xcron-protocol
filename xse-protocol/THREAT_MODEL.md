# XCron Protocol Threat Model & Security Framework (v2.0 - Lazarus-Grade Hardened)

This document outlines the potential adversarial scenarios, attack vectors, and specific security controls implemented or planned within XCron Protocol (including the Scheduler smart contract, the XWAP Oracle, and the XSE Sovereign Enclave).

---

## 📊 Summary Matrix of Threats & Mitigations

| Ref | Threat Description | Vector Class | Severity | Key Mitigation | Code / Architecture Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-1** | Malicious calling app attempts to execute trade with massive slippage. | Application | High | Enclave enforces `max_slippage_pct` limits. | `xse-protocol/schemas/execution_intent.schema.json` |
| **T-2** | Compromised API key interception via MITM during transmission. | Network | High | Client-side encryption using Enclave's RSA-4096 public key. | Enclave volatile RAM decrypt module |
| **T-3** | Replay of signed Execution Intents to drain user funds. | Protocol | Medium | Idempotency verification via `client_reference_id` + `expires_at`. | `xse-protocol/src/intents.rs` |
| **T-4** | Fake Enclave server intercepts encrypted API keys (Enclave Spoofing). | Infrastructure | High | Client verifies AWS cryptographic attestation + PCR hashes. | Enclave setup module |
| **T-5** | Execution during extreme price volatility (Stale intent). | Market | Medium | Enclave order book query before execution + slippage checks. | Enclave execution client |
| **T-6** | Host node compromise (Rootkit on EC2 parent instance). | Infrastructure | High | AWS Nitro Enclaves isolate CPU/RAM from the parent instance. | AWS Nitro hypervisor architecture |
| **T-7** | State Bloat via massive ML-DSA signatures (~2.5 KB). | Resource | Medium | Transient VM precompile verification; store only 32-byte SHA-256. | `contracts/scheduler/src/execution.rs` |
| **T-8** | CPU-level side-channel vulnerabilities (Spectre, Meltdown, SGX-LVI). | Physical | High | Heterogeneous Multi-Sig (2-of-3 Keepers across Intel, AMD, AWS). | Multi-enclave consensus layer |
| **T-9** | Timing attacks on NTT post-quantum verification. | Cryptographic | High | Constant-Time Execution in precompiled NTT polynomial operations. | VM Precompile engine |
| **T-10** | Supply chain compromise of Rust crates or Enclave Docker image. | Supply Chain | High | Reproducible builds, signed Docker images, SBOM, runtime PCR audit. | CI/CD pipeline |
| **T-11** | Compromised local observer node (127.0.0.1) injecting fake events. | Infrastructure | Medium | Cryptographic verification of block headers + redundant observers. | `xcron-keeper-rs/src/main.rs` |
| **T-12** | Harvest Now, Decrypt Later (HNDL) quantum threat against RSA-4096. | Cryptographic | Medium | Planned migration to hybrid post-quantum key encryption (ML-KEM + RSA). | Roadmap Phase 2 |
| **T-13** | MEV and Front-running of CL-CRIB secrets in the public mempool. | Protocol | High | Secret reveal executed within Enclave; Keeper broadcasts signed output. | `contracts/scheduler/src/commit_reveal.rs` |
| **T-14** | Async Reentrancy on cross-shard callbacks in Supernova (0.6s blocks). | Protocol | High | Strict Checks-Effects-Interactions + reentrancy guards + take mappers. | `contracts/scheduler/src/execution.rs#L213-L233` |

---

## 🔒 Detailed Threat Profiles & Mitigations

### 1. Application-Level Threats

#### T-1: Malicious Calling App / Market Manipulation
*   **Threat:** A compromised calling app (e.g., Fluxa) or malicious user attempts to execute an order that drains the account via illiquid market manipulation or massive slippage.
*   **Mitigation:** The `execution_intent.schema.json` strictly enforces `max_slippage_pct` and `allowed_assets`. The enclave will reject the execution if the market price drifts beyond the allowed slippage or if the asset is not whitelisted. The user must authorize the intent limits before execution.

#### T-14: Async Reentrancy on Cross-Shard Callbacks (Supernova Blocks)
*   **Threat:** With Supernova's fast blocks (600ms) and multi-block cross-shard callbacks, a malicious target contract could invoke reentrant calls back into the Scheduler while the user's gas deposit is in escrow, attempting to trigger a double refund.
*   **Mitigation:** 
    1.  **Checks-Effects-Interactions:** The Scheduler updates the task state to `Executing` (storing the execution block timestamp) *before* triggering the promise call (`dispatch_task_execution`).
    2.  **Pull-Payment Model:** Refunds are never pushed directly during execution. Instead, they are accumulated inside the `claimable_refunds` storage mapper, which must be claimed manually via the `claim_refund` endpoint.
    3.  **Take Pattern:** The `claim_refund` endpoint utilizes the `.take()` method, which sets the caller's refund balance to zero *before* transferring the EGLD. This renders reentrancy mathematically impossible.

---

### 2. Cryptographic & Protocol Threats

#### T-2: Compromised API Key Interception (MITM)
*   **Threat:** An attacker intercepts the network traffic containing the Execution Intent and API keys.
*   **Mitigation:** The API keys are encrypted client-side using XSE's RSA-4096 Public Key. Even if intercepted, the cipher text can only be decrypted inside the isolated enclave memory.

#### T-3: Replay Attack
*   **Threat:** An attacker intercepts a valid, signed Execution Intent and resubmits it multiple times to drain funds via repeated trades.
*   **Mitigation:** The enclave enforces idempotency using the `client_reference_id` and strictly checks the `expires_at` timestamp. Once an ID is processed or the time expires, the request is permanently dropped.

#### T-7: State Bloat & Resource Exhaustion (Post-Quantum Signatures)
*   **Threat:** An attacker floods the network with massive post-quantum signatures (e.g., ML-DSA ~2.5 KB) to trigger disk space exhaustion on validator nodes or saturate network bandwidth.
*   **Mitigation:** The signature is treated as a transient transaction argument. The VM precompile validates it on-the-fly in volatile RAM, discarding the 2.5 KB payload immediately. The contract only writes a 32-byte hash (SHA-256) to the persistent Trie, keeping the storage footprint identical to legacy elliptic curves. Bandwidth exhaustion is mitigated by charging a transaction fee per byte of transaction payload (1,500 gas/byte).

#### T-9: Timing Attacks on NTT Post-Quantum Verification
*   **Threat:** An attacker measures microsecond deviations in the signature verification time to mathematically deduce the private key coefficients.
*   **Mitigation:** The precompile implements polynomial multiplication and Number Theoretic Transforms (NTT) strictly in constant-time (Constant-Time Execution). The instruction path and CPU latency do not vary based on secret key parameters.

#### T-12: Harvest Now, Decrypt Later (HNDL) Quantum Threat
*   **Threat:** Adversaries intercept and store encrypted RSA-4096 client payloads today, intending to decrypt them in the future when a cryptographically relevant quantum computer (CRQC) becomes available.
*   **Mitigation:** We plan a transition to hybrid post-quantum key exchange (ML-KEM-1024 + RSA-4096) for all client-enclave communication, ensuring that even if RSA is broken in the future, the reticular security of ML-KEM prevents decryption.

#### T-13: Front-Running of CL-CRIB Secrets in the Mempool
*   **Threat:** When a Keeper reveals the 32-byte secret to unlock a `QuantumSealedHash` task, a front-running bot (or malicious Keeper) scans the mempool, extracts the secret, and broadcasts the same execution transaction with a higher gas price to steal the reward.
*   **Mitigation:** 
    1.  **Enclave-bound Secret Reveal:** The secret is never sent in plaintext over the public mempool. Instead, the Keeper inputs the secret into the local Enclave. The Enclave verifies the task off-chain, signs a cryptographic confirmation using its enclave key, and only the signed attestation is broadcast.
    2.  **Round-Robin Period:** During the first 30 seconds after a task becomes ripe, only the assigned Keeper's signature is accepted by the Scheduler. Even if a bot attempts to front-run the transaction, the contract rejects it if the sender address is not the assigned Keeper.

---

### 3. Infrastructure & Physical Threats

#### T-4: Enclave Spoofing
*   **Threat:** An attacker sets up a fake server pretending to be the XSE Enclave to trick the client into sending the encrypted API keys.
*   **Mitigation:** The client must verify the Enclave's Attestation Document (signed by AWS) and verify the PCR hashes match the expected open-source build hashes of the XSE worker. If the hashes don't match, the client aborts.

#### T-6: Host Node Compromise (Rootkit on EC2)
*   **Threat:** The AWS EC2 instance hosting the Enclave is compromised by a rootkit.
*   **Mitigation:** Nitro Enclaves have no persistent storage, no interactive access, and no external networking (except via local vsock to the host). The host cannot peek into the enclave memory or extract the decrypted API keys.

#### T-8: CPU-Level Side-Channel Vulnerabilities & Microcode Leaks (Lazarus-Class APTs)
*   **Threat:** A highly sophisticated state-sponsored threat group (e.g., Lazarus Group) exploits CPU-level hardware bugs (e.g., Spectre, Meltdown, SGX-LVI, Æpic Leak) to bypass memory isolation and dump active enclave RAM, extracting decrypted private keys or user credentials.
*   **Mitigation:** Heterogeneous Multi-Signature Consensus. Verification requires a quorum (e.g., 2-out-of-3) of Keepers running on different CPU microcode and cloud architectures (Intel SGX, AMD SEV, AWS Nitro Enclaves). A hardware-level exploit on a single chip family cannot compromise the overall protocol. All private keys inside the enclaves are strictly ephemeral, with active memory zeroization (RAM scrubbing) immediately after execution.

#### T-11: Compromised Local Observer Node
*   **Threat:** A hacker compromises the local loopback Observer node (`127.0.0.1:8080`) to feed false block event triggers or alter gas estimations to cause transaction failures.
*   **Mitigation:** The Keeper Bot cryptographically verifies block headers against public RPC endpoints at random intervals. Furthermore, keepers run cross-shard verification by querying multiple independent observers before committing to an execution path.

---

### 4. Supply Chain Threats

#### T-10: Build Pipeline & Dependency Compromise
*   **Threat:** Malicious crates are injected into the Rust dependency tree (crates.io) or the Docker image build pipeline to leak decrypted keys prior to memory zeroization.
*   **Mitigation:** 
    1.  **Reproducible Builds:** The enclave image is built deterministically. The client compares the running enclave's PCR0 measurement hash against the published open-source build hash.
    2.  **Lockfile Pinning & Auditing:** All Rust crates are strictly pinned in `Cargo.lock` and audited using `cargo-deny` and `cargo-audit` to detect known vulnerabilities and supply chain manipulation.
    3.  **Software Bill of Materials (SBOM):** Automatic generation and signing of SBOM for every release.
