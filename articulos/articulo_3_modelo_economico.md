# El modelo económico de XCron: diseñado para crecer contigo

*Por Alejandro Chitu, Fundador de XCron Protocol*

---

Uno de los mayores problemas en crypto es que los protocolos diseñan su economía para hoy, no para mañana. Fees que funcionan a $30/EGLD se vuelven prohibitivos a $500. Porcentajes que sostienen un proyecto con 100 usuarios ahogan a los usuarios cuando llegan a 100.000.

**XCron está diseñado para que nunca ocurra eso.**

---

## El problema que resolvemos

Imagina que usas un servicio de automatización que cobra 15% de fee cuando EGLD vale $30. Tu compound diario te cuesta $0.15 por ejecución. Perfecto.

Pero un día EGLD vale $500. Ese mismo 15% ahora te cuesta $2.50 por ejecución. Tu compound diario pasa de $55/año a $912/año. **El servicio se volvió 16 veces más caro sin que nada haya cambiado.**

Esto nos parecía inaceptable. Así que diseñamos dos mecanismos para combatirlo.

---

## Mecanismo 1: Ajuste dinámico del depósito mínimo

En vez de mantener un depósito fijo en EGLD, XCron ajusta el mínimo según el precio:

```
nuevo_deposito = deposito_base × √(precio_base / precio_actual)
```

La raíz cuadrada es la clave. Si el precio sube ×4, el depósito solo baja ÷2. El resultado:

| Precio EGLD | Depósito mínimo | Coste por ejecución | Para el usuario | Para el protocolo |
|---|---|---|---|---|
| $30 (hoy) | 0.005 EGLD | $0.15 | Base | Base |
| $100 (×3.3) | 0.0027 EGLD | $0.27 | Paga ×1.8 más | Gana ×1.8 más |
| $500 (×16.6) | 0.0012 EGLD | $0.60 | Paga ×4 más | Gana ×4 más |
| $1.000 (×33) | 0.0008 EGLD | $0.84 | Paga ×5.6 más | Gana ×5.6 más |

**¿Por qué funciona?** Porque ambas partes comparten el aumento. El usuario no absorbe todo el incremento del precio de EGLD, y el protocolo no renuncia a todo el beneficio de que EGLD suba.

---

## Mecanismo 2: Fees adaptativos por nivel de adopción

Este es el más importante para el largo plazo. La idea es simple: **cuantos más usuarios hay, menor es el fee para cada uno.**

### ¿Por qué bajar los fees si todo va bien?

Por la misma razón que Netflix empezó cobrando $8 cuando tenía 1 millón de suscriptores y ahora cobra $15 con 250 millones: **el volumen compensa una reducción de porcentaje**.

Pero en XCron es al revés — bajamos el porcentaje según crece la adopción:

| Fase | Usuarios activos | Fee Starter | Fee Standard | Fee Enterprise |
|---|---|---|---|---|
| **Lanzamiento** | < 1.000 | 8% | 15% | 12% |
| **Crecimiento** | 1.000 – 10.000 | 6% | 12% | 10% |
| **Escala** | 10.000 – 100.000 | 4% | 8% | 6% |
| **Adopción masiva** | > 100.000 | 3% | 5% | 4% |

### Los números prueban que funciona

| Fase | Usuarios | Fee promedio | Tasks/mes | Revenue/mes |
|---|---|---|---|---|
| Lanzamiento | 500 | ~10% | 1.000 | **$68** |
| Crecimiento | 5.000 | ~8% | 25.000 | **$7.600** |
| Escala | 50.000 | ~5% | 500.000 | **$45.000** |
| Adopción masiva | 500.000 | ~3.5% | 5.000.000 | **$250.000** |

**El fee baja de 10% a 3.5%** (÷3), pero el **revenue sube de $68 a $250.000** (×3.600). El volumen siempre gana.

---

## ¿Y si MultiversX llega a $100B de market cap?

Escenario real. MultiversX tiene ~$670M de market cap hoy. Si crece 150×:

- EGLD pasaría de $30 a ~$4.500
- La red tendría millones de usuarios
- El DeFi TVL pasaría de $200M a $30B+

En ese escenario, con los dos mecanismos activos:

| Parámetro | Hoy ($30) | $4.500 EGLD |
|---|---|---|
| Depósito mínimo | 0.005 EGLD | 0.0004 EGLD |
| Coste/ejecución | $0.15 | $1.80 |
| Fee Starter | 8% | 3% |
| Fee Standard | 15% | 5% |
| Usuarios | 500 | 500.000+ |
| Revenue/mes protocolo | $68 | $250.000+ |

**El usuario paga $1.80 por ejecución** (razonable para una red con $100B de market cap) y **el protocolo genera $3M+/año**. Ambos ganan.

---

## ¿Cómo se implementa técnicamente?

Los dos mecanismos son parámetros del contrato inteligente que el dueño del protocolo puede ajustar en cualquier momento:

1. **`setMinDeposit()`** — ajusta el depósito mínimo (el Mecanismo 1)
2. **`setProtocolFeeBps()`** — ajusta el porcentaje de fee (el Mecanismo 2)

Hoy esto es manual (una transacción de 5 segundos). En Phase 2, se puede automatizar con un oráculo de precios (Chainlink en MultiversX) para que el ajuste sea automático y transparente.

Lo importante: **estos parámetros están on-chain y son verificables por cualquiera.** No son promesas — son código ejecutable.

---

## El compromiso de XCron

Nos comprometemos a:

1. **Nunca subir los fees por encima del tier actual** sin aviso público previo
2. **Bajar los fees según crece la adopción**, siguiendo la tabla publicada
3. **Ajustar el depósito mínimo** para mantener los costes accesibles a cualquier precio de EGLD
4. **Publicar todos los cambios on-chain**, verificables por cualquier persona

Porque un protocolo que cobra más cuando las cosas van bien no merece la confianza de sus usuarios. Y un protocolo que no gana dinero no puede sobrevivir para protegerlos.

**XCron está diseñado para encontrar ese equilibrio. Para siempre.**

---

*XCron Protocol — Automatización descentralizada para MultiversX*
*Modelo verificable on-chain. Febrero 2026.*
