#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

/// XCron HFT Vault — Atomic Flash Arbitrage Engine
///
/// Este contrato ejecuta arbitraje circular atómico en una sola transacción:
/// 1. Toma WEGLD/EGLD/ESDT del balance interno
/// 2. Swap TOKEN_A → TOKEN_B en Pool A (xExchange u otro DEX)
/// 3. Swap TOKEN_B → TOKEN_A en Pool B (AshSwap u otro DEX)
/// 4. Verifica que el TOKEN_A final >= TOKEN_A inicial + min_net_profit
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

  #[view(getSchedulerAddress)]
  #[storage_mapper("scheduler_address")]
  fn scheduler_address(&self) -> SingleValueMapper<ManagedAddress>;

  #[endpoint(setSchedulerAddress)]
  #[only_owner]
  fn set_scheduler_address(&self, scheduler: ManagedAddress) {
    self.scheduler_address().set(&scheduler);
  }

  // ==========================================================
  // FONDOS: Gestión del Capital de Arbitraje (Solo Dueño)
  // ==========================================================

  #[endpoint]
  #[payable("*")]
  fn deposit(&self) {
    // Los fondos se acumulan pasivamente en el balance del Smart Contract.
  }

  #[endpoint]
  #[only_owner]
  fn withdraw(&self, token_identifier: EgldOrEsdtTokenIdentifier<Self::Api>, amount: BigUint) {
    let caller = self.blockchain().get_caller();
    if token_identifier.is_egld() {
      self.send().direct_egld(&caller, &amount);
    } else {
      self.tx()
        .to(&caller)
        .single_esdt(&token_identifier.clone().unwrap_esdt(), 0, &amount)
        .transfer();
    }
  }

  #[endpoint(withdrawAll)]
  #[only_owner]
  fn withdraw_all(&self, token_identifier: EgldOrEsdtTokenIdentifier<Self::Api>) {
    let balance = self.blockchain().get_sc_balance(&token_identifier, 0);
    require!(balance > 0, "No balance to withdraw");
    let caller = self.blockchain().get_caller();
    if token_identifier.is_egld() {
      self.send().direct_egld(&caller, &balance);
    } else {
      self.tx()
        .to(&caller)
        .single_esdt(&token_identifier.clone().unwrap_esdt(), 0, &balance)
        .transfer();
    }
  }

  // ==========================================================
  // NÚCLEO HFT: The Atomic Flash Arbitrage Pipeline
  // ==========================================================

  /// Ejecuta un arbitraje circular atómico:
  /// token_in → token_mid (Pool A) → token_in (Pool B)
  ///
  /// Parámetros:
  /// - token_in: El token base del Vault (ej: WEGLD-bd4d79 o EGLD)
  /// - amount_in: Cantidad a usar en el primer swap
  /// - pool_a: Dirección del par A (ej: WEGLD/USDC pair)
  /// - endpoint_a: Endpoint de intercambio para Pool A (ej: swapTokensFixedInput)
  /// - token_mid: TokenIdentifier intermedio (ej: USDC-c76f1f)
  /// - pool_b: Dirección del par B (ej: USDC/WEGLD pair)
  /// - min_mid_amount: Mínimo aceptable del token intermedio (slippage protection)
  /// - min_final_amount: Mínimo aceptable de token_in al final del circuito
  /// - endpoint_b: Endpoint de intercambio para Pool B
  /// - min_net_profit: Beneficio neto mínimo esperado después del circuito
  #[endpoint(executeFlashArbitrage)]
  fn execute_flash_arbitrage(
    &self,
    token_in: EgldOrEsdtTokenIdentifier<Self::Api>,
    amount_in: BigUint,
    pool_a: ManagedAddress,
    endpoint_a: ManagedBuffer,
    token_mid: TokenIdentifier,
    pool_b: ManagedAddress,
    min_mid_amount: BigUint,
    min_final_amount: BigUint,
    endpoint_b: ManagedBuffer,
    min_net_profit: BigUint,
  ) {
    // ========== SEGURIDAD (Capa 1): Circuit Breaker ==========
    require!(!self.is_paused().get(), "Vault pausado por el Owner");

    // ========== SEGURIDAD (Capa 2): Solo el Bot, el Owner o el Scheduler autorizado ==========
    let caller = self.blockchain().get_caller();
    let is_owner = caller == self.blockchain().get_owner_address();
    let is_bot = caller == self.authorized_bot().get();
    let is_scheduler = !self.scheduler_address().is_empty() && caller == self.scheduler_address().get();

    require!(is_owner || is_bot || is_scheduler, "Caller no autorizado");

    // Si llama el Scheduler, verificamos de forma sincrónica que el dueño de la tarea sea el dueño de este Vault
    if is_scheduler {
      let raw_results = self.tx()
        .to(&caller)
        .raw_call("getExecutingTaskOwner")
        .returns(multiversx_sc::types::ReturnsRawResult)
        .sync_call();
      require!(!raw_results.is_empty(), "Failed to query executing task owner");
      let executing_owner = ManagedAddress::top_decode(raw_results.get(0).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode executing task owner"));
      require!(executing_owner == self.blockchain().get_owner_address(), "Task owner is not the Vault owner");
    }

    // ========== CHECKPOINT: Balance antes de operar ==========
    let balance_start = self.blockchain().get_sc_balance(&token_in, 0);
    require!(balance_start >= amount_in, "Liquidez insuficiente en Vault");

    // ========== PASO 1: Swap token_in → token_mid en Pool A ==========
    // Llamada sincrónica (mismo shard). Enviamos el token_in como pago.
    let tx_step1 = self
      .tx()
      .to(&pool_a)
      .raw_call(endpoint_a)
      .argument(&token_mid)
      .argument(&min_mid_amount);

    let bt_step1 = if token_in.is_egld() {
      tx_step1.egld(&amount_in)
        .returns(ReturnsBackTransfersReset)
        .sync_call()
    } else {
      tx_step1.single_esdt(&token_in.clone().unwrap_esdt(), 0, &amount_in)
        .returns(ReturnsBackTransfersReset)
        .sync_call()
    };

    // Extraemos el token intermedio del back-transfer
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

    let amount_nz = NonZeroBigUint::new(legacy_payment.amount).unwrap_or_else(|| {
      sc_panic!("Zero value back-transfer recibida (Dust exploit detedted)")
    });

    let safe_mid_payment = Payment::new(
      TokenId::from(legacy_payment.token_identifier.clone()),
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
    let balance_end = self.blockchain().get_sc_balance(&token_in, 0);

    // Si el balance final NO supera el inicial por al menos min_net_profit, toda la tx se revierte
    require!(min_net_profit > 0, "min_net_profit must be greater than zero");
    require!(
      balance_end >= &balance_start + &min_net_profit,
      "ABORT: Ganancia neta por debajo del umbral economico minimo."
    );
  }

  // ==========================================================
  // VIEWS: Consultas de Estado
  // ==========================================================

  #[view(getBalance)]
  fn get_balance(&self, token: EgldOrEsdtTokenIdentifier<Self::Api>) -> BigUint {
    self.blockchain().get_sc_balance(&token, 0)
  }
}
