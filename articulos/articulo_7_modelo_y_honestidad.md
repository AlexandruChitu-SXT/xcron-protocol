# Por qué elegimos este modelo económico — y qué nos falta por resolver

*Por Alejandro Chitu, Fundador de XCron Protocol*

---

Cada decisión que tomamos en XCron tiene un "por qué". Este artículo explica las razones detrás de nuestro modelo económico, los beneficios reales para el usuario, nuestros puntos más fuertes, y — lo que pocos protocolos hacen — **nuestros inconvenientes actuales**.

---

## ¿Por qué este modelo y no otro?

### Decisión 1: Sin token propio

**¿Por qué?** Porque un token propio habría creado tres problemas:
- Riesgo regulatorio (¿es un security? ¿necesita registro?)
- Fricción para el usuario (tiene que comprar otro token antes de usar el servicio)
- Competencia con EGLD (en vez de aliarnos con el ecosistema, competiríamos)

**Resultado:** Los usuarios pagan en EGLD. Sin intermediarios. Sin comprar nada nuevo. Simple.

### Decisión 2: Fees que bajan con la adopción (8% → 3%)

**¿Por qué?** Porque un protocolo que cobra lo mismo con 100 usuarios que con 100.000 no está pensando en sus usuarios. Está pensando en sí mismo.

Nuestro modelo:
- **Al principio (pocos usuarios):** fees más altos (8-15%) para sostener el desarrollo
- **Con adopción:** fees bajan (3-5%) porque el volumen compensa

**Resultado:** El usuario que llega primero paga un poco más, pero también recibe un protocolo que mejora constantemente. El que llega después paga menos, pero se encuentra con una plataforma madura. Ambos ganan.

### Decisión 3: Ajuste dinámico al precio de EGLD

**¿Por qué?** Porque si EGLD vale $500 mañana y nosotros seguimos cobrando lo mismo en EGLD, nuestros usuarios pagarían 16 veces más en USD. Eso es inaceptable.

Usamos una fórmula de raíz cuadrada: si EGLD sube ×4, el depósito mínimo baja ÷2. Ambas partes comparten la subida — ni el usuario absorbe todo el aumento, ni el protocolo renuncia a todo el beneficio.

**Resultado:** XCron funciona igual de bien a $30 que a $5.000 por EGLD.

### Decisión 4: Keepers ganan el 85-92%

**¿Por qué?** Porque sin keepers no hay ejecuciones, y sin ejecuciones XCron es un contrato inteligente muerto. Los keepers son el motor. Si no les pagas bien, se van.

Nosotros nos quedamos con el 8-15% del depósito + el 30% de gas royalties que MultiversX nos da automáticamente. Es suficiente para ser sostenibles sin ahogar a los keepers.

**Resultado:** Los keepers tienen un ROI brutal (7.500%+ sobre su bond de 1 EGLD). Eso atrae más keepers. Más keepers = más fiabilidad = más usuarios = más revenue para todos.

---

## ¿Qué gana el usuario a la larga?

### Año 1: Empieza a ahorrar tiempo
- Deja de hacer compound manual (18 horas/año recuperadas)
- Su yield mejora un 2.13% extra por el compound diario
- Coste: ~$55/año

### Año 2: Los fees bajan
- Con más usuarios, XCron reduce el fee del 8% al 6%
- Su coste baja de $55 a ~$41/año
- Misso beneficio, menos coste

### Año 3+: Fees mínimos, máximo beneficio
- Fee en 3-5% para usuarios veteranos
- Coste: ~$20/año por compound diario automático
- Nuevas funcionalidades: triggers condicionales, cross-chain
- Su estrategia DeFi se gestiona sola

**La promesa:** Cuantos más somos, menos paga cada uno.

---

## Los 5 puntos más fuertes de XCron

### 1. Único en MultiversX
No existe otra infraestructura de automatización descentralizada en esta blockchain. Somos primeros y por ahora únicos. No es un fork de otro protocolo — es código original escrito desde cero con `mx-sdk-rs`.

### 2. Gas predecible
En Ethereum, una ejecución puede costar $0.50 un día y $15 al siguiente. En MultiversX el gas es fijo. El usuario sabe exactamente cuánto pagará antes de crear su tarea.

### 3. Sin token = sin fricción
No necesitas comprar nada nuevo. Pagas con el EGLD que ya tienes. Sin aprobaciones adicionales, sin exposición a otro token volátil.

### 4. Integrado con la Agent Economy
XCron es el 5º pilar de la infraestructura de agentes de MultiversX (x402, ACP, MCP, MX-8004). Los AI Agents necesitan un scheduler para operar autónomamente. Somos ese scheduler.

### 5. Keepers son la comunidad
Los 3.200 validadores de MultiversX pueden convertirse en keepers sin coste adicional de infraestructura. Eso crea una red descentralizada que es casi imposible que falle completamente.

---

## Nuestros inconvenientes — lo que aún nos falta

Ser honestos sobre nuestras debilidades es más importante que presumir de fortalezas. Estos son nuestros puntos débiles hoy:

### ❌ Sin auditoría de seguridad
Los contratos no han pasado una auditoría formal. Están en testnet y funcionan, pero un auditor profesional podría encontrar vulnerabilidades que nosotros no vemos. **Esto es nuestra prioridad #1 antes de mainnet.**

### ❌ Un solo keeper operando
Hoy solo hay un keeper (el nuestro). La red es tan centralizada como un bot tradicional. Hasta que haya 10+ keepers independientes, la promesa de descentralización es aspiracional, no real.

### ❌ Sin triggers condicionales
XCron solo ejecuta tareas basadas en tiempo ("ejecuta cada 4 horas") o ronda ("ejecuta después de la ronda X"). No puede ejecutar basándose en condiciones ("ejecuta cuando ETH baje de $2.000"). Esto requiere un oráculo de precios que es Phase 2.

### ❌ Solo MultiversX
No funciona en Ethereum, Solana, ni ninguna otra chain. Cross-chain es Phase 5 del roadmap. Hoy somos un protocolo de un solo ecosistema.

### ❌ Sin historial de track record
Llevamos meses de desarrollo. Chainlink lleva 5+ años. Los usuarios confían en protocolos probados en batalla. Nosotros aún tenemos que ganarnos esa confianza con tiempo y resultados.

---

## Conclusión

Elegimos este modelo económico porque creemos que un protocolo debe ser **sostenible sin explotar a sus usuarios**. Fees que bajan con la adopción, precios que se ajustan al mercado, y keepers que ganan lo suficiente para mantenerse motivados.

No somos perfectos. Nos falta auditoría, nos falta adopción, y nos faltan features. Pero lo que tenemos hoy funciona — 8 tareas ejecutadas automáticamente en testnet, rewards acumulados, y un modelo económico diseñado para escalar de 500 a 500.000 usuarios.

**Lo que no nos falta es honestidad.** Y eso, en crypto, ya es diferenciador.

---

*XCron Protocol — Automatización descentralizada para MultiversX.*
*Todos los datos verificables on-chain. Febrero 2026.*
