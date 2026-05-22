# CIB1 — Brainstorming (Red Team fixes for Agent Treasury & Escrow)

* **Objetivo**: Corregir vulnerabilidades críticas reportadas en `escrow` y `agent-treasury` y blindarlas matemáticamente.

## Vulnerabilidades Reportadas
1. **Escrow (`deposit`)**: Permite depositar *fake tokens* porque no se valida el `token_id` aceptado contra una whitelist, engañando a los trabajadores.
2. **Agent-Treasury (`payForService`)**: Pérdida de precisión al calcular `reward_addition`. `(payment_amount * 1e18) / total_staked` puede resultar en truncamiento a `0` si el dividendo es muy bajo frente a `total_staked`.
3. **Agent-Treasury (`unstakeSfts`)**: Robo/Locking de SFTs reales. Al hacer stake, se acepta cualquier nonce, pero el unstake fuerza el envío de `nonce = 0`, bloqueando el SFT original.

## Dirección (Fixes Propuestos)
- **Escrow**: Añadir un storage mapper `accepted_payment_tokens` configurado por el admin, y verificar en `deposit` que el token es válido.
- **Agent-Treasury**:
  - Precision: Modificar la constante `REWARD_SCALE` (ej. llevarla a `1e24`) O rediseñar el cálculo.
  - SFT Lock: Guardar el nonce del SFT depositado en `UserInfo` para poder retirarlo correctamente en `unstakeSfts`.
