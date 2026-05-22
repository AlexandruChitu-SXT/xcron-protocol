# CIB1 — Brainstorming (Ciclo 005)

* **Ciclo ID**: 005
* **Nombre del Ciclo**: Arquitectura Agentes Rust (Químico y Admin)
* **Fecha**: 2026-05-22

## 1. Entrada de Usuario (Input Crudo)
* "2 1 aun no tengo vps por ahora"
* El usuario seleccionó primero diseñar la arquitectura de los nuevos agentes en Rust (Químico/DeSci y Administrativo) y aplazar el despliegue a Testnet porque no tiene VPS.

## 2. Contexto del Entorno
* **Entrada desde EEB Ciclo 004**: Protocolo entero migrado a SpaceCraft SDK v0.66.0 y compilando en verde absoluto.
* **Requisito Técnico**: Los agentes deben ser escritos en Rust para máxima velocidad y mínima fricción con el ecosistema de MultiversX.

## 3. Señales Extraídas (Signals)
* **Microservicios**: Los agentes no vivirán dentro del Smart Contract, sino como motores off-chain en Rust (usando Tokio).
* **Integración Web3**: Usarán el MultiversX Rust SDK (`multiversx-sdk-rust`) para firmar transacciones y leer el estado de XCron.
* **Independencia**: Cada agente debe tener su propio workspace/cargo para escalar horizontalmente.

## 4. Salida Proyectada (Output CIB2)
* Esquema arquitectónico técnico: Estructura de carpetas, dependencias (Tokio, Axum, mx-sdk), y flujo de datos off-chain -> on-chain.
