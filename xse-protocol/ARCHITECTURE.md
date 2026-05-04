# 🏗️ XSE Protocol Architecture

The **XCron Sovereign Enclaves (XSE)** architecture operates as a hybrid on-chain/off-chain relayer. It bridges the deterministic environment of the MultiversX blockchain with the centralized environments of Web2 exchanges (like Binance), while maintaining zero-knowledge custody of sensitive credentials.

## System Flow

The following Mermaid diagram illustrates the execution flow of an automated action (e.g., executing a trade on Binance after a MultiversX payment is confirmed).

```mermaid
sequenceDiagram
    autonumber
    
    participant User as User (MultiversX Wallet)
    participant SC as MultiversX Smart Contract
    participant XSE as XSE Node (AWS Nitro Enclave)
    participant CEX as Binance API

    Note over User,XSE: Setup Phase
    XSE->>User: 1. Provide Enclave Public Key & Attestation Hash
    User->>User: 2. Encrypt Binance API Key with Public Key
    User->>SC: 3. Store Encrypted Payload & Register Task

    Note over User,CEX: Execution Phase
    User->>SC: 4. Send Native EGLD (Payment/Trigger)
    SC-->>XSE: 5. Emit Blockchain Event (Payment Received)
    XSE->>SC: 6. Fetch Encrypted Payload
    Note right of XSE: Enclave isolates memory and decrypts payload
    XSE->>XSE: 7. Decrypt API Key in Volatile RAM
    XSE->>CEX: 8. Execute Authorized API Call (e.g., Buy BTC)
    CEX-->>XSE: 9. Return Trade Confirmation
    Note right of XSE: Enclave destroys decrypted API Key
    XSE->>SC: 10. Submit Cryptographic Proof of Execution
```

## Component Breakdown

1.  **MultiversX Smart Contract:** Acts as the decentralized registry and escrow. It holds the encrypted user payload and waits for triggers (like time-based crons or incoming transactions).
2.  **XSE Node (The Enclave):** A highly restricted, hardware-isolated virtual machine running a compiled Rust binary. It has no persistent storage, no SSH access, and limited external network access (only to whitelisted APIs).
3.  **Client-Side Encryption:** Users encrypt their sensitive data locally using standard asymmetric cryptography (e.g., RSA-4096 or ECIES) before it ever touches the blockchain or the internet.
