#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

/// XCron HFT Vault — Atomic Flash Arbitrage Engine
///
/// Este contrato ejecuta arbitraje circular atómico en una sola transacción:
/// 1. Toma WEGLD del balance interno
/// 2. Swap WEGLD → TOKEN_B en Pool A (xExchange)
/// 3. Swap TOKEN_B → WEGLD en Pool B (AshSwap u otro)
/// 4. Verifica que el WEGLD final > WEGLD inicial (rentabilidad neta)
/// 5. Si no hay beneficio → REVERT automático (cero riesgo de inventario)

#[multiversx_sc::contract]
pub trait XcronHftVault {
    #[init]
    fn init(&self, bot_address: ManagedAddress) {
        self.authorized_bot().set(&bot_address);
        self.is_paused().set(false);
    }

    #[upgrade]
    fn upgrade(&self) {}

    // ==========================================================
    // SEGURIDAD MILITAR (Capa 1): Botón de Pánico
    // ==========================================================

    #[view(isPaused)]
    #[storage_mapper("is_paused")]
    fn is_paused(&self) -> SingleValueMapper<bool>;

    #[endpoint(pause)]
    #[only_owner]
    fn pause(&self) {
        self.is_paused().set(true);
    }

    #[endpoint(unpause)]
    #[only_owner]
    fn unpause(&self) {
        self.is_paused().set(false);
    }

    // ==========================================================
    // SEGURIDAD MILITAR (Capa 2): Protocolo "El Mensajero Único"
    // ==========================================================
    #[view(getAuthorizedBot)]
    #[storage_mapper("authorized_bot")]
    fn authorized_bot(&self) -> SingleValueMapper<ManagedAddress>;

    #[endpoint(setAuthorizedBot)]
    #[only_owner]
    fn set_authorized_bot(&self, new_bot: ManagedAddress) {
        self.authorized_bot().set(&new_bot);
    }

    // ==========================================================
    // FONDOS: Gestión del Capital de Arbitraje (Solo Dueño)
    // ==========================================================

    #[endpoint]
    #[payable("*")]
    fn deposit(&self) {
        // Los fondos se acumulan pasivamente en el balance del Smart Contract.
        // Listos para usarse como flash-liquidity en milisegundos.
    }

    #[endpoint]
    #[only_owner]
    fn withdraw(&self, token_identifier: TokenIdentifier, amount: BigUint) {
        let caller = self.blockchain().get_caller();
        self.tx()
            .to(&caller)
            .single_esdt(&token_identifier, 0, &amount)
            .transfer();
    }

    #[endpoint(withdrawAll)]
    #[only_owner]
    fn withdraw_all(&self, token_identifier: TokenIdentifier) {
        let sc_address = self.blockchain().get_sc_address();
        let balance = self
            .blockchain()
            .get_esdt_balance(&sc_address, &token_identifier, 0);
        require!(balance > 0, "No balance to withdraw");
        let caller = self.blockchain().get_caller();
        self.tx()
            .to(&caller)
            .single_esdt(&token_identifier, 0, &balance)
            .transfer();
    }

    // ==========================================================
    // NÚCLEO HFT: The Atomic Flash Arbitrage Pipeline
    // ==========================================================

