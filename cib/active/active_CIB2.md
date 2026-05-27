# CIB2 - Diseño (Arquitectura Criptográfica Avanzada)

**Diseño de Soluciones Integradas:**

1. **VDF transparente sobre Class Groups Cl(D):**
   * Usar exponenciación modular secuencial en grupos de clase de discriminante negativo $D$ ($|D| > 2^{1024}$).
   * Al no requerir trusted setup, se elimina el riesgo de backdoor en RSA.
   * Cómputo secuencial off-chain calibrado para 300ms de retraso secuencial.
   * Verificación en L1 optimizada mediante prueba Groth16 (~150k gas) para evitar los 8M de gas de la aritmética de formas en Rust.

2. **Compresión ZK-PQ (Verificación Dilithium en zkVM):**
   * El Keeper ejecuta la verificación de firmas ML-DSA dentro de una zkVM (SP1/Risc0) en su enclave.
   * Genera una prueba de conocimiento cero corta de 250-500 bytes.
   * Reduce el gas de transmisión on-chain en un 85.5% (de 3.6M a ~375k gas).

3. **TEE-ZK Cryptographic Binding (Vinculación de Atestación):**
   * El enclave Nitro firma la prueba ZK final con su clave efímera $sk_{enc}$.
   * El circuito ZK exige que los inputs públicos contengan exactamente `SHA-256(pk_enc || PCR0_hash || TaskHash)`.
   * Evita la reutilización de pruebas (replay) y garantiza que la prueba se generó en un enclave atestado legítimo.

4. **Mitigaciones Microarquitecturales (Aislamiento AWS Nitro):**
   * **NUMA Node Pinning:** El sistema operativo host de la instancia EC2 mapea los recursos de hardware de forma que los núcleos físicos de CPU y los canales de memoria DRAM asignados al Enclave Nitro estén en un nodo NUMA (Non-Uniform Memory Access) físico totalmente separado del sistema operativo host. Esto previene que el host pueda realizar ataques de sincronización de caché (como Flush+Reload o Prime+Probe) al no compartir los mismos buffers físicos de memoria.
   * **Deshabilitar Hyper-Threading (SMT):** El Hyper-Threading permite que un núcleo físico ejecute dos hilos lógicos de forma simultánea. Al deshabilitarlo para el Enclave, se garantiza que ningún hilo del host pueda ejecutarse en el mismo núcleo físico que procesa los secretos del Enclave, cerrando los ataques de canal lateral de ejecución especulativa (tipo MDS o PortSmash).
   * **Padding de Latencia vsock (Time Padding):** Para evitar que un atacante midiendo el tiempo exacto que tarda la respuesta del enclave a través del canal virtual socket (`vsock`) pueda deducir información de la clave privada, la respuesta del Enclave se retrasa artificialmente con un búfer de tiempo constante (ej. retrasando todas las salidas para que siempre tarden exactamente 300ms, independientemente de la carga de procesamiento).
   * **Memory Blinding (Enmascaramiento DRAM):** Inyección de datos y operaciones espurias o aleatorias en los accesos a la memoria principal para oscurecer los patrones de lectura/escritura, mitigando ataques de monitoreo del bus de memoria física.
   * **Atestación de Hardware (PCR0):** Registro de configuración de plataforma criptográfica que contiene la huella (hash SHA-256) exacta de la imagen del Enclave (`.eif`). Esto garantiza al contrato inteligente en L1 que el Enclave está ejecutando el código original compilado y no una versión modificada o alterada.

