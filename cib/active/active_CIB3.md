# CIB3 - Puente a la Construcción (Plan de Modificación de Contratos y Verificación)

**Plan de Implementación y de Seguridad:**

1. **Estructura Común de Parcheo:**
   - Crear el módulo de tiempo seguro en `common/src/time.rs`.
   - Modificar `common/src/lib.rs` para exportar `pub mod time;`.

2. **Refactorización de Contratos:**
   - Modificar `commit_reveal.rs` en `scheduler` para llamar al helper en `common::time::get_safe_block_timestamp(&self.blockchain())`.
   - Modificar todos los demás accesos directos al tiempo del bloque en `scheduler` (`clone_keys.rs`, `execution.rs`, `intents.rs`).
   - Modificar las llamadas en `keeper-registry`, `vault`, `xcron-agent-shield` y `zk-verifier` para que usen la misma función normalizadora.

3. **Ejecución y Safety Loop:**
   - Compilación completa de cada contrato usando `cargo check` y tests en `cargo test` para garantizar cero regresiones o errores de firma de funciones.
   - Creación del archivo `implementation_plan.md` y solicitud de feedback.
