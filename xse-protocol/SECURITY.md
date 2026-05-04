# Security Architecture & Threat Model

This document provides a technical assessment of the security architecture implemented in the XCron Sovereign Enclaves (XSE) protocol. Our methodology rejects security through obscurity in favor of verifiable cryptographic isolation. 

The XSE protocol is designed to achieve deterministic, confidential execution of cross-chain and off-chain routing without introducing trusted human intermediaries.

## 1. Hardware-Level Isolation and Memory Safety

Traditional Trusted Execution Environments (TEEs), such as Intel SGX, have historically demonstrated susceptibility to side-channel vulnerabilities, including Foreshadow and SGAxe, where hypervisor-level or physical access could allow adversaries to monitor CPU voltage or thermal fluctuations to extract volatile memory states.

To mitigate this attack surface, XSE is explicitly architected for AWS Nitro Enclaves. Unlike process-level isolation, the Nitro architecture utilizes dedicated, physically isolated virtual CPUs and memory segments. There is no persistent storage, no interactive access (SSH is disabled at the hypervisor level), and network routing is strictly restricted. The cryptographic payload (such as an exchange API key) exists in plaintext exclusively within this volatile, isolated RAM for the exact duration of the execution cycle (typically under 30 milliseconds) before being zeroed out.

## 2. Transport Layer Security and Interception Prevention

The enclave is required to communicate with external endpoints to execute authorized routing commands. This introduces the risk of Man-In-The-Middle (MITM) attacks via DNS hijacking or malicious proxies.

The Rust execution binary addresses this by enforcing strict Certificate Pinning at the transport layer via the `rustls` library. The expected SSL/TLS certificate chains for whitelisted destinations are statically compiled into the enclave binary. Any deviation in the certificate chain during the TLS handshake immediately terminates the connection, ensuring that sensitive payloads cannot be extracted by malicious network infrastructure.

## 3. Cryptographic Attestation and Hash Verification

A critical concern in decentralized infrastructure is verifying the integrity of the off-chain compute environment. Users encrypting sensitive payloads must be mathematically certain that the receiving public key belongs to the uncompromised XSE code, rather than a rogue node operator.

This is solved through Hardware Cryptographic Attestation. The AWS Nitro hypervisor generates a cryptographic attestation document, signed by Amazon's root certificate authority. This document contains the exact SHA-384 hash measurement of the Rust binary loaded into the enclave. The MultiversX smart contracts are designed to verify this attestation on-chain before authorizing any operational data transfer. If the underlying code is modified in any way, the hash measurement changes, and the protocol automatically halts execution.

## 4. Operational Principles of Least Privilege

To further limit potential fallout from user-side misconfiguration, the protocol enforces strict operational bounds.

Users integrating with XSE are required to apply the principle of least privilege to any credentials provided to the enclave. Specifically, API keys must be strictly limited to trading permissions, with all withdrawal capabilities disabled at the exchange level. Furthermore, IP whitelisting must be enforced, restricting the execution of the credentials solely to the static, audited IP address of the XSE node. This dual-layer approach ensures that even in the event of an unforeseen theoretical breach, the maximum potential impact is structurally minimized.
