# CIB2 — Diseño Arquitectónico (Red Team fixes)

* **Objetivo**: Corregir vulnerabilidades críticas sin romper el Safety Loop (cero errores/warnings en compilación).

## 1. Escrow (Fake Tokens Fix)
- Añadir un endpoint `whitelist_token(token_identifier: TokenIdentifier)` con `#[only_owner]`.
- Añadir un storage mapper: `accepted_payment_tokens(token_identifier: &TokenIdentifier) -> SingleValueMapper<bool>`.
- En `deposit`, verificar: `require!(self.accepted_payment_tokens(&token_id).get(), "Token no aceptado para pagos");`

## 2. Agent-Treasury (Precision & SFT Fixes)
- **Precisión**: Reemplazar `REWARD_SCALE` por una variable dinámica o simplemente aumentar su valor. Un estándar más seguro es usar `1e24` para tokens ESDT, pero para evitar truncamiento total incluso si hay overflow futuro, vamos a asegurar que el multiplicador escale apropiadamente. Sin embargo, dado el límite, usaremos `BigUint` math real. Cambiaremos el orden a `(payment_amount * REWARD_SCALE_BIGUINT) / total_staked`. En lugar de `u64`, definiremos una constante string o crearemos un `BigUint` en tiempo de ejecución.
- **SFT Lock**:
  - Modificar el struct `UserInfo`: añadir `pub staked_nonce: u64`.
  - En `stake_sfts`: Capturar `payment.token_nonce` y guardarlo en `user_info.staked_nonce`.
  - En `unstake_sfts`: Usar `user_info.staked_nonce` en lugar de `0` en la llamada de envío `self.send().direct_esdt(..., user_info.staked_nonce, ...)`.

Estas correciones cierran brechas letales manteniendo total compatibilidad con SpaceCraft `v0.66.0`.
