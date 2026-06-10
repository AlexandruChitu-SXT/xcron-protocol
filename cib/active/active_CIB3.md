# CIB3 (Puente a la Construcción) - Archivos y Tareas para v2.1

Este documento establece el puente entre el diseño aprobado en CIB2 y la ejecución real en código.

## 1. Smart Contracts L1 (`contracts/scheduler/src/`)
- **`execution.rs`**: 
  - Ajuste del Escape Hatch V2 a 1500 bloques.
  - Binding de PCRs en el Verifier.
- **`scheduling.rs`**: 
  - Refactorizar el cálculo del depósito a Premium Privacy Fee.
  - Implementar Replay 2.0 en la generación del `task_hash`.

## 2. Keeper Network (`xcron-keeper-rs/src/`)
- **`l1_observer.rs`** [NUEVO]: Centinela que vigila la red.
- **`sentinel_node.rs`** [NUEVO]: Termómetro TEE con Kill-Switch en memoria.
- **`quantum_shield.rs`**: Rotación de claves Dilithium y hardening de CPU.

## 3. ZK-PQ Core (`xse-protocol/src/`)
- **`threshold_mldsa.rs`** [NUEVO]: Lógica de firmas fraccionadas (4-de-7).
- **`zk_prover.rs`**: Integración de ML-KEM (Kyber) y soporte para las firmas Threshold en los inputs públicos de Groth16.

*Nota: El tracking de tareas detallado (Checklist) se mantendrá en el artefacto `task.md` durante la Fase 4 de ejecución.*
