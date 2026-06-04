# CIB2 - Diseño (Auditoría e Integración del Parche de Tiempo Seguro)

**Diseño de Soluciones Integradas:**

1. **Creación de `common::time`:**
   - Crearemos el archivo `contracts/common/src/time.rs` con la siguiente función pura:
     ```rust
     use multiversx_sc::api::ManagedTypeApi;
     use multiversx_sc::types::BlockchainWrapper;

     pub fn get_safe_block_timestamp<API: ManagedTypeApi>(blockchain: &BlockchainWrapper<API>) -> u64 {
         let ts = blockchain.get_block_timestamp_seconds().as_u64_seconds();
         if ts > 50_000_000_000 {
             ts / 1000
         } else {
             ts
         }
     }
     ```
   - Registraremos el nuevo módulo en `contracts/common/src/lib.rs`.

2. **Propagación del Timestamp Seguro en todos los Contratos Inteligentes:**
   - **Scheduler (`contracts/scheduler/src/`)**:
     - Actualizar `commit_reveal.rs` para que `get_safe_block_timestamp` llame a `common::time::get_safe_block_timestamp(&self.blockchain())`.
     - Actualizar `clone_keys.rs` (líneas 101, 179, 246, 264), `execution.rs` (líneas 203, 421, 506) e `intents.rs` (líneas 43, 112, 178, 232, 293, 367) para reemplazar llamadas directas a `self.blockchain().get_block_timestamp_seconds().as_u64_seconds()` por `self.get_safe_block_timestamp()`.
   - **Keeper Registry (`contracts/keeper-registry/src/lib.rs`)**:
     - Reemplazar llamadas a `self.blockchain().get_block_timestamp_seconds().as_u64_seconds()` en las líneas 75, 128, 151 por `common::time::get_safe_block_timestamp(&self.blockchain())`.
   - **Vault (`contracts/vault/src/lib.rs`)**:
     - Reemplazar llamadas en las líneas 256, 283, 338, 396, 440 por `common::time::get_safe_block_timestamp(&self.blockchain())`.
   - **Agent Shield Escrow (`contracts/xcron-agent-shield/escrow/src/lib.rs`)**:
     - Reemplazar llamadas en las líneas 137, 249, 326 por `common::time::get_safe_block_timestamp(&self.blockchain())`.
   - **Validation Registry (`contracts/xcron-agent-shield/validation-registry/src/lib.rs`)**:
     - Reemplazar llamadas en la línea 255 por `common::time::get_safe_block_timestamp(&self.blockchain())`.
   - **ZK Verifier (`contracts/zk-verifier/src/lib.rs`)**:
     - Reemplazar llamadas en la línea 89 por `common::time::get_safe_block_timestamp(&self.blockchain())`.

3. **Verificación de la dApp Frontend (`frontend-next`):**
   - Asegurar que todas las peticiones a la API del gateway o Elasticsearch no asuman unidades incorrectas y que el cambio interno en `mx-api-service: v1.20.0` no interfiera con el cálculo diario en segundos de `oneDayAgo` en `ProtocolRadar.tsx`.
