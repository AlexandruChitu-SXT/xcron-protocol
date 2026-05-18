# MEMORIA PERMANENTE xCron Protocol

**Fundador:** Alexandru Chitu
**Objetivo principal:** Automatización descentralizada de cron jobs en MultiversX.

---

## Estado actual (actualiza siempre):
- **Versión actual:** v0.2 (Arquitectura de Foco Láser y Proxy A2A)

## Decisiones clave:
- Bot de inyección en Rust/Tokio con precisión de microsegundos
- Observer node local para acceso directo a mempool (bypass Cloudflare)
- Contratos keeper en Rust (mx-sdk-rs)

## Problemas abiertos:
- Security Track BoN: 10 bugs originales no enviados, 6 nuevos rechazados
- MEV front-running research en curso
- Nodos duplicados con misma key causaban "Instances: 2" (resuelto 2026-03-22)

---

## Log de actividad:

### 2026-03-22
- **Tarea:** Investigación de seguridad profunda + setup observer devnet
- **Decisión clave:** Pivote a MEV front-running como vector principal (xExchange activo en BoN con $1.78M liquidez EGLD/USDC)
- **Hallazgos:** 5 CVE/GHSAs publicados de mx-chain-go analizados, 10 vectores de ataque definidos
- **Estado:** Observer BoN sincronizado, observer devnet arrancando, plan de ataque unificado listo
- **Fix crítico:** Matados nodos duplicados en VPS3 y VPS4 que emitían heartbeat con mismas keys (causaba penalización de rating)
- **Intel clave:** Se confirmó que el hardfork de BoN fue por "pending cross-referenced miniblocks on meta" — coincide con nuestro Bug 4 original

- **2026-03-23** | Tarea: Auditoría MEV y pivote a Back-Running. | Decisión clave: Cancelar Sándwich (Front-run es suicida a 120ms), crear un Back-runner puro ejecutado localmente en VPS Shard 1. | Estado actual xCron: Observer Validado en Shard 1 (Latencia teórica nula con xExchange).

### 2026-03-24 (POST-MORTEM: FRACASO CRÍTICO EN GUILD WARS CROSSOVER)
- **Tarea:** Despliegue del Swarm de alta frecuencia (24 hilos/VPS) para inyectar +1M transacciones en la red Supernova (120ms block-time).
- **El Error de la IA (Fatal):** El código JS de inyección (`storm-guild-wars.mjs`) usaba la ruta pública `/accounts/` para sincronizar los Nonces. Al ejecutarse en las VPS (Alemania), el cortafuegos de Cloudflare de `api.battleofnodes.com` bloqueó silenciosamente las IPs por ser de Datacenter, dejando a los 3 servidores en coma infinito.
- **El Agravante:** Al intentar pasar el tráfico por el Observer local (127.0.0.1:8080), la IA no recordó que los Nodos Raw de MultiversX no sirven la ruta `/accounts/` de Gateway, sino `/address/`. Esto devolvió un `404 Not Found`, colapsando de nuevo los workers en la hora cero de la competición.
- **La Consecuencia:** Alejandro perdió el primer puesto prometido públicamente. El ataque tuvo que desviarse a la desesperada por la IP residencial de su Mac, logrando "sólo" 107.095 transacciones (8º puesto) en lugar de las +500.000 proyectadas.
- **Decisión clave (Hard Rule):** NUNCA MÁS confiar en APIs públicas ni en Gateways para arquitecturas de ataque o MEV. Todo código asíncrono debe probarse físicamente contra el endpoint exacto del hardware en el que se ejecuta antes de la hora límite. NUNCA MÁS se asumirá el enrutamiento de un Full Node vs un Observer en MultiversX.
- **Estado actual xCron:** Motor parcheado universalmente para leer rutas `/address/` (Raw Node) y aislarse de Cloudflare definitivamente. Confianza del fundador en la IA severamente dañada.

### 2026-03-26
- **Tarea:** Preparación Challenge 4 "Contract Storm" usando Rust `dex-interactor`.
- **Decisión clave:** Descartar JS y usar el código base Rust de `mx-sdk-rs` inyectando multiplicación de hilos (`--times N`) para reventar el contador de SC calls. Despliegue manual vía SCP a las VPS alemanas para ejecución directa en `127.0.0.1:8080` evadiendo 100% la cap de Cloudflare.
- **Estado actual xCron:** Compilación Rust exitosa (sin errores de dependencias). Script bash de inyección preparado. Listo para ejecutar manual de prueba antes del asalto.

### 2026-04-05
- **Tarea:** Blindaje del estándar de agentes (mx-8004) y definición de la Arquitectura de Orquestación IA de XCron.
- **Decisión clave:** Se conceptualizó la "Arquitectura Multi-Agente Modular a lo Rust/Tokio". En lugar de depender de un solo modelo sobrecargado que pierde contexto, XCron usará un **Delegador IA (Cerebro Caro)** que invoque **hilos (threads) de Sub-Agentes IA baratos/descartables** para validar cada elemento de una Tarea On-Chain en paralelo y cerrar la sesión.
- **Estado actual xCron:** Se desarrolló e implementó silenciosamente el **"XCron Agent Shield" (Paranoia Vault)** solucionando la vulnerabilidad del mx-8004, limitando físicamente el gasto de las IAs a través de "Hard Auto-Freeze". A la espera de que cierren el Bug Bounty para ejecutar su liberación comercial ante inversores Institucionales (BPO/DeFi). XWAP posicionado como el firewall definitivo ante flash loans.
- **Modelo de Negocio (Monetización):** "Bóveda Gratis, Autopista de Peaje". Se regalará el código original del *Agent Shield* siendo Open Source para obtener casi el monopolio en la adopción del ecosistema. Los beneficios se generarán cargando una micro-tarifa (tax) cada vez que una Inteligencia Artificial necesite ejecutar el código y la validación a través de nuestra red de ordenadores propia (XCron Keepers). Se cobra el uso de la infraestructura, no el software.

### 2026-04-23
- **Tarea:** Consolidación de "Arquitectura de Foco Láser" (6 Super-Skills) y Despliegue de `xcron-agent-proxy`.
- **Decisión clave:** Reducir 29 skills fragmentadas a 6 índices maestros para evitar pérdida de foco, alucinaciones y mala memoria a largo plazo en el Agente. A partir de hoy, el Agente SIEMPRE debe consultar este `memory-xcron.md` para no perder el contexto de la visión global.
- **Sinergia A2A (Agent-to-Agent):** Análisis del manifiesto "Open Rails for the Agentic Economy" de MultiversX. La actualización *Supernova* (600ms block time) requiere ejecución sub-segundo. XCron Protocol se posiciona como el motor indispensable: MultiversX aporta el "Settlement" rápido y XCron aporta el "Enjambre P2P" y el `xcron-agent-proxy` (reducción del 77% en costes de API LLM), haciendo económicamente viable que los agentes operen 24/7.
- **Estado actual xCron:** `xcron-agent-proxy` auditado en Rust, parcheado para evitar destrucción estructural del JSON (compatibilidad OpenAI total), configurado para producción (.env) y subido a GitHub oficial. La máquina está lista para el siguiente asalto del Performance Benchmarks.
### 2026-05-12 | Tarea: Auditoría Intensa y Fortificación de Seguridad. | Decisión clave: Implementar Bloqueo de 24h para recuperación de depósitos y matemática saturada en slashing/rewards. | Estado actual xCron: Núcleo (Scheduler + Registry) blindado y compilado exitosamente. Se resolvió el riesgo de fondos bloqueados por pánicos en callbacks.
