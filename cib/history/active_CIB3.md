# CIB3 — Puente a la Construcción (Ciclo 005)

* **Ciclo ID**: 005
* **Objetivo**: Implementar la arquitectura base en Rust para los Agentes Químico y Administrativo.

## Plan de Archivos
- **[NUEVO] `agents/Cargo.toml`**: Workspace maestro.
- **[NUEVO] `agents/chemistry_agent/*`**: Crate para DeSci Agent.
- **[NUEVO] `agents/admin_agent/*`**: Crate para Administrative Agent.

## Dependencias
- `tokio = { version = "1.0", features = ["full"] }`
- `reqwest = { version = "0.11", features = ["json"] }`
- `serde = { version = "1.0", features = ["derive"] }`
- `serde_json = "1.0"`

## Transición a CIB4
El desarrollo pasará al bucle de compilación local (Safety Loop). Se ejecutará `cargo build` sobre el workspace para validar que la estructura es correcta.
