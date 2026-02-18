# MultiversX AI Skills — Análisis completo para XCron

> **Repositorio:** [github.com/multiversx/mx-ai-skills](https://github.com/multiversx/mx-ai-skills)
> **Fecha análisis:** 2026-02-17 | **Skills leídas:** 9/24 (las más relevantes para XCron)

---

## ¿Qué es mx-ai-skills?

Un kit de conocimiento oficial de MultiversX para IAs que desarrollan en su ecosistema. Contiene:
- **24 skills especializadas** — instrucciones técnicas para tareas específicas
- **26 workflows/roles** — perfiles especializados (auditor, SC developer, DeFi specialist, etc.)
- **Reglas globales** (`GEMINI.md`) — principios inamovibles para código MultiversX

## Reglas obligatorias absorbidas

### De `GEMINI.md` — Principios fundamentales

| Regla | Qué significa para XCron |
|---|---|
| **No hallucinar** | Si no sé algo, pregunto. No invento APIs |
| **Checked arithmetic** | `BigUint` para todo cálculo financiero. NUNCA floats |
| **Checks-Effects-Interactions** | Validar → actualizar estado → llamadas externas |
| **No `unwrap()`** | Usar `require!` y `sc_panic!` |
| **Mandos tests** | Tests obligatorios en `.scen.json` para todos los endpoints |
| **Simplicidad primero** | Mínimo código que resuelve el problema |

### De `multiversx-smart-contracts` — SDK v0.64.0+

| Patrón | Aplica a XCron |
|---|---|
| **`Payment` con `NonZeroBigUint`** | Pagos de keeper bounties — zero-amount imposible a nivel de tipos |
| **`TokenId` unificado** | EGLD + ESDT bajo la misma API |
| **`self.tx()` builder** | Todas las transferencias y cross-contract calls |
| **Módulos separados** | `lib.rs` solo compone traits, lógica en módulos |
| **`#[promises_callback]`** | Para cross-shard (keepers en diferentes shards) |
| **`register_promise()`** | Preferido sobre `async_call_and_exit()` |
| **Static error constants** | `pub static ERROR_X: &[u8] = b"..."` — eficiente en WASM |

### De `multiversx-sharp-edges` — 16 trampas que XCron DEBE evitar

| # | Trampa | Impacto en XCron | Mitigación |
|---|---|---|---|
| 1 | Callback no revierte estado | Si keeper falla ejecutando tarea, el estado ya cambió | Update estado solo en callback `Ok` |
| 2 | OOG en cross-shard | Keeper ejecuta pero callback se queda sin gas | `.gas_for_callback(10_000_000)` siempre |
| 3 | VecMapper ≠ Vec | Iterar 10k tareas = 10k reads de storage | Paginar o usar SetMapper |
| 5 | `#[init]` no se llama en upgrade | Si upgradeamos XCron, nuevos storage fields vacíos | `#[upgrade]` para migrar |
| 6 | Block timestamp en views | Off-chain puede dar valor diferente | Pasar timestamp como parámetro |
| 9 | MapMapper caro (4N+1) | No usar para balances de keepers | `SingleValueMapper` con key |
| 11 | `NonZeroBigUint` | No se puede crear Payment con amount 0 | `amount.into_non_zero()` pattern |
| 12 | BackTransfers acumulan | Múltiples sync calls mezclan resultados | `ReturnsBackTransfersReset` siempre |
| 13 | Callbacks sin tracking | Operación se pierde si callback no dispara | Track con `op_id` + recovery endpoint |
| 15 | Cache + async | `Drop` nunca se ejecuta después de `async_call_and_exit()` | Scope manual antes del async call |
| 16 | Rounding attacks | Truncación default permite exploitation | Half-up rounding para cálculos financieros |

### De `multiversx-project-architecture` — Estructura del proyecto

```
xcron-protocol/
├── Cargo.toml                 # [workspace]
├── common/
│   ├── constants/             # Constantes del protocolo
│   ├── errors/                # Errores compartidos
│   ├── structs/               # TaskConfig, KeeperInfo, etc.
│   └── events/                # Eventos compartidos
├── xcron-registry/            # Contrato de registro de tareas
│   ├── src/
│   │   ├── lib.rs             # Solo composición de traits
│   │   ├── storage.rs         # Storage mappers
│   │   ├── views.rs           # Views
│   │   ├── config.rs          # Admin config
│   │   ├── events.rs          # Eventos
│   │   ├── validation.rs      # Validación de inputs
│   │   ├── errors.rs          # Constantes de error
│   │   └── helpers.rs         # Lógica de negocio
│   ├── meta/
│   ├── wasm/
│   └── tests/
├── xcron-executor/            # Contrato de ejecución
│   └── ...
└── xcron-staking/             # Contrato de staking de keepers
    └── ...
```

### De `multiversx-cross-contract-calls` — XCron ejecuta contratos externos

| Componente XCron | Patrón de llamada |
|---|---|
| Keeper ejecuta tarea → contrato destino | `register_promise()` + `#[promises_callback]` |
| Tarea resulta en transfer de tokens | `ReturnsBackTransfersReset` |
| Keeper claim de bounty | `self.tx().to(&keeper).payment(bounty).transfer()` |

### De `multiversx-security-audit` — Checklist pre-auditoría

- [ ] Todos los endpoints tienen access control apropiado
- [ ] Token IDs validados en todos los `#[payable]`
- [ ] `BigUint` para todos los cálculos financieros
- [ ] No `unwrap()`, no floats, no unsafe
- [ ] Checks-Effects-Interactions en todos los flujos
- [ ] Callbacks manejan caso de error
- [ ] Sin iteraciones unbounded
- [ ] Mandos tests para todos los endpoints
- [ ] Storage layout compatible con upgrades

### De `multiversx-defi-math` — Para cálculos de bounties/fees

| Patrón | Uso en XCron |
|---|---|
| **BPS (10,000 = 100%)** | Cálculo de fees del protocolo |
| **`amount.proportion(fee, BASE)`** | Framework built-in para porcentajes |
| **Half-up rounding** | Cálculos de gas royalties |
| **Multiply before divide** | Preservar precisión en bounties |

### De `multiversx-cache-patterns` — Para gas optimization

| Patrón | Uso en XCron |
|---|---|
| **Write-back cache con Drop** | Endpoints que leen/escriben multiple storage |
| **Read-only cache** | Views que necesitan múltiples valores |
| **Scope manual antes de async** | Drop cache antes de `register_promise()` |

## SDK Modules útiles para XCron

| Module | Para qué en XCron |
|---|---|
| `only_admin` | Admin endpoints (pausar, config) |
| `pause` | Pausar protocolo en emergencias |
| `staking` | Base para keeper staking |
| `ongoing_operation` | Checkpoint para operaciones largas |

## Workflows/Roles disponibles (26 total)

Los más relevantes para XCron:
- **`rust-sc.md`** — Perfil de Smart Contract Engineer
- **`mvx-sc-auditor.md`** — Auditor de seguridad (15KB de instrucciones)
- **`mvx-defi-specialist.md`** — Especialista DeFi
- **`mvx-tester.md`** — Testing specialist
- **`production-ready.md`** — Checklist de producción

## Skills no leídas pero disponibles

| Skill | Relevancia para XCron |
|---|---|
| `multiversx-factory-manager` | 🟡 Si XCron despliega contratos hijo |
| `multiversx-vault-pattern` | 🟡 Para tracking de tokens in-memory |
| `multiversx-property-testing` | 🟢 Testing avanzado con fuzzing |
| `multiversx-code-analysis` | 🟢 Análisis de código |
| `multiversx-blockchain-data` | 🟡 Consulta de datos on-chain |
| `multiversx-crypto-verification` | 🔴 Verificación criptográfica |
| `multiversx-flash-loan-patterns` | ⚪ No relevante para XCron |
| `multiversx-dapp-frontend` | 🟢 Para el frontend/dashboard |
| `multiversx-dapp-audit` | 🟢 Auditoría del dApp |

---

## Conclusión

Con el conocimiento de estas 9 skills, tengo las herramientas para construir XCron siguiendo **exactamente los estándares de MultiversX**. El código va a:

1. ✅ Seguir la arquitectura modular oficial
2. ✅ Usar los tipos y APIs más recientes (SDK v0.64.0)
3. ✅ Evitar las 16 trampas documentadas
4. ✅ Estar preparado para auditoría de seguridad
5. ✅ Tener tests en formato Mandos scenarios
6. ✅ Usar gas-efficient patterns (cache, static errors, correct mappers)
