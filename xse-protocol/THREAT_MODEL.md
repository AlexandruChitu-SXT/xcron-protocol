# XSE Threat Model

This document outlines potential adversarial scenarios, the attack vectors, and the mitigations implemented or planned within XSE.

## 1. Malicious User / Malicious Calling App
- **Threat:** A compromised calling app (e.g., Fluxa) or malicious user attempts to execute an order that drains the account via illiquid market manipulation or massive slippage.
- **Mitigation:** The `execution_intent.schema.json` strictly enforces `max_slippage_pct` and `allowed_assets`. The enclave will reject the execution if the market price drifts beyond the allowed slippage or if the asset is not whitelisted. The user must authorize the intent limits before execution.

## 2. Compromised API Key Interception (MITM)
- **Threat:** An attacker intercepts the network traffic containing the Execution Intent and API keys.
- **Mitigation:** The API keys are encrypted client-side using XSE's RSA-4096 Public Key. Even if intercepted, the cipher text can only be decrypted inside the isolated enclave memory.

## 3. Replay Attack
- **Threat:** An attacker intercepts a valid, signed Execution Intent and resubmits it multiple times to drain funds via repeated trades.
- **Mitigation:** The enclave enforces idempotency using the `client_reference_id` and strictly checks the `expires_at` timestamp. Once an ID is processed or the time expires, the request is permanently dropped.

## 4. Enclave Spoofing
- **Threat:** An attacker sets up a fake server pretending to be the XSE Enclave to trick the client into sending the encrypted API keys.
- **Mitigation:** The client must verify the Enclave's Attestation Document (signed by AWS) and verify the PCR hashes match the expected open-source build hashes of the XSE worker. If the hashes don't match, the client aborts.

## 5. Stale Intent / Bad Price Data
- **Threat:** The intent is valid, but the execution happens during extreme market volatility, filling the order at a terrible price.
- **Mitigation:** XSE queries the live order book *before* executing. If the calculated slippage for the requested `max_quote_amount` exceeds `max_slippage_pct`, the enclave aborts and returns a `REJECTED_BY_CONSTRAINTS` status in the receipt.

## 6. Malicious Executor (Host Node Compromise)
- **Threat:** The AWS EC2 instance hosting the Enclave is compromised by a rootkit.
- **Mitigation:** Nitro Enclaves have no persistent storage, no interactive access, and no external networking (except via local vsock to the host). The host cannot peek into the enclave memory or extract the decrypted API keys.
