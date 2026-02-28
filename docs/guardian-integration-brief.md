# XCron × Guardian — Technical Brief

> Documento preparado para la conversación con drew.erd (@wdrewcurry).
> Objetivo: tener las respuestas listas cuando retome el tema de Guardian + Clone-Key.

---

## 1. ¿Qué tiene XCron HOY que ya encaja con Guardian?

| Feature | Estado | Cómo funciona |
|---|---|---|
| **Ejecución delegada** | ✅ Funcional | Los keepers ejecutan en nombre del usuario — el usuario NO firma cada tx |
| **Depósitos limitados** | ✅ On-chain | El usuario deposita solo lo necesario, no expone su balance completo |
| **Commit-Reveal** | ✅ On-chain | Anti-MEV: los keepers ocultan su intención antes de ejecutar |
| **Progressive Slashing** | ✅ On-chain | Keepers maliciosos pierden stake: 10% → 25% → 50% → 100% |
| **Parámetros predefinidos** | ✅ On-chain | Cada tarea tiene: función exacta, contrato target, intervalo, monto máximo |
| **AI Security layers** | ✅ Frontend | Sanitización de input, anti-injección, rate limiting, validación de argumentos |

**Resumen para drew.erd:** XCron ya funciona como ejecución delegada — el usuario define QUÉ hacer y los keepers lo hacen. Pero hoy el usuario conecta su wallet principal. Ahí es donde Guardian entra.

---

## 2. El problema que Guardian resolvería

**Hoy:** El usuario conecta su wallet principal → deposita EGLD → los keepers ejecutan.

**Riesgo:** Si hubiera un exploit en el frontend o en la conexión de wallet, la wallet principal está expuesta.

**Con Guardian + Clone-Key:**
1. El usuario crea una **session key** (clone-key) con permisos limitados
2. Guardian actúa como **2FA** para aprobar la creación de esa session key
3. La session key tiene: límite de gasto, funciones permitidas, expiración automática
4. XCron usa esa session key — nunca toca la wallet principal
5. Si la key se compromete → pérdida máxima = el límite definido (ej: 0.5 EGLD)

---

## 3. Posibles preguntas de drew.erd y tus respuestas

### "¿Los keepers pueden robar fondos?"
> No. Los keepers solo pueden ejecutar la función exacta definida en la tarea (ej: `compound()` en Hatom). No tienen acceso a transferencias libres. Si fallan o actúan mal, pierden su stake (slashing progresivo).

### "¿Los contratos están auditados?"
> Todavía no — estamos en testnet. La auditoría formal está planificada para antes de mainnet. Pero tenemos 25 tests de escenarios que cubren los flows críticos.

### "¿Cómo funciona el commit-reveal?"
> El keeper primero envía un hash de su intención (commit). Después revela la acción real (reveal). Si alguien intenta front-runear, no puede porque no sabe la acción hasta el reveal. Esto protege contra MEV.

### "¿Qué es MX-8004 y cómo afecta?"
> MX-8004 es la propuesta de identidad on-chain para agentes en MultiversX. XCron sería la capa de ejecución en la que los agentes confían. Guardian protege a humanos; XCron protege la economía de agentes. Misma visión, diferentes carriles.

### "¿Cómo integrarías Guardian técnicamente?"
> La idea es que el Scheduler contract acepte session keys en vez de (o además de) la firma directa de wallet. Guardian aprobaría la creación de esas session keys. Necesitaríamos ver la API/interfaz del proyecto Guardian-based de drew para diseñar la integración.

---

## 4. Lo que podríamos construir juntos

| Concepto | Descripción |
|---|---|
| **Guardian-protected sessions** | El usuario crea una sesión de automatización. Guardian la aprueba con 2FA. XCron la ejecuta automáticamente. |
| **Clone-key con permisos granulares** | "Esta key solo puede hacer compound en Hatom, máximo 0.5 EGLD por tx, expira en 7 días" |
| **Burner wallet factory** | Smart contract que genera wallets delegadas desechables, ligadas a Guardian |
| **Guardian-gated task creation** | No se puede crear una tarea en XCron sin aprobación de Guardian |

---

## 5. Cómo llevar la conversación

- **Escucha primero** — deja que drew explique su proyecto Guardian-based
- **No asumas** cómo encaja — pregúntale cómo lo ve él
- **Muestra lo que tienes** — ofrécele acceso al código, al testnet, al dashboard
- **Sé honesto** — si algo no está hecho, dilo (ej: "la auditoría está pendiente")
- **Propón un call** — si la conversación avanza bien, sugiere una videollamada
