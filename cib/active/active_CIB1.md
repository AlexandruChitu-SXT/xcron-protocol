# CIB1 - Brainstorming (Seguridad Avanzada, ZK-PQ y VDF)

**Objetivo:** Diseñar y consolidar la especificación de seguridad avanzada para XCron Protocol v2.3, enfocándose en la eliminación de la predictibilidad del scheduler en Supernova, reducción de gas mediante compresión ZK de firmas post-cuánticas (ML-DSA) y blindaje de enclaves TEE contra ataques del host.

**Temas de Investigación y Lluvia de Ideas:**
1. **Firma Dilithium (ML-DSA):** El tamaño de 2.5 KB de la firma nativa causa costes excesivos de gas de transmisión (~3.6M gas) y potencial state bloat si se almacena permanentemente.
2. **Aleatoriedad de Asignación:** La dependencia directa de `get_block_random_seed()` es vulnerable a predicción por Keepers al inicio del bloque de 0.6s de Supernova.
3. **Canales Laterales en AWS Nitro:** El host EC2 parent comparte recursos de silicio (L3 caché, controlador de memoria DRAM). Existe el riesgo de ataques *Prime+Probe* para extraer llaves de encriptación.
4. **Colusión de Keepers:** Grupos organizados (como Lazarus) intentando capturar la mediana del oráculo de precio XWAP.
