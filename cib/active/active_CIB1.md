# CIB1 - Brainstorming (Auditoría Avanzada)

**Objetivo:** Realizar una auditoría avanzada de seguridad sobre los contratos de XCron Protocol, específicamente los MOATs matemáticos, ZK-Verifier, XWAP y Scheduler, e iniciar el ciclo de corrección.

**Hallazgos en Revisión Inicial:**
1. Mismatch de Endpoints: El Scheduler intenta llamar a `verifyZkProof` en el ZK Verifier, pero el ZK Verifier solo expone `verifyProof`.
2. Vulnerabilidad de Front-Running: En `submit_proof` (ZK Verifier), la ausencia de bloqueo contra sobrescritura de pruebas *no verificadas* permite secuestrar la identidad del prover.
3. Configuraciones Faltantes en XWAP: `price_scale_multiplier` y `price_scale_divisor` existen en el storage pero no tienen getters/setters expuestos en `config.rs`.

**Escape Hatch Activado:** El usuario requiere lenguaje "exhaustivo, detallado y en español" para la explicación de las vulnerabilidades.
