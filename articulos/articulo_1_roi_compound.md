# ¿Se paga solo XCron? La matemática real del auto-compound en MultiversX

*Por Alejandro Chitu, Fundador de XCron Protocol*

---

Cuando le digo a alguien que XCron automatiza el compound de sus farms, la primera pregunta siempre es la misma:

**"¿Y cuánto cuesta?"**

Es la pregunta correcta. Si la automatización cuesta más de lo que produces, no tiene sentido. Así que hice los números. Números reales, verificables, sin inventar nada.

---

## ¿Qué es el compound y por qué importa la frecuencia?

Cuando tienes tokens en un farm (por ejemplo en xExchange), generas rewards. Si esos rewards los recoges y los reinviertes, empiezan a generar rewards sobre rewards. Es el interés compuesto — la misma magia que usan los bancos.

La diferencia está en **con qué frecuencia** reinviertes:

| Frecuencia | Compounds/año | APY real (con 20% APR) |
|---|---|---|
| 1 vez al año | 1 | 20.00% |
| Mensual | 12 | 21.94% |
| Semanal | 52 | 22.09% |
| **Diario** | **365** | **22.13%** |
| Cada 4 horas | 2.190 | 22.14% |

Fíjate: **la diferencia entre diario y cada 4 horas es solo 0.01%.** No justifica 6 veces más ejecuciones. El compound diario es el punto dulce.

Ese **+2.13% de APY extra** parece poco, pero en dinero real...

---

## ¿Cuánto dinero extra es ese 2.13%?

| Tu posición en el farm | Sin compound (manual 1x/año) | Con compound diario (XCron) | **Dinero extra/año** |
|---|---|---|---|
| $1.000 | $200 | $221 | +$21 |
| $3.000 | $600 | $664 | +$64 |
| $5.000 | $1.000 | $1.107 | +$107 |
| $10.000 | $2.000 | $2.213 | +$213 |
| $50.000 | $10.000 | $11.067 | +$1.067 |

---

## ¿Y cuánto cuesta XCron?

Depende de tu perfil. XCron tiene dos niveles de precio:

- **Starter** (depósitos pequeños, < 0.01 EGLD por tarea): **8% de fee**
- **Standard** (depósitos normales): **15% de fee**

Para compound diario durante un año (365 ejecuciones):

| Tier | Depósito por ejecución | Coste total/año | A $30/EGLD |
|---|---|---|---|
| Starter | 0.005 EGLD | 1.825 EGLD | **$55/año** |
| Standard | 0.01 EGLD | 3.65 EGLD | **$110/año** |

---

## El veredicto: ¿Se paga solo?

| Tu posición | Yield extra | Coste XCron (Starter) | **Profit neto** | ¿Vale la pena? |
|---|---|---|---|---|
| $1.000 | +$21 | $55 | **-$34** | ❌ |
| $2.000 | +$43 | $55 | **-$12** | ❌ |
| **$3.000** | **+$64** | **$55** | **+$9** | ✅ Punto de equilibrio |
| $5.000 | +$107 | $55 | **+$52** | ✅ |
| $10.000 | +$213 | $55 | **+$158** | ✅ Muy rentable |
| $50.000 | +$1.067 | $55 | **+$1.012** | 🔥 |

**Conclusión honesta:**
- **Menos de $3.000**: XCron no se paga solo con el yield extra. Pero te ahorras 18 horas al año de clicks repetitivos. Tú decides si eso vale $55.
- **Más de $3.000**: XCron se paga solo y te genera dinero extra. Automáticamente. Sin hacer nada.
- **$10.000+**: Es dinero que literalmente pierdes si NO usas XCron.

---

## ¿Y si EGLD sube mucho de precio?

Buena pregunta. Si EGLD pasa de $30 a $500, esos 0.005 EGLD por ejecución pasarían de $0.15 a $2.50. Demasiado caro.

Por eso XCron tiene un **modelo de ajuste dinámico**:

```
nuevo_deposito = deposito_base × √(precio_base / precio_actual)
```

En cristiano: si EGLD sube ×4, el depósito mínimo baja ÷2 (no ÷4). El resultado:

| Precio EGLD | Depósito/ejecución | Coste USD | Tu ahorro |
|---|---|---|---|
| $30 | 0.005 EGLD | $0.15 | — |
| $100 | 0.0027 EGLD | $0.27 | El coste solo subió ×1.8, no ×3.3 |
| $500 | 0.0012 EGLD | $0.60 | El coste solo subió ×4, no ×16.6 |

**Ambos ganamos.** Tú pagas un poco más en USD (pero no proporcionalmente), y el protocolo se mantiene sostenible. Nadie pierde.

---

## Lo que no tiene precio

18 horas al año de tu vida. Dos días completos de trabajo haciendo clicks repetitivos en xPortal. Eso es lo que ahorras.

No le pongo precio porque cada persona lo valora diferente. Pero piensa en lo que haces con esas 18 horas:

- Dormir sin poner alarmas para reclamar rewards
- Irte de vacaciones sin preocuparte de tus farms
- Dedicar ese tiempo a investigar nuevas oportunidades
- O simplemente descansar

XCron no es solo una herramienta de optimización financiera. Es **tranquilidad**.

---

*XCron Protocol — Automatización descentralizada para MultiversX*
*Datos verificados con la API de MultiversX mainnet. Febrero 2026.*
