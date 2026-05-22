# CIB2 — Diseño Arquitectónico (Ciclo 005)

* **Ciclo ID**: 005
* **Objetivo**: Diseñar la arquitectura de Microservicios en Rust para los Agentes Químico (DeSci) y Administrativo.

## 1. Patrón Arquitectónico
- **Modelo off-chain**: Los agentes serán demonios (daemons) ejecutándose en un servidor (futuro VPS).
- **Asincronía Extrema**: Se usará **Tokio** como runtime asíncrono para manejar múltiples tareas de IA, scraping y firmas criptográficas sin bloquear el hilo principal.
- **Microservicios**: Cada agente existirá en su propio subdirectorio dentro de `agents/`.

## 2. Stack Tecnológico Base
- **Lenguaje**: Rust (Edition 2021).
- **Core Async**: `tokio` (para I/O, timers, y concurrencia).
- **API y Networking**: `axum` (para levantar endpoints HTTP si los agentes necesitan recibir webhooks o comunicarse con el frontend) y `reqwest` (para interactuar con LLMs o APIs externas de DeSci).
- **Blockchain Interop**: `multiversx-sdk-rust` (para firmar transacciones, leer Smart Contracts de XCron y enviar intents on-chain).
- **Serialización**: `serde`, `serde_json`.

## 3. Estructura de Directorios Propuesta
```text
xcron-protocol/
├── contracts/        # (Smart Contracts existentes)
├── frontend/         # (Next.js App existente)
└── agents/           # [NUEVO] Motores off-chain
    ├── chemistry_agent/   # DeSci Agent
    │   ├── Cargo.toml
    │   └── src/
    │       ├── main.rs         # Punto de entrada Tokio
    │       ├── brain.rs        # Lógica de decisión / LLM interact
    │       ├── blockchain.rs   # MultiversX SDK interop (interactúa con Escrow/Registry)
    │       └── desci.rs        # Módulo de simulación o extracción de papers (Química)
    └── admin_agent/       # Administrative Agent
        ├── Cargo.toml
        └── src/
            ├── main.rs         # Punto de entrada Tokio
            ├── brain.rs        # Toma de decisiones administrativas
            ├── blockchain.rs   # MultiversX SDK interop (gestión de Treasury, pagos)
            └── monitor.rs      # Telemetría y automatización de cronjobs
```

## 4. Flujo de Interacción (Loop de Agente)
1. **Sensar (Sense)**: Leer APIs externas o el estado del Smart Contract (ej. leer `scheduler`).
2. **Pensar (Think)**: Procesar con lógica interna o hacer llamadas a LLMs.
3. **Actuar (Act)**: Firmar una transacción usando `multiversx-sdk` y enviarla a la blockchain, o responder vía API.

## 5. Salida Proyectada (Output CIB3)
* Crear `implementation_plan.md` para someter la arquitectura a aprobación del usuario antes de crear los workspaces de Rust.
