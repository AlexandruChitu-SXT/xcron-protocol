# CIB3 - Puente a Construcción (Iteración 2)

**Plan de Ejecución Secuencial (Safety Loop - Iteración 2):**

1. **Corrección ZK-Verifier Avanzada:**
   - Pre-condición: `submit_proof` no requiere stake y el hash no incluye al caller.
   - Post-condición: `submit_proof` requiere EGLD. El hash on-chain validado en `verify_proof` debe ser recalculado mentalmente incluyendo el `caller` (o se exige que el prover original pase una validación más robusta). Dado que cambiar la estructura del hash criptográfico on-chain (si es ZK) puede ser complejo, la mitigación de stake encarece el ataque, y el requerimiento de que `verifyProof` solo pueda ser llamado por `existing.prover` anula el robo (ya implementado en Iteración 1). Sin embargo, para evitar el DoS, añadiremos `#[payable("EGLD")]` y exigiremos un depósito (ej. 1 EGLD o paramétrico).
   - Bucle: Modificar `zk-verifier/src/lib.rs` -> Compilar -> Ejecutar tests.
