use multiversx_sc::types::{BigUint, ManagedByteArray, ManagedBuffer, TestAddress, TestSCAddress, ReturnsNewManagedAddress, NotPayable};
use multiversx_sc::contract_base::ContractBase;
use multiversx_sc_scenario::{ScenarioWorld, ScenarioTxRun, ScenarioTxWhitebox};
use multiversx_sc_scenario::imports::{MxscPath, ExpectError};
use multiversx_sc_scenario::api::StaticApi;
use zk_verifier::ZkVerifierContract;

const ZK_VERIFIER_CODE: MxscPath = MxscPath::new("output/zk-verifier.mxsc.json");
const OWNER_ADDRESS: TestAddress = TestAddress::new("owner");
const SCHEDULER_ADDRESS: TestAddress = TestAddress::new("scheduler");
const KEEPER_ADDRESS: TestAddress = TestAddress::new("keeper");
const ZK_VERIFIER_SC_ADDRESS: TestSCAddress = TestSCAddress::new("zk-verifier");

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        ZK_VERIFIER_CODE,
        zk_verifier::ContractBuilder,
    );
    blockchain
}

#[test]
fn test_zk_verifier_flow() {
    let mut world = world();

    world.account(OWNER_ADDRESS).nonce(1).balance(0u64);
    world.account(KEEPER_ADDRESS).nonce(1).balance(0u64);

    // 1. Deploy
    let _zk_verifier_addr = world
        .tx()
        .from(OWNER_ADDRESS)
        .payment(NotPayable)
        .raw_deploy()
        .code(ZK_VERIFIER_CODE)
        .argument(&SCHEDULER_ADDRESS)
        .returns(ReturnsNewManagedAddress)
        .new_address(ZK_VERIFIER_SC_ADDRESS)
        .run();

    // Verify deployment
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        assert_eq!(sc.scheduler_addr().get(), SCHEDULER_ADDRESS.to_managed_address());
    });

    // 2. Try verifying or submitting when no block hash is registered
    let block_nonce = 100u64;
    let block_hash_bytes = [3u8; 32];
    let task_id = 1u64;
    let claimed_value_raw = 42u64;
    let salt_raw = b"some_random_salt";

    let mut commitment_bytes = [0u8; 32];
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let block_hash = ManagedByteArray::new_from_bytes(&block_hash_bytes);
        let claimed_value = BigUint::from(claimed_value_raw);
        let salt = ManagedBuffer::from(salt_raw);

        // Compute commitment off-chain: commitment = SHA-256(block_hash || claimed_value || salt)
        let mut hash_input = ManagedBuffer::new();
        hash_input.append(block_hash.as_managed_buffer());
        hash_input.append(&claimed_value.to_bytes_be_buffer());
        hash_input.append(&salt);

        let computed = sc.crypto().sha256(&hash_input);
        let _ = computed.as_managed_buffer().load_slice(0, &mut commitment_bytes);
    });

    // Submit proof as Keeper (does not check block hash on submission, only on verification)
    world.tx().from(KEEPER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let commitment = ManagedByteArray::new_from_bytes(&commitment_bytes);
        let claimed_value = BigUint::from(claimed_value_raw);
        sc.submit_proof(task_id, commitment, block_nonce, claimed_value);
    });

    // Verification should fail because block hash is not registered yet
    world
        .tx()
        .from(KEEPER_ADDRESS)
        .to(ZK_VERIFIER_SC_ADDRESS)
        .raw_call("verifyProof")
        .argument(&task_id)
        .argument(&ManagedBuffer::<StaticApi>::from(salt_raw))
        .returns(ExpectError(4, "Block hash not registered"))
        .run();

    // 3. Register trusted block hash (Admin only)
    world
        .tx()
        .from(OWNER_ADDRESS)
        .to(ZK_VERIFIER_SC_ADDRESS)
        .whitebox(zk_verifier::contract_obj, |sc| {
            let block_hash = ManagedByteArray::new_from_bytes(&block_hash_bytes);
            sc.register_block_hash(block_nonce, block_hash);
        });

    // Verification should now succeed
    world.tx().from(KEEPER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let salt = ManagedBuffer::from(salt_raw);
        sc.verify_proof(task_id, salt);
    });

    // Check that it's now verified
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        assert!(sc.is_proof_valid(task_id));
        assert!(sc.get_proof(task_id).verified);
    });
}
