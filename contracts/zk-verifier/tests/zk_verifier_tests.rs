use multiversx_sc::types::{BigUint, ManagedByteArray, ManagedBuffer, TestAddress, TestSCAddress, ReturnsNewManagedAddress, NotPayable};
use multiversx_sc::contract_base::ContractBase;
use multiversx_sc_scenario::{ScenarioWorld, ScenarioTxRun, ScenarioTxWhitebox};
use multiversx_sc_scenario::imports::MxscPath;
use multiversx_sc_scenario::api::StaticApi;
use multiversx_sc::codec::TopEncode;
use zk_verifier::ZkVerifierContract;

const ZK_VERIFIER_CODE: MxscPath = MxscPath::new("output/zk-verifier.mxsc.json");
const OWNER_ADDRESS: TestAddress = TestAddress::new("owner");
const SCHEDULER_ADDRESS: TestAddress = TestAddress::new("scheduler");
const KEEPER_ADDRESS: TestAddress = TestAddress::new("keeper");
const ZK_VERIFIER_SC_ADDRESS: TestSCAddress = TestSCAddress::new("zk-verifier");

// ── Generic Helpers to resolve VMHooksApiBackend / DebugApi type mismatches ──

fn create_managed_array<C: ContractBase>(_: &C, bytes: &[u8; 32]) -> ManagedByteArray<C::Api, 32> {
    ManagedByteArray::new_from_bytes(bytes)
}

fn create_managed_buffer<C: ContractBase>(_: &C, bytes: &[u8]) -> ManagedBuffer<C::Api> {
    ManagedBuffer::from(bytes)
}

fn create_big_uint<C: ContractBase>(_: &C, val: u64) -> BigUint<C::Api> {
    BigUint::from(val)
}

fn create_managed_address<C: ContractBase>(_: &C, addr: &TestAddress) -> multiversx_sc::types::ManagedAddress<C::Api> {
    addr.to_managed_address()
}

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
    world.account(KEEPER_ADDRESS).nonce(1).balance(100_000_000_000_000_000u64);

    let pcr0_bytes = [1u8; 32];
    let pcr0_static = ManagedByteArray::<StaticApi, 32>::new_from_bytes(&pcr0_bytes);

    // 1. Deploy
    let _zk_verifier_addr = world
        .tx()
        .from(OWNER_ADDRESS)
        .payment(NotPayable)
        .raw_deploy()
        .code(ZK_VERIFIER_CODE)
        .argument(&SCHEDULER_ADDRESS)
        .argument(&pcr0_static)
        .returns(ReturnsNewManagedAddress)
        .new_address(ZK_VERIFIER_SC_ADDRESS)
        .run();

    // Verify deployment
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let pcr0_expected = create_managed_array(&sc, &pcr0_bytes);
        assert_eq!(sc.scheduler_addr().get(), SCHEDULER_ADDRESS.to_managed_address());
        assert_eq!(sc.authorized_pcr0().get(), pcr0_expected);
    });

    // Whitelist Keeper
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        sc.add_keeper(KEEPER_ADDRESS.to_managed_address());
    });

    // Prepare inputs
    let block_nonce = 100u64;
    let block_hash_bytes = [3u8; 32];
    
    let mut task_hash_bytes = [0u8; 32];
    task_hash_bytes[0] = 1;

    let claimed_value_raw = 42u64;
    let salt_raw = b"some_random_salt";

    let mut commitment_bytes = [0u8; 32];
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let block_hash = create_managed_array(&sc, &block_hash_bytes);
        let claimed_value = create_big_uint(&sc, claimed_value_raw);
        let salt = create_managed_buffer(&sc, salt_raw);
        let prover = create_managed_address(&sc, &KEEPER_ADDRESS);

        // Compute commitment off-chain using top_encode for structured serialization
        let mut hash_input = ManagedBuffer::new();
        let _ = (block_hash, &claimed_value, &salt, &prover).top_encode(&mut hash_input);

        let computed = sc.crypto().sha256(&hash_input);
        let _ = computed.as_managed_buffer().load_slice(0, &mut commitment_bytes);
    });

    // Submit proof as Keeper (does not check block hash on submission, only on verification)
    world.tx().from(KEEPER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).egld(10_000_000_000_000_000u64).whitebox(zk_verifier::contract_obj, |sc| {
        let task_hash = create_managed_array(&sc, &task_hash_bytes);
        let commitment = create_managed_array(&sc, &commitment_bytes);
        let claimed_value = create_big_uint(&sc, claimed_value_raw);
        sc.submit_proof(task_hash, commitment, block_nonce, claimed_value);
    });

    // 2. Register trusted block hash (Admin only)
    world
        .tx()
        .from(OWNER_ADDRESS)
        .to(ZK_VERIFIER_SC_ADDRESS)
        .whitebox(zk_verifier::contract_obj, |sc| {
            let block_hash = create_managed_array(&sc, &block_hash_bytes);
            sc.register_block_hash(block_nonce, block_hash);
        });

    // Derive Ed25519 keys for the test enclave signature
    use ed25519_dalek::{SigningKey, Signer};
    let seed = [9u8; 32];
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();
    let ephemeral_pubkey_bytes = verifying_key.to_bytes();

    // Register Enclave Key in L1 before verifying
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let ephemeral_pubkey = create_managed_array(&sc, &ephemeral_pubkey_bytes);
        sc.register_enclave_key(ephemeral_pubkey);
    });

    // Compute expected binding hash in L1 contract context to get exact serialization representation
    let mut binding_hash_bytes = [0u8; 32];
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let task_hash = create_managed_array(&sc, &task_hash_bytes);
        let ephemeral_pubkey = create_managed_array(&sc, &ephemeral_pubkey_bytes);
        let expected_pcr0 = create_managed_array(&sc, &pcr0_bytes);

        let mut hash_input = ManagedBuffer::new();
        let _ = (&task_hash, &ephemeral_pubkey, &expected_pcr0).top_encode(&mut hash_input);
        let expected_binding_hash = sc.crypto().sha256(&hash_input);
        let _ = expected_binding_hash.as_managed_buffer().load_slice(0, &mut binding_hash_bytes);
    });

    // Generate real Ed25519 signature
    let signature = signing_key.sign(&binding_hash_bytes);
    let signature_bytes = signature.to_bytes();

    // 3. Verification should succeed
    world.tx().from(KEEPER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let task_hash = create_managed_array(&sc, &task_hash_bytes);
        let zk_proof = create_managed_buffer(&sc, &signature_bytes[..]);
        let ephemeral_pubkey = create_managed_array(&sc, &ephemeral_pubkey_bytes);

        let success = sc.verify_proof(task_hash, zk_proof, ephemeral_pubkey);
        assert!(success);
    });

    // Check that it's now verified
    world.tx().from(OWNER_ADDRESS).to(ZK_VERIFIER_SC_ADDRESS).whitebox(zk_verifier::contract_obj, |sc| {
        let task_hash = create_managed_array(&sc, &task_hash_bytes);
        assert!(sc.is_proof_valid(task_hash.clone()));
        assert!(sc.get_proof(task_hash).verified);
    });
}
