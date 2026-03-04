/**
 * XCron TEE Enclave Simulator (Pillar B — Confidential Automation)
 *
 * Simulates a Trusted Execution Environment for anti-MEV task protection.
 * Tasks marked as `confidential` have their conditions encrypted so that
 * no mempool observer can front-run the execution.
 *
 * Architecture:
 *   1. User schedules a task with `confidential = true` and attaches encrypted
 *      metadata (AES-256-GCM) via setTaskMetadata.
 *   2. Keeper detects the task, unseals the metadata inside the "enclave".
 *   3. Execution happens inside the simulated enclave, producing an attestation
 *      report (hash of inputs + outputs + enclave ID + timestamp).
 *   4. Attestation is logged for auditability.
 *
 * NOTE: This is a SOFTWARE simulation. Production TEE would use Intel SGX
 * via Gramine or AWS Nitro Enclaves. The API is designed to be a drop-in
 * replacement when real hardware is available.
 */

import * as crypto from "crypto";
import { Logger } from "./logger";

// ── Types ──

export interface SealedPayload {
    /** AES-256-GCM initialization vector (12 bytes, hex) */
    iv: string;
    /** Encrypted data (hex) */
    ciphertext: string;
    /** GCM authentication tag (16 bytes, hex) */
    authTag: string;
    /** Key derivation salt (32 bytes, hex) */
    salt: string;
}

export interface AttestationReport {
    /** Unique enclave instance identifier */
    enclaveId: string;
    /** ISO timestamp of the attestation */
    timestamp: string;
    /** SHA-256 hash of the task inputs used during execution */
    inputHash: string;
    /** SHA-256 hash of the execution output/result */
    outputHash: string;
    /** HMAC-SHA256 signature of the report (simulated SGX quote) */
    signature: string;
}

export interface ConfidentialExecutionResult {
    /** Whether the enclave successfully processed the task */
    success: boolean;
    /** Attestation report proving correct execution */
    attestation: AttestationReport;
    /** Decrypted task metadata (only visible inside the enclave) */
    decryptedMetadata?: string;
    /** Error message if execution failed */
    error?: string;
}

// ── TEE Enclave Simulator ──

export class TeeEnclave {
    private enclaveId: string;
    private enclaveKey: Buffer;
    private logger: Logger;

    constructor(keeperPrivateKeyHex: string, logger: Logger) {
        this.logger = logger;

        // Derive enclave identity from keeper key (deterministic per keeper)
        this.enclaveId = crypto
            .createHash("sha256")
            .update(`xcron-tee-enclave-${keeperPrivateKeyHex.slice(0, 16)}`)
            .digest("hex")
            .slice(0, 16);

        // Derive enclave master key via HKDF from keeper's private key
        this.enclaveKey = Buffer.from(crypto.hkdfSync(
            "sha256",
            Buffer.from(keeperPrivateKeyHex, "hex"),
            Buffer.from("xcron-tee-v1"),
            Buffer.from("enclave-master"),
            32
        ));

        this.logger.info("TEE", `Enclave initialized: ${this.enclaveId}`);
    }

    /**
     * Seal (encrypt) task metadata so it's invisible in the mempool.
     * The user calls this client-side before submitting the task.
     */
    seal(plaintext: string, userKey?: Buffer): SealedPayload {
        const salt = crypto.randomBytes(32);
        const key = userKey || this.enclaveKey;

        // Derive task-specific encryption key
        const taskKey = Buffer.from(crypto.hkdfSync(
            "sha256",
            key,
            salt,
            Buffer.from("task-seal"),
            32
        ));

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", taskKey, iv);

        const encrypted = Buffer.concat([
            cipher.update(plaintext, "utf8"),
            cipher.final()
        ]);

        return {
            iv: iv.toString("hex"),
            ciphertext: encrypted.toString("hex"),
            authTag: cipher.getAuthTag().toString("hex"),
            salt: salt.toString("hex"),
        };
    }

