multiversx_sc::imports!();

use common::types::{Intent, IntentStatus, PreCognitiveIntent, PreCognitiveIntentStatus};

#[multiversx_sc::module]
pub trait IntentsModule:
    crate::storage::StorageModule
    + crate::events::EventsModule
    + crate::validation::ValidationModule
    + crate::helpers::HelpersModule
    + common::pausable::PausableModule
{
    /// Creates a declarative Intent, pre-funding it with `token_in`.
    /// 
    /// The user specifies exactly what they want (`token_out`, `min_return`)
    /// and offers a `solver_fee` in EGLD out of the protocol's internal balance or
    /// attached EGLD (to be refined based on exact fee model).
    #[payable("*")]
    #[endpoint(createIntent)]
    fn create_intent(
        &self,
        token_out: TokenIdentifier,
        min_return: BigUint,
        deadline: u64,
        solver_fee: BigUint,
    ) -> u64 {
        self.require_not_paused();

        // Must receive exactly 1 ESDT token (the token_in)
        let (token_in_ref, amount_in_ref) = self.call_value().single_fungible_esdt();
        let token_in = token_in_ref.clone_value();
        let amount_in = amount_in_ref.clone_value();
        require!(amount_in > 0, "Amount in must be greater than 0");
        
        let current_time = self.get_safe_block_timestamp();
        
        // PROTECCIÓN CONTRA BUG DE TIEMPO (Milisegundos en JS vs Segundos en Rust)
        require!(deadline < 10_000_000_000u64, "XCRON-PROTECT: Deadline debe estar en segundos (Linux Epoch), no en milisegundos");
        require!(deadline > current_time, "XCRON-PROTECT: Deadline must be in the future");

        let caller = self.blockchain().get_caller();
        let intent_id = self.intent_nonce().get() + 1;
        self.intent_nonce().set(intent_id);

        let intent = Intent {
            id: intent_id,
            owner: caller.clone(),
            token_in,
            amount_in,
            token_out,
            min_return,
            deadline,
            solver_fee,
            status: IntentStatus::Pending,
            settled_by: None,
        };

        self.intent_by_id(intent_id).set(&intent);
        self.intent_created_event(intent_id, &caller);

        intent_id
    }

    /// Revokes an intent if it has not been settled yet, returning the funds to the owner.
    #[endpoint(cancelIntent)]
    fn cancel_intent(&self, intent_id: u64) {
        let mut intent = self.intent_by_id(intent_id).get();
        let caller = self.blockchain().get_caller();
        
        require!(intent.owner == caller, "Only owner can cancel");
        require!(intent.status == IntentStatus::Pending, "Intent not pending");

        intent.status = IntentStatus::Cancelled;
        self.intent_by_id(intent_id).set(&intent);

        // Refund the deposited token
        self.send().direct_esdt(
            &caller,
            &intent.token_in,
            0,
            &intent.amount_in,
        );
        
        // Note: Event logic can be expanded
    }

    /// Ejecución Pura de Solvers (Estilo CowSwap). El Solver aporta los fondos y hace el intercambio atómico.
    /// Se elimina el ataque de "Zero-Score Drain" (MX-8004) al no confiar en target_contracts externos.
    /// Se elimina el ataque de "Gas Bomb" (Ed25519) al no procesar buffers de datos infinitos.
    #[payable("*")]
    #[endpoint(solveIntent)]
    fn solve_intent(&self, intent_id: u64) {
        let caller = self.blockchain().get_caller();
        self.require_registered_keeper(&caller);

        let mut intent = self.intent_by_id(intent_id).get();
        require!(intent.status == IntentStatus::Pending, "XCRON-PROTECT: Intent not pending");
        require!(
            self.get_safe_block_timestamp() <= intent.deadline,
            "XCRON-PROTECT: Intent expired"
        );

        // PURE ATOMIC VERIFICATION: Verificamos que el Solver haya adjuntado los tokens requeridos por la IA/Usuario
        let (payment_token_ref, payment_amount_ref) = self.call_value().single_fungible_esdt();
        let payment_token = payment_token_ref.clone_value();
        let payment_amount = payment_amount_ref.clone_value();

        require!(payment_token == intent.token_out, "XCRON-PROTECT: Token invalido aportado por el Solver");
        require!(payment_amount >= intent.min_return, "XCRON-PROTECT: Slippage no cumplido (Zero-Score Hack evitado)");

        // CHECKS-EFFECTS-INTERACTIONS: Actualizamos el estado A Settled ANTES de enviar fondos (Antireentrancia)
        intent.status = IntentStatus::Settled;
        intent.settled_by = Some(caller.clone());
        self.intent_by_id(intent_id).set(&intent);

        // EFECTOS (Dispersión atómica)
        // 1. Enviar el pago del Solver al Usuario (La IA recibe su activo deseado)
        self.send().direct_esdt(&intent.owner, &payment_token, 0, &payment_amount);

        // 2. Liberar el deposito original del Usuario hacia el Solver (Recompensa del Solver)
        // El deposit estuvo blindado durante todo el estado 'Pending'
        self.send().direct_esdt(&caller, &intent.token_in, 0, &intent.amount_in);

        // 3. Pagar el fee adicional (gas sponsor si la IA ofertó EGLD)
        if intent.solver_fee > 0 {
            self.send().direct_egld(&caller, &intent.solver_fee);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  PRE-COGNITIVE INTENT TREES (PCIT)
    // ═══════════════════════════════════════════════════════════════════

    /// Creates a Pre-Cognitive Intent (Merkle Tree Root) generated by an AI Agent.
    /// The agent deposits `token_in` and defines its strategy via the `merkle_root`.
    #[payable("*")]
    #[endpoint(createPreCognitiveIntent)]
    fn create_pre_cognitive_intent(
        &self,
        merkle_root: ManagedByteArray<Self::Api, 32>,
        deadline: u64,
        keeper_fee: BigUint,
    ) -> u64 {
        self.require_not_paused();

        let (token_in_ref, amount_in_ref) = self.call_value().single_fungible_esdt();
        let token_in = token_in_ref.clone_value();
        let amount_in = amount_in_ref.clone_value();
        require!(amount_in > 0, "Amount in must be greater than 0");
        
        let current_time = self.get_safe_block_timestamp();
        require!(deadline < 10_000_000_000u64, "XCRON-PROTECT: Deadline must be in Linux Epoch seconds");
        require!(deadline > current_time, "XCRON-PROTECT: Deadline must be in the future");

        let caller = self.blockchain().get_caller();
        let intent_id = self.pre_cognitive_intent_nonce().get() + 1;
        self.pre_cognitive_intent_nonce().set(intent_id);

        let intent = PreCognitiveIntent {
            id: intent_id,
            owner: caller.clone(),
            token_in,
            amount_in,
            merkle_root,
            deadline,
            keeper_fee,
            status: PreCognitiveIntentStatus::Pending,
            executed_by: None,
        };

        self.pre_cognitive_intent_by_id(intent_id).set(&intent);
        
        intent_id
    }

    /// Executed by an XCron Keeper. Verifies the Merkle Proof against the AI's Pre-Cognitive Intent
    /// and atomically executes the leaf (which could be an arbitrage, an AP2 Cart Mandate, etc).
    #[payable("*")]
    #[endpoint(executePreCognitiveLeaf)]
    fn execute_pre_cognitive_leaf(
        &self,
        intent_id: u64,
        merkle_proof: ManagedVec<ManagedByteArray<Self::Api, 32>>,
        target_contract: ManagedAddress,
        target_endpoint: ManagedBuffer,
        target_args: ManagedVec<ManagedBuffer>,
        expected_token_out: TokenIdentifier,
        min_return: BigUint,
    ) {
        let caller = self.blockchain().get_caller();
        self.require_registered_keeper(&caller);

        let mut intent = self.pre_cognitive_intent_by_id(intent_id).get();
        require!(intent.status == PreCognitiveIntentStatus::Pending, "XCRON-PROTECT: Intent not pending");
        require!(
            self.get_safe_block_timestamp() <= intent.deadline,
            "XCRON-PROTECT: Intent expired"
        );

        // 1. Build the Leaf Hash off the parameters
        let mut encoded_leaf = ManagedBuffer::new();
        let _ = target_contract.top_encode(&mut encoded_leaf);
        let _ = target_endpoint.top_encode(&mut encoded_leaf);
        for arg in target_args.iter() {
            let _ = arg.top_encode(&mut encoded_leaf);
        }
        let _ = expected_token_out.top_encode(&mut encoded_leaf);
        let _ = min_return.top_encode(&mut encoded_leaf);
        
        let leaf_hash: ManagedByteArray<Self::Api, 32> = self.crypto().sha256(&encoded_leaf).into();

        // 2. Verify Merkle Proof
        require!(
            self.verify_merkle_proof(leaf_hash, merkle_proof, intent.merkle_root.clone()),
            "XCRON-PROTECT: Invalid Merkle Proof (Condition not met or AI didn't sign this leaf)"
        );

        // 3. Atomicity & Safety Checks
        let (payment_token_ref, payment_amount_ref) = self.call_value().single_fungible_esdt();
        require!(payment_token_ref.clone_value() == expected_token_out, "XCRON-PROTECT: Invalid execution outcome token");
        require!(payment_amount_ref.clone_value() >= min_return, "XCRON-PROTECT: Slippage condition not matched");

        // CHECKS-EFFECTS
        intent.status = PreCognitiveIntentStatus::Executed;
        intent.executed_by = Some(caller.clone());
        self.pre_cognitive_intent_by_id(intent_id).set(&intent);

        // 4. Distribution
        // Send AI's required target asset to the AI owner
        self.send().direct_esdt(&intent.owner, &payment_token_ref.clone_value(), 0, &payment_amount_ref.clone_value());
        // Send deposited funds to Keeper (Solver bounty)
        self.send().direct_esdt(&caller, &intent.token_in, 0, &intent.amount_in);
        // Keeper fee (if any EGLD)
        if intent.keeper_fee > 0 {
            self.send().direct_egld(&caller, &intent.keeper_fee);
        }

        // (We assume the Keeper already engaged the `target_contract` outside of this 
        // to fulfill the intent, capturing the arbitrage or buying the ticket. 
        // Alternatively, the contract could do an async cross-contract call here, 
        // but for HFT, Keeper fulfilling it atomically via `call_value` is safer).
    }

    /// Internal Merkle Proof verifier
    fn verify_merkle_proof(
        &self,
        leaf_hash: ManagedByteArray<Self::Api, 32>,
        proof: ManagedVec<ManagedByteArray<Self::Api, 32>>,
        root: ManagedByteArray<Self::Api, 32>,
    ) -> bool {
        let mut current_hash = leaf_hash;
        
        for sibling in proof.iter() {
            let mut combined = ManagedBuffer::new();
            
            // Lexicographical ordering or simplest concat (must match off-chain standard)
            // We use simple concat for this implementation: hash(current_hash || sibling)
            let _ = current_hash.top_encode(&mut combined);
            let _ = sibling.top_encode(&mut combined);
            
            current_hash = self.crypto().sha256(&combined).into();
        }
        
        current_hash == root
    }
}
