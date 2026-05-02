/**
 * XSE Protocol (XCron Sovereign Enclaves)
 * Client-Side Encryption Module
 * 
 * This module allows developers to securely encrypt sensitive payloads 
 * (like CEX API keys) on the client side before they are sent to the 
 * MultiversX blockchain. The payload can only be decrypted inside the 
 * AWS Nitro Enclave running the XSE protocol.
 */

export interface XsePayload {
    exchange: 'binance' | 'kraken' | 'coinbase';
    apiKey: string;
    apiSecret: string;
    orderType: 'market' | 'limit';
    pair: string;
    amount: number;
    price?: number;
}

export class XseClient {
    private enclavePublicKeyPem: string;

    /**
     * Initialize the XSE Client with the verified public key of the Enclave.
     * @param enclavePublicKeyPem The RSA public key exported from the AWS Nitro Enclave.
     */
    constructor(enclavePublicKeyPem: string) {
        this.enclavePublicKeyPem = enclavePublicKeyPem;
    }

    /**
     * Helper to convert a PEM string to a CryptoKey
     */
    private async importPublicKey(): Promise<CryptoKey> {
        // Remove PEM header, footer, and newlines
        const pemHeader = "-----BEGIN PUBLIC KEY-----";
        const pemFooter = "-----END PUBLIC KEY-----";
        let pemContents = this.enclavePublicKeyPem
            .replace(pemHeader, "")
            .replace(pemFooter, "")
            .replace(/\n/g, "")
            .replace(/\r/g, "");

        const binaryDerString = atob(pemContents);
        const binaryDer = new Uint8Array(binaryDerString.length);
        for (let i = 0; i < binaryDerString.length; i++) {
            binaryDer[i] = binaryDerString.charCodeAt(i);
        }

        // Import the key using Web Crypto API (supported in Node 19+ and Browsers)
        return await crypto.subtle.importKey(
            "spki",
            binaryDer.buffer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["encrypt"]
        );
    }

    /**
     * Encrypts the payload for the Enclave.
     * 
     * @param payload The raw JSON payload containing sensitive data
     * @returns A base64 encoded, RSA-encrypted string ready for the blockchain
     */
    public async encryptPayload(payload: XsePayload): Promise<string> {
        try {
            const publicKey = await this.importPublicKey();
            
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(JSON.stringify(payload));

            const encryptedBuffer = await crypto.subtle.encrypt(
                {
                    name: "RSA-OAEP"
                },
                publicKey,
                encodedData
            );

            // Convert ArrayBuffer to Base64
            const encryptedBytes = new Uint8Array(encryptedBuffer);
            let binary = '';
            for (let i = 0; i < encryptedBytes.byteLength; i++) {
                binary += String.fromCharCode(encryptedBytes[i]);
            }
            return btoa(binary);

        } catch (error) {
            throw new Error(`XSE Encryption failed: ${(error as Error).message}`);
        }
    }
}
