# MultiversX Ecosystem — Investigación Exhaustiva

> **Alcance:** 360+ repos de MultiversX org, 3 devs core, xDevGuild community, protocolos emergentes
> **Fecha:** 2026-02-17

---

## 🧑‍💻 Desarrolladores Core Investigados

### 1. Robert Sasu (`sasurobert`)
**Rol:** Arquitecto del Agent Economy — MX-8004 Standard

| Repo | Qué es | Relevancia XCron |
|---|---|---|
| [mx-8004](https://github.com/sasurobert/mx-8004) | **Trustless Agents Standard** — 3 smart contracts: Identity Registry (soulbound NFTs), Validation Registry (job lifecycle), Reputation Registry (CMA scoring) | 🔴 **CRÍTICO** — XCron keepers podrían registrarse como agentes MX-8004 |
| [moltbot-starter-kit](https://github.com/sasurobert/moltbot-starter-kit) | Template para agentes autónomos — 14+ skills, SDK v15+, TDD | 🟢 **ALTO** — Patrón para construir keepers como agentes |
| [multiversx-openclaw-skills](https://github.com/sasurobert/multiversx-openclaw-skills) | Skills AI para integración blockchain via OpenClaw + MX-8004 | 🟡 Referencia de diseño |

**Contribuciones:** También contribuye a `mx-sovereign-sc` (cadenas soberanas)

### 2. Andrei Marinica (`andrei-marinica`)
**Rol:** Lead del SC Framework — `mx-sdk-rs` (138 releases, 41 contributors)

| Contribución | Impacto |
|---|---|
| Core del framework `multiversx-sc` v0.64.0 | Todo nuestro código depende de su trabajo |
| Sistema de tipos (`Payment`, `NonZeroBigUint`, `TokenId`) | Los tipos que usaremos en XCron |
| `sc-ci-example` | Patrón de CI/CD para smart contracts |
| `result-handler-prototype` | Prototipos de syntax handlers |

### 3. Adrian Dobrita (`adriandobrita`)
**Rol:** Co-Founder & Head of Engineering

| Ámbito | Detalle |
|---|---|
| `mx-chain-go` | Implementación Go del protocolo blockchain |
| Especialización | Distributed systems, embedded systems, low-level optimization |
| Background | BS Computer Science + MSc Advanced Computing, profesor universitario |

---

## 🏛️ Repositorios Oficiales Clave (de los 360+)

### Infraestructura Agentic Economy

| Repo | Descripción | Para XCron |
|---|---|---|
| [mx-agent-standard](https://github.com/multiversx/mx-agent-standard) | Specs completas de MX-8004 v2.1 | 🔴 **Base para la identidad de keepers** |
| [mx-mcp-server](https://github.com/multiversx/mx-mcp-server) | MCP Server con 14 tools (send tokens, queries, Relayed V3) | 🟢 Integración para dashboard |
| [mx-x402](https://github.com/multiversx/mx-x402) | Pagos HTTP 402 para agentes | 🟡 Pagos machine-to-machine |
| [mx-a2a-x402](https://github.com/multiversx/mx-a2a-x402) | Agent-to-Agent payments | 🟡 Keepers cobrando entre sí |
| [mx-x402-facilitator](https://github.com/multiversx/mx-x402-facilitator) | Settlement de pagos x402 | 🟡 Infraestructura de pagos |
| [mx-acp-adapter](https://github.com/multiversx/mx-acp-adapter) | Agent Commerce Protocol (OpenAI/Stripe) | 🟡 Marketplace de tareas |
| [mx-openclaw-relayer](https://github.com/multiversx/mx-openclaw-relayer) | Relayer para OpenClaw skills | 🟡 Ejecución de skills |
| [mx-AP2](https://github.com/multiversx/mx-AP2) | Agent Payments Protocol v2 | 🟢 Pagos entre agentes |

### Smart Contracts de Referencia (Producción)

| Repo | Descripción | Para XCron |
|---|---|---|
| [mx-exchange-sc](https://github.com/multiversx/mx-exchange-sc) | **xExchange** — DEX completo (73 releases, 17 contributors) | 🟢 Código de referencia: Pair, Router, Farm, Staking, Distribution |
| [mx-delegation-sc](https://github.com/multiversx/mx-delegation-sc) | Sistema de delegación/staking (system SC) | 🟢 Patrón para keeper staking |
| [mx-liquid-staking-sc](https://github.com/multiversx/mx-liquid-staking-sc) | Liquid staking — EGLD → lsEGLD | 🟡 Si XCron ofrece liquid staking |
| [mx-chainlink-sc](https://github.com/multiversx/mx-chainlink-sc) | **Price Aggregator + Oracles** | 🟢 **Patrón para data feeds de keeper rewards** |
| [mx-launchpad-sc](https://github.com/multiversx/mx-launchpad-sc) | Launchpad de tokens | 🟡 Para lanzamiento del XCRON token |
| [mx-bridge-eth-sc-rs](https://github.com/multiversx/mx-bridge-eth-sc-rs) | Bridge Ethereum ↔ MultiversX | 🟡 Cross-chain en futuro |
| [sc-axelar-cgp-rs](https://github.com/multiversx/sc-axelar-cgp-rs) | Axelar cross-chain gateway | 🟡 Comunicación cross-chain |
| [mx-sovereign-sc](https://github.com/multiversx/mx-sovereign-sc) | Cadenas soberanas | ⚪ No relevante ahora |
| [sc-guilds-rs](https://github.com/multiversx/sc-guilds-rs) | Sistema de guilds | 🟡 Para DAOs de keepers |
| [mx-pulse-sc](https://github.com/multiversx/mx-pulse-sc) | Oracle/data pulse | 🟡 Data feeds |

### SDKs y Herramientas Oficiales

| Repo | Descripción | Para XCron |
|---|---|---|
| [mx-sdk-rs](https://github.com/multiversx/mx-sdk-rs) | **SpaceCraft Framework** — 138 releases, core SC framework | 🔴 Dependencia directa |
| [mx-sdk-dapp](https://github.com/multiversx/mx-sdk-dapp) | React dApp SDK — login, signing, helpers | 🟢 Para dashboard/frontend |
| [mx-sdk-dapp-ui](https://github.com/multiversx/mx-sdk-dapp-ui) | Componentes UI para dApps | 🟢 Frontend |
| [mx-template-dapp](https://github.com/multiversx/mx-template-dapp) | Template para dApps MultiversX | 🟢 Starting point para frontend |
| [mx-exchange-service](https://github.com/multiversx/mx-exchange-service) | Backend de xExchange | 🟡 Referencia de microservicio |
| [mx-api-service](https://github.com/multiversx/mx-api-service) | API pública de MultiversX | 🟢 Queries on-chain |
| [mx-template-sc](https://github.com/multiversx/mx-template-sc) | Template SC oficial | 🟢 Scaffolding |
| [mx-sc-actions](https://github.com/multiversx/mx-sc-actions) | GitHub Actions para SC CI/CD | 🟢 CI/CD pipeline |
| [mx-chain-simulator-go](https://github.com/multiversx/mx-chain-simulator-go) | Simulador de cadena para testing | 🟢 Testing local completo |
| [tournament-hub](https://github.com/multiversx/tournament-hub) | Hub de torneos | ⚪ No relevante |

---

## 🌐 xDevGuild — Comunidad de Desarrolladores

| Proyecto | Descripción | Para XCron |
|---|---|---|
| **xSuite** (Arda.org) | Suite completa para testing de SCs | 🟢 Testing avanzado |
| **MxOps** | DevOps — deploys, on-chain tests, automation | 🟢 **Deploy automation** |
| **Buildo.dev** | Simplifica interacciones blockchain | 🟡 Herramienta de desarrollo |
| **Elven Tools CLI** | Deploy NFT collections | 🟡 Si XCron usa NFTs |
| **MultiversX Utils** | Converters, auth, signing, SC interaction | 🟢 Utilidades |

---

## 🔑 Los 4 Pilares del Agent Economy + Relayed V3

### 1. x402 (Coinbase) — Pagos HTTP
- `HTTP 402 Payment Required` para acceso metered
- Pagos machine-to-machine autónomos
- **XCron use:** Keepers podrían pagar por APIs/compute via x402

### 2. ACP (OpenAI/Stripe) — Comercio
- Agent Commerce Protocol con escrow
- SFTs más ricos que ERC-1155 (metadata, royalties)
- **XCron use:** Marketplace de tareas automatizadas

### 3. UCP (Google) — Descubrimiento
- Universal Commerce Protocol
- Smart Accounts para "batch carts"
- **XCron use:** Descubrimiento de servicios de keepers

### 4. MCP (Anthropic) — Tooling
- Model Context Protocol para LLM → blockchain
- 14 tools en mx-mcp-server
- **XCron use:** IAs programando tareas en XCron directamente

### 5. Relayed V3 — Gas-Free Transactions
- **Campos nuevos:** `relayer` + `relayerSignature` en las transacciones
- El relayer paga el gas en nombre del usuario/agente
- **XCron use:** 🔴 **Los keepers podrían ejecutar tareas sin que el user necesite tener EGLD para gas**

---

## 💡 Oportunidades Concretas para XCron

### Integraciones Inmediatas (Fase 1-2)

1. **MX-8004 Identity para Keepers**
   - Cada keeper obtiene un soulbound NFT identity
   - Perfil verificable on-chain
   - Compatible con el ecosistema agéntico

2. **Reputation Registry para Keepers**
   - Score CMA (Cumulative Moving Average) basado en ejecuciones exitosas
   - Rating por employers (creadores de tareas)
   - Anti-gaming integrado

3. **Relayed V3 para Gasless Execution**
   - Users crean tareas sin gastar EGLD en gas
   - El protocolo o un relayer paga
   - UX masivamente mejorada

4. **mx-chainlink-sc Price Aggregator**
   - Datos de precios on-chain para calcular bounties dinámicos
   - Oracle pattern ya probado en producción

5. **mx-sc-actions para CI/CD**
   - GitHub Actions oficiales para build + test + deploy
   - Automatización completa del pipeline

### Integraciones Estratégicas (Fase 3+)

6. **x402 para pagos autónomos**
   - Keepers cobran vía HTTP 402
   - Machine-to-machine payments

7. **ACP Marketplace**
   - Marketplace de tareas donde agentes AI publican y ejecutan
   - Escrow automático

8. **MCP Server para AI Access**
   - ChatGPT/Claude pueden crear tareas en XCron directamente
   - Via Model Context Protocol

9. **Bridge Contracts para Cross-Chain**
   - Tareas que invocan contratos en Ethereum/Sui
   - Usando la infraestructura de bridge existente

### Código de Referencia a Estudiar

| Contrato | Patrón útil |
|---|---|
| `mx-exchange-sc/pair` | Manejo de liquidez, fees, swaps |
| `mx-exchange-sc/farm` | Staking con rewards, decay mechanism |
| `mx-delegation-sc` | Delegación no-custodial, sistema de nodos |
| `mx-chainlink-sc/aggregator` | Consensus de múltiples feeds |
| `mx-8004/validation-registry` | Job lifecycle: init → proof → validate → feedback |
| `mx-8004/reputation-registry` | CMA reputation scoring |

---

## 📊 Ventajas Competitivas de MultiversX para XCron

| Ventaja | Detalle |
|---|---|
| **Fees < $0.05** | Micro-transacciones viables para tareas frecuentes |
| **SFTs/ESDT** | Tokens más ricos que ERC-1155 |
| **Relayed V3** | UX gasless nativa a nivel de protocolo |
| **Sharding** | 15,000+ TPS — suficiente para alta frecuencia de tareas |
| **Rust/WASM** | SCs más fáciles de auditar que Solidity |
| **Agent Economy** | Ecosistema agéntico oficial con identidades on-chain |
| **Smart Accounts** | Operaciones batch nativas |
