import { XCronClient } from "./client";
import { XseClient, XsePayload } from "./xse";
import { Transaction } from "@multiversx/sdk-core";

export interface DcaConfig {
    xcronClient: XCronClient;
    xseClient: XseClient;
    payload: XsePayload;
    intervalSeconds: number;
    executions: number;
    depositEgld: string; // The escrow amount to lock in the vault
}

/**
 * Automator for scheduling recurring Dollar Cost Averaging (DCA) operations 
 * via the XCron Sovereign Enclave (XSE). 
 * 
 * Bypasses Guardian signatures by locking funds in the XCron Escrow vault 
 * and scheduling a recurring trigger.
 */
export class VaultAutomator {
    
    /**
     * Prepares the transaction to schedule a recurring DCA strategy.
     * The payload is encrypted client-side and attached as an argument.
     */
    static async scheduleDca(config: DcaConfig): Promise<Transaction> {
        // 1. Encrypt the sensitive payload using the Enclave's public key
        const encryptedPayloadBase64 = await config.xseClient.encryptPayload(config.payload);
        
        // Convert the base64 string to a hex string for the Smart Contract
        const encryptedPayloadHex = Buffer.from(encryptedPayloadBase64, 'base64').toString('hex');

        // 2. We use the XCronClient to schedule a recurring task.
        // The target is the XSE Relay endpoint, passing the encrypted payload.
        return config.xcronClient.scheduleRecurring({
            targetContract: config.xcronClient.getSchedulerAddress(), // The Vault handles the proxy
            targetEndpoint: "triggerXseEnclave", 
            targetArgs: [encryptedPayloadHex], // The enclave will decrypt this
            intervalSeconds: config.intervalSeconds,
            executions: config.executions,
            depositEgld: config.depositEgld,
            maxGas: 10_000_000 // Enough gas for cross-shard triggering
        });
    }
}
