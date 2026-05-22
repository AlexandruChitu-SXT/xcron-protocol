# XCron Keeper Node: Hardware & Software Requirements

To guarantee the mathematical safety of the XCron protocol and ensure fast execution times, all Keeper Node operators MUST adhere to the following standards. Nodes failing to meet these standards risk producing invalid JSON payloads (causing transaction failures) or suffering Out-of-Memory (OOM) crashes, leading to protocol penalties (slashing).

## 1. Allowed AI Models & Quantization

XCron's CL-CRIB (Cryptographic Lock) architecture separates intent from execution, meaning the AI handles complex data payloads. To prevent logic degradation:
- **Mandatory Quantization Floor:** `Q8` (8-bit quantization).
- **Prohibited:** `Q4`, `Q2` or any sub-8-bit quantization is strictly forbidden due to unacceptable JSON schema hallucination rates and mathematical rounding errors.
- **Recommended Models:**
  - *Lightweight Tasks:* Qwen 2.5 / 3.5 (8B)
  - *Complex Strategies:* Qwen 3.5 / 3.6 (27B - 72B)

## 2. Minimum Hardware Tiers

### Tier 1: Lightweight Node (8B Models)
*   **VRAM:** 16 GB minimum (e.g., RTX 4060 Ti 16GB).
*   **Memory Bandwidth:** > 300 GB/s.

### Tier 2: High-Precision Node (27B+ Models)
*   **VRAM:** 48 GB minimum (e.g., 2x RTX 3090/4090).
*   **Memory Bandwidth:** > 900 GB/s combined.

*Note: VRAM requirements include a mandatory 30% overhead reserved exclusively for the KV Cache.*

## 3. Inference Engine (Software)

- **Mandatory Framework:** Keepers MUST run the model via `vLLM` (or a proven equivalent) with `PagedAttention` enabled.
- **Why:** PagedAttention prevents RAM fragmentation during concurrent intent evaluations, which is the leading cause of Out-of-Memory (OOM) crashes during peak network load.

## 4. Boot-time Validation

Every Keeper node will automatically run a degradation test (`test_json_degradation.py`) upon startup. This test forces the local LLM to solve a multi-step math problem and format it in a strict JSON schema. If the model fails the test (common with Q4/Q2 weights), the node will refuse to connect to the XCron network.
