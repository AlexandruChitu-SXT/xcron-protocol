# CIB3 — Puente a la Construcción (Red Team fixes)

## Cambios a implementar

### 1. `contracts/xcron-agent-shield/escrow/src/lib.rs`
1. Añadir `storage_mapper("acceptedPaymentTokens") fn accepted_payment_tokens(&self, token_identifier: &TokenIdentifier) -> SingleValueMapper<bool>;`.
2. Añadir `#[endpoint(whitelistToken)] #[only_owner] fn whitelist_token(&self, token_identifier: TokenIdentifier)`.
3. En `fn deposit`, validar que `self.accepted_payment_tokens(&token_id).get()` sea `true`.

### 2. `contracts/agent-treasury/src/lib.rs`
1. Actualizar `UserInfo` añadiendo `pub staked_nonce: u64`.
2. En `fn pay_for_service`, cambiar el uso de `REWARD_SCALE` para instanciar un BigUint seguro (ej. 10^24) o usar el BigUint macro si es posible. Cambiaremos el const a: `const REWARD_SCALE: &str = "1000000000000000000000000";` y usaremos `BigUint::from_str_radix(REWARD_SCALE, 10).unwrap()`.
3. En `fn stake_sfts`, registrar `payment.token_nonce` en `user_info.staked_nonce`.
4. En `fn unstake_sfts`, recuperar y limpiar `staked_nonce` (o usarlo para devolver).