    /**
     * Unseal (decrypt) task metadata inside the enclave.
     * Only the keeper with the correct enclave key can read this.
     */
    unseal(sealed: SealedPayload, userKey?: Buffer): string {
        const key = userKey || this.enclaveKey;

        const taskKey = Buffer.from(crypto.hkdfSync(
            "sha256",
            key,
            Buffer.from(sealed.salt, "hex"),
            Buffer.from("task-seal"),
            32
        ));

        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            taskKey,
            Buffer.from(sealed.iv, "hex")
        );
        decipher.setAuthTag(Buffer.from(sealed.authTag, "hex"));

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(sealed.ciphertext, "hex")),
            decipher.final()
        ]);

        return decrypted.toString("utf8");
    }

    /**
     * Execute a task inside the simulated enclave with full attestation.
     *
     * Flow:
     *   1. Decrypt the sealed metadata
     *   2. Validate the conditions
     *   3. Produce an attestation report
     *   4. Return the result
     */
    async executeConfidential(
        taskId: number,
        sealedMetadata: SealedPayload | null,
        executionFn: () => Promise<boolean>,
    ): Promise<ConfidentialExecutionResult> {
        const startTime = new Date().toISOString();
        this.logger.info("TEE", `[Enclave ${this.enclaveId}] Processing task #${taskId} in secure context`);

        let decryptedMetadata: string | undefined;

        // Step 1: Unseal metadata if present
        if (sealedMetadata) {
            try {
                decryptedMetadata = this.unseal(sealedMetadata);
                this.logger.info("TEE", `[Enclave] Task #${taskId} metadata decrypted (${decryptedMetadata.length} chars)`);
            } catch (err: any) {
                const attestation = this.generateAttestation(
                    taskId.toString(),
                    "decryption-failed",
                    startTime
                );
                return {
                    success: false,
                    attestation,
                    error: `Metadata decryption failed: ${err.message}`,
                };
            }
        }

        // Step 2: Execute within the enclave boundary
        let executionSuccess = false;
        let outputHash = "no-output";

        try {
            executionSuccess = await executionFn();
            outputHash = crypto
                .createHash("sha256")
                .update(`result:${executionSuccess}:${taskId}:${startTime}`)
                .digest("hex");
        } catch (err: any) {
            const attestation = this.generateAttestation(
                taskId.toString(),
                "execution-error",
                startTime
            );
            return {
                success: false,
                attestation,
                decryptedMetadata,
                error: `Enclave execution error: ${err.message}`,
            };
        }

        // Step 3: Generate attestation
        const attestation = this.generateAttestation(
            taskId.toString(),
            outputHash,
            startTime
        );

        this.logger.info("TEE", `[Enclave] Task #${taskId} attestation: ${attestation.signature.slice(0, 16)}...`);

        return {
            success: executionSuccess,
            attestation,
            decryptedMetadata,
        };
    }

    /**
     * Generate a simulated SGX attestation report.
     * In production, this would be a real EPID/DCAP quote from Intel SGX.
     */
    private generateAttestation(inputData: string, outputData: string, timestamp: string): AttestationReport {
        const inputHash = crypto.createHash("sha256").update(inputData).digest("hex");
        const outputHash = crypto.createHash("sha256").update(outputData).digest("hex");

        // Simulated SGX quote: HMAC of the report contents with enclave key
        const reportBody = `${this.enclaveId}:${timestamp}:${inputHash}:${outputHash}`;
        const signature = crypto
            .createHmac("sha256", this.enclaveKey)
            .update(reportBody)
            .digest("hex");

        return {
            enclaveId: this.enclaveId,
            timestamp,
            inputHash,
            outputHash,
            signature,
        };
    }

    /** Get the enclave ID for logging/telemetry */
    getEnclaveId(): string {
        return this.enclaveId;
    }
}
