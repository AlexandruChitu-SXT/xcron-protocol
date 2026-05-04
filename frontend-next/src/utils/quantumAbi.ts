export function serializeQuantumTaskHex(
    taskId: number,
    ownerHex: string,
    targetContractHex: string,
    endpointHex: string,
    argsHex: string[],
    triggerType: number,
    triggerDataHex: string,
    maxGas: number,
    depositHex: string = "00000000",
    maxRetries: number = 3,
    ttlSeconds: number = 604800,
    requireXwapSafe: boolean = false,
    confidential: boolean = false
): string {
    const numToHex = (n: number, pad: number) => n.toString(16).padStart(pad, '0');
    
    let hex = '';
    // 1. id (8 bytes)
    hex += numToHex(taskId, 16);
    // 2. owner (32 bytes)
    hex += ownerHex;
    // 3. target_contract (32 bytes)
    hex += targetContractHex;
    // 4. target_endpoint (4 bytes len + data)
    const endpointBytesLen = endpointHex.length / 2;
    hex += numToHex(endpointBytesLen, 8) + endpointHex;
    // 5. target_args (4 bytes len + array)
    hex += numToHex(argsHex.length, 8);
    for (const arg of argsHex) {
        hex += numToHex(arg.length / 2, 8) + arg;
    }
    // 6. trigger (1 byte type + data)
    hex += numToHex(triggerType, 2) + triggerDataHex;
    // 7. max_gas (8 bytes)
    hex += numToHex(maxGas, 16);
    // 8. deposit (BigUint -> 4 bytes len + data)
    hex += depositHex;
    // 9. max_retries (1 byte)
    hex += numToHex(maxRetries, 2);
    // 10. retry_count (1 byte)
    hex += "00";
    // 11. ttl_seconds (8 bytes)
    hex += numToHex(ttlSeconds, 16);
    // 12. created_at (8 bytes)
    hex += "0000000000000000";
    // 13. status (1 byte enum, Pending = 00)
    hex += "00";
    // 14. assigned_keeper (Option<Address>, 00 = None)
    hex += "00";
    // 15. completed_at (8 bytes)
    hex += "0000000000000000";
    // 16. post_task_id (Option<u64>, 00 = None)
    hex += "00";
    // 17. require_xwap_safe (bool)
    hex += requireXwapSafe ? "01" : "00";
    // 18. confidential (bool)
    hex += confidential ? "01" : "00";

    return hex;
}
