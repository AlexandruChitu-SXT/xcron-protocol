const { MerkleTree } = require('merkletreejs');
const SHA256 = require('crypto-js/sha256');

console.log("==========================================");
console.log("🧠 XSC (XCron State Compression) - Offchain Keeper");
console.log("==========================================\n");

// 1. Imagine we have 10,000 AI Agent transactions/receipts to mint as cNFTs
const numReceipts = 10000;
console.log(`[1] Simulating ${numReceipts} cNFTs (Micro-receipts for Agents)...`);

// Create dummy data for 10,000 cNFTs
let receipts = [];
for (let i = 0; i < numReceipts; i++) {
    receipts.push(`Receipt_For_Agent_${i}_Amount_0.001_EGLD`);
}

// 2. Hash each receipt. The Smart Contract uses SHA256, so we must use SHA256 off-chain.
console.log(`[2] Hashing ${numReceipts} records...`);
const leaves = receipts.map(x => SHA256(x));

// 3. Build the Merkle Tree (The "ZIP file" of the blockchain)
// We sort pairs lexicographically to match the Smart Contract logic `is_less_than`.
console.log(`[3] Building the Merkle Tree (Compressing state)...`);
const tree = new MerkleTree(leaves, SHA256, { sortPairs: true });

// 4. Extract the Root (The 32-byte hash that is sent to the MultiversX Smart Contract)
const root = tree.getRoot().toString('hex');
console.log(`\n✅ COMPRESSION COMPLETE!`);
console.log(`👉 This is the MERKLE ROOT to send to the MultiversX Smart Contract:`);
console.log(`   0x${root}\n`);

// 5. Let's prove ownership for Agent #777
const targetAgent = "Receipt_For_Agent_777_Amount_0.001_EGLD";
const leafToProve = SHA256(targetAgent);
const proof = tree.getProof(leafToProve);

console.log(`[4] Agent 777 wants to use their cNFT on-chain.`);
console.log(`    Instead of sending the whole database, the Agent sends this cryptographic PROOF to the Smart Contract:\n`);

// Extract just the hex data of the proof to simulate sending it to the Smart Contract
let proofHexArray = proof.map(p => p.data.toString('hex'));
console.log(proofHexArray);

console.log(`\n[5] Local Off-chain Verification:`);
const isValid = tree.verify(proof, leafToProve, root);
console.log(`    Is the proof valid mathematically? -> ${isValid ? 'YES 🛡️' : 'NO ❌'}`);
console.log("\n==========================================");