    /// Ejecuta un arbitraje circular atómico:
    /// WEGLD → token_mid (Pool A) → WEGLD (Pool B)
    ///
    /// Parámetros:
    /// - token_in: El token base del Vault (ej: WEGLD-bd4d79)
    /// - amount_in: Cantidad a usar en el primer swap
    /// - pool_a: Dirección del par A en xExchange (ej: WEGLD/USDC pair)
    /// - token_mid: TokenIdentifier intermedio (ej: USDC-c76f1f)
    /// - pool_b: Dirección del par B en AshSwap o xExchange (ej: USDC/WEGLD pair)
    /// - min_mid_amount: Mínimo aceptable del token intermedio en el primer swap (slippage protection)
    /// - min_final_amount: Mínimo aceptable de token_in al final del circuito
    #[endpoint(executeFlashArbitrage)]
    fn execute_flash_arbitrage(
        &self,
        token_in: TokenIdentifier,
        amount_in: BigUint,
        pool_a: ManagedAddress,
        token_mid: TokenIdentifier,
        pool_b: ManagedAddress,
        min_mid_amount: BigUint,
        min_final_amount: BigUint,
        endpoint_b: ManagedBuffer,
    ) {
        // ========== SEGURIDAD (Capa 1): Circuit Breaker ==========
        require!(!self.is_paused().get(), "Vault pausado por el Owner");

        // ========== SEGURIDAD (Capa 2): Solo el Bot o el Owner ==========
        let caller = self.blockchain().get_caller();
        require!(
            caller == self.authorized_bot().get()
                || caller == self.blockchain().get_owner_address(),
            "Caller no autorizado"
        );

        // ========== CHECKPOINT: Balance antes de operar ==========
        let sc_address = self.blockchain().get_sc_address();
        let balance_start = self
            .blockchain()
            .get_esdt_balance(&sc_address, &token_in, 0);
        require!(balance_start >= amount_in, "Liquidez insuficiente en Vault");

        // ========== PASO 1: Swap token_in → token_mid en Pool A ==========
        // Llamada sincrónica (mismo shard). Enviamos el ESDT como pago.
        // xExchange endpoint: swapTokensFixedInput(token_wanted, min_amount_out)
        let bt_step1 = self
            .tx()
            .to(&pool_a)
            .raw_call("swapTokensFixedInput")
            .argument(&token_mid)
            .argument(&min_mid_amount)
            .single_esdt(&token_in, 0, &amount_in)
            .returns(ReturnsBackTransfersReset)
            .sync_call();

        // Extraemos explícitamente el token intermedio del back-transfer (ignorando posbile 'dust')
        let mid_payments = bt_step1.payments;
        require!(!mid_payments.is_empty(), "Pool A no devolvio tokens");

        // Búsqueda segura del token_mid esperado
        let mut mid_payment_opt = core::option::Option::None;
        for p in mid_payments.iter() {
            if p.token_identifier == token_mid {
                mid_payment_opt = core::option::Option::Some(p.clone());
                break;
            }
        }
        let legacy_payment =
            mid_payment_opt.unwrap_or_else(|| sc_panic!("Pool A no devolvio el token_mid"));

        // Parche de Seguridad (Legacy Debt Migration)
        // Convertimos explícitamente a NonZeroBigUint. Si el Pool devuelve '0' de amount (Ataque flash o dust de redondeo),
        // el contrato aborta aquí mismo evitando inyectar una transacción sin fondos que infle el estado.
        let amount_nz = NonZeroBigUint::new(legacy_payment.amount).unwrap_or_else(|| {
            sc_panic!("Zero value back-transfer recibida (Dust exploit detedted)")
        });

        let safe_mid_payment = Payment::new(
            TokenId::from(legacy_payment.token_identifier.into_managed_buffer()),
            legacy_payment.token_nonce,
            amount_nz,
        );

        // ========== PASO 2: Swap token_mid → token_in en Pool B ==========
        let bt_step2 = self
            .tx()
            .to(&pool_b)
            .raw_call(endpoint_b)
            .argument(&token_in)
            .argument(&min_final_amount)
            .payment(safe_mid_payment)
            .returns(ReturnsBackTransfersReset)
            .sync_call();

        let final_payments = bt_step2.payments;
        require!(!final_payments.is_empty(), "Pool B no devolvio tokens");

        // ========== SEGURIDAD (Capa 3): FUSIBLE ATÓMICO ("Cero Riesgo") ==========
        // Verificamos el balance REAL del contrato después de toda la operación.
        let balance_end = self
            .blockchain()
            .get_esdt_balance(&sc_address, &token_in, 0);

        // Si el balance final NO es ESTRICTAMENTE MAYOR al inicial,
        // TODA la transacción se destruye. Cero impacto. Cero pérdida.
        // Solo se pierde el Gas de red (~$0.01-0.05).
        require!(
            balance_end > balance_start,
            "ABORT: Operacion no rentable. Capital protegido."
        );

        // Si llegamos aquí: la ganancia está asegurada y almacenada en el contrato.
        // El Owner puede retirarla con withdraw() cuando quiera.
    }

    // ==========================================================
    // VIEWS: Consultas de Estado
    // ==========================================================

    #[view(getBalance)]
    fn get_balance(&self, token: TokenIdentifier) -> BigUint {
        let sc_address = self.blockchain().get_sc_address();
        self.blockchain().get_esdt_balance(&sc_address, &token, 0)
    }
}
