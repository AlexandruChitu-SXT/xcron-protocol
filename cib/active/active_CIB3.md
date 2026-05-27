# CIB3 - Puente a la Construcción (Documentos y Especificaciones)

**Plan de Implementación Documental y de Seguridad:**

1. **Modelado de Amenazas (v2.3):**
   * Crear el archivo de framework de seguridad integral `THREAT_MODEL_XCRON_v2.3.md` detallando las mitigaciones contra side-channels, predicción de Round-Robin, colusión Sybil y replay de atestaciones.

2. **Dossier de Seguridad Avanzada:**
   * Redactar las especificaciones y fórmulas matemáticas de la VDF de Wesolowski sobre Cl(D), el pipeline de SP1/Risc0 para ZK-PQ y los esquemas de staking ponderado.

3. **Gobernanza y Pitch para George Serafeim:**
   * Actualizar las guías de reunión en español e inglés añadiendo una sección de Matriz de Mitigaciones Criptográficas y Físicas para inversores sofisticados.

4. **Preservación de Contexto (DriftLock):**
   * Actualizar active_EEB.md y registrar todos los avances de diseño bajo la disciplina de control de desviación.

5. **Plan de Despliegue de Infraestructura Física (AWS Nitro Enclaves):**
   * **¿Cuándo aplicarlo?** Obligatorio inmediatamente antes del despliegue en Testnet pública y de forma permanente en Mainnet. No se requiere para tests locales en el entorno de desarrollo simulado (Sandbox).
   * **¿Cómo aplicarlo?**
     * **Deshabilitar Hyper-Threading (SMT):** Configurar en el script de aprovisionamiento de AWS (o a través del CLI) el parámetro de CPU en el lanzamiento de la instancia EC2 (`CpuOptions: { ThreadsPerCore: 1 }`).
     * **NUMA Pinning:** Utilizar la herramienta `allocator` de Nitro CLI en la configuración de la instancia para asociar los cores específicos al Enclave (ej. `nitro-cli run-enclave --cpu-ids 2,4,6 --memory 4096`).
     * **Generación y registro de PCR0:** Al compilar la imagen del Enclave (`.eif`), recuperar el hash PCR0 devuelto por `nitro-cli build-enclave` y registrarlo en el contrato `zk-verifier` on-chain como el único hash de atestación autorizado.
     * **Padding de tiempo y Blinding:** Habilitar las directivas en el módulo de compilación del Keeper Rust (`xse-protocol`) que fuerzan retardos y enmascaran el direccionamiento de memoria.

