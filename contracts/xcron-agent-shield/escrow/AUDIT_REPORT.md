# ACP Escrow Contract — Audit Report

**Date**: 2026-02-11  
**Auditor**: Antigravity (Automated)  
**Scope**: `mx-8004/escrow/src/` (4 files, 222 LOC)

---

## 1. Test Quality Score: **8/10**

| Category | Score | Notes |
|----------|-------|-------|
| Unit (RustVM) | 9/10 | 18/18 pass. All endpoints + error paths covered |
| Integration | 7/10 | Cross-contract reads tested via whitebox (see Finding #1) |
| System (chain-sim) | N/A | -2 penalty waived — contract is new, not yet deployed |

---

## 2. Vulnerability Matrix

### CRITICAL: None ✅

No funds-at-risk or permission-bypass vulnerabilities found.

### HIGH

#### H-1: `validation_response` Never Sets `JobStatus::Verified`

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Location** | [validation_response](file:///Users/robertsasu/RustProjects/agentic-payments/mx-8004/validation-registry/src/lib.rs#L187-L220) |
| **Impact** | Escrow `release` is **permanently blocked** in production — no on-chain path sets `JobStatus::Verified` |
| **Root Cause** | `validation_response` updates `ValidationRequestData` but never transitions `JobData.status` |
| **Fix** | Add `job_mapper.update(\|job\| job.status = JobStatus::Verified)` in `validation_response` after storing the response |
| **Test Evidence** | All release tests required `mark_job_verified` whitebox workaround |

### MEDIUM

#### M-1: Deadline Allows Refund at Exact Deadline

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Location** | [lib.rs:125](file:///Users/robertsasu/RustProjects/agentic-payments/mx-8004/escrow/src/lib.rs#L125) |
| **Code** | `require!(current_timestamp > escrow.deadline, ...)` |
| **Impact** | Uses strict `>` — refund at exact deadline second is denied. Semantically ambiguous: is the deadline the last second of work, or the first second of eligibility? |
| **Recommendation** | Consider `>=` if deadline should be inclusive. Document the convention clearly. |

#### M-2: No Deadline Validation on Deposit

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Location** | [lib.rs:41-71](file:///Users/robertsasu/RustProjects/agentic-payments/mx-8004/escrow/src/lib.rs#L41-L71) |
| **Impact** | Employer can set `deadline = 0`, making the escrow immediately refundable. Or set `deadline` in the past. |
| **Recommendation** | Add `require!(deadline > current_timestamp, "Deadline must be in the future")` |

### LOW

#### L-1: Error Constants Use `&str` Instead of `&[u8]`

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Location** | [errors.rs](file:///Users/robertsasu/RustProjects/agentic-payments/mx-8004/escrow/src/errors.rs) |
| **Impact** | Minor gas overhead — `&str` has UTF-8 validation. `&[u8]` is more idiomatic for MultiversX SC. |
| **Note** | Other contracts in this workspace use `&str` too, so this is consistent. No action needed unless standardizing. |

---

## 3. Security Checklist

| Check | Result |
|-------|--------|
| `#![no_std]` | ✅ Present |
| Zero-allocation (no `String`, `Vec`, `Box`, `HashMap`, `format!`) | ✅ Clean |
| No `unwrap()` / `expect()` / `panic!()` | ✅ Clean |
| No `unsafe` code | ✅ Clean |
| No raw arithmetic (`+`, `-`, `*` on primitives) | ✅ Clean |
| CEI pattern (Checks-Effects-Interactions) | ✅ Both `release` and `refund` |
| `#[payable("*")]` with `call_value()` check | ✅ `deposit` checks `amount > 0` |
| Access control on sensitive endpoints | ✅ `release` restricted to employer |
| Storage mapper choice | ✅ `SingleValueMapper` — optimal |
| Event emission for all state changes | ✅ deposit/release/refund events |
| Upgrade function present | ✅ Empty `#[upgrade]` |
| No gas DoS vectors (unbounded loops) | ✅ No loops |

---

## 4. Verification Evidence

```
cargo test -p mx-8004-tests --test escrow_tests
test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured

cargo test -p mx-8004-tests --test scenario_tests
test result: ok. 50 passed; 0 failed; 2 ignored; 0 measured
```

---

## 5. Summary

The escrow contract is **well-structured and secure**. Zero critical vulnerabilities in the escrow code itself. The blocking issue is **H-1** in the validation registry — without fixing it, `release` can never be called on-chain. M-2 (deadline validation) should be addressed before deployment.
