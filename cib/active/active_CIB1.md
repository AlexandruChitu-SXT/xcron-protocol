# CIB1 - Brainstorming (Actualización de Infraestructura Barnard/Supernova y Mitigación Temporal)

**Objetivo:** Adaptar y proteger todos los contratos inteligentes y componentes de infraestructura del protocolo XCron frente a la transición de unidades de tiempo de segundos a milisegundos inducida por la actualización de Barnard/Supernova y el release v1.20.0 de `mx-api-service`.

**Temas de Investigación y Lluvia de Ideas:**
1. **Asimetría Temporal en Supernova (600ms PBFT):**
   - El cambio interno de la blockchain de MultiversX a precisión de milisegundos para soportar bloques de 0.6s introdujo discrepancias en la llamada `get_block_timestamp_seconds()`, que en redes de desarrollo o de prueba con la versión buggeada del VM hook (`blockChainHook.go`) devolvía milisegundos en lugar de segundos.
   - Si un Smart Contract valida plazos (deadlines, TTLs o expiraciones de clone-keys) en segundos, la comparación falla catastróficamente provocando Denegación de Servicio (DoS).
   - Necesitamos una válvula de seguridad matemática: si el timestamp es superior a 50,000,000,000, asumimos milisegundos y dividimos entre 1000.

2. **Normalización del Timestamp en el Core y Módulos Compartidos:**
   - La refactorización para usar `get_safe_block_timestamp()` en el contrato del Scheduler se detuvo a medio camino (solo se aplica en `commit_reveal.rs`).
   - Se debe propagar la lógica de lectura segura en todos los módulos de `scheduler` (`clone_keys.rs`, `execution.rs`, `intents.rs`).
   - Asimismo, todos los otros contratos que manejan tiempo (`keeper-registry`, `vault`, `xcron-agent-shield`, `zk-verifier`) deben heredar la misma protección para blindar el protocolo globalmente.

3. **Alineación con mx-api-service v1.20.0:**
   - La corrección de queries de rango de Elasticsearch en la API de MultiversX resuelve la discrepancia de unidades segundos/milisegundos al cruzar la época de Barnard.
   - Debemos verificar que la dApp y el SDK no requieran modificaciones en sus llamadas de rango de tiempo (actualmente utilizan segundos unix, lo cual es correcto ya que el backend de MultiversX ahora hace la traducción transparente).
