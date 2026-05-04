# XCron Protocol — Social Media Log

Registro de todo lo publicado. Para no repetir ni contradecir.

---

## 2026-03-01 (~01:40) — Hilo Task Chaining + Clone-Keys (4 tweets)

**Tweet 1/4:**
> two new things on xcron — i was working on the automation logic and realized something obvious: if you automate two DeFi steps separately, there's nothing connecting them. the second one just fires blindly hoping the first already finished.
>
> that felt broken, so i fixed it 🧵

**Tweet 2/4:**
> task chaining — you link two tasks and the second one only executes if the first succeeds. no timing guesswork, no failed transactions, no wasted gas.
>
> simple idea, but once you use it for DeFi flows like claim → compound → stake, it clicks. each step waits for the previous one automatically.

**Tweet 3/4:**
> also built clone-keys — basically a burner wallet with a spending limit and an expiry date.
>
> you load it with what you need, set how long it lasts, and use it instead of your main wallet. if anything goes wrong, only that small balance is exposed. your real funds stay safe.

**Tweet 4/4:**
> both features are tested and working on testnet. next step is audit, then mainnet.
>
> i build the ideas and the design, AI helps me with the code. still learning, still building.
>
> xcron.io 🤙

---

## 2026-03-01 (~10:25) — On-chain vs Off-chain Architecture

**Tweet principal:**
> small but important update on xcron:
>
> moved price conditions from external APIs to reading directly from @xExchange liquidity pools — on-chain, verified, free (view functions cost zero gas on @MultiversX).
>
> broke down what's on-chain vs off-chain in the protocol:
>
> on-chain (100% verified):
> • task scheduling
> • deposits & payments
> • keeper rewards & slashing
> • price reading (xExchange views)
> • task chaining
> • clone-keys
>
> off-chain (necessary infrastructure):
> • keeper bot (monitors & executes)
> • AI optimization layer
>
> everything that touches money or decisions = on-chain.
> everything that monitors and reacts = off-chain.
>
> that's how it should be.

**Reply:**
> if you're curious about what else we shipped this week, check our recent thread on task chaining (linking tasks so they execute sequentially) and clone-keys (burner wallets with spending limits).
>
> building in public, one feature at a time 🔗🔑
>
> xcron.io

---

## Tweets anteriores (previas sesiones)

- Video promocional XCron
- Grant application anuncio
- Varios tweets de desarrollo en progreso

---

## Claims verificados (se puede decir públicamente)

- ✅ Task chaining nativo en scheduler on-chain — no encontrado en Chainlink, Gelato, Keep3r, CronCat, PowerPool, ni MultiversX
- ✅ Clone-Keys: delegación de wallet con spending limit + expiración
- ✅ View functions de xExchange son gratis (0 gas)
- ✅ Ejecución de tarea en MultiversX: ~$0.003
- ✅ 27/27 tests pasando
- ✅ AI-assisted development (honesto sobre uso de IA)

## Claims NO verificados (NO decir públicamente)

- ❌ "Somos los primeros en crypto" — no se puede verificar al 100%
- ❌ "Somos mejores que Chainlink" — resuelven problemas diferentes
- ❌ Datos de mainnet — solo tenemos testnet
- ❌ Números de usuarios — no hay usuarios reales aún

---

## 2026-03-20 (~12:56) — HFT y Stablecoins en Supernova

**Tweet principal (@AlejandroChitu):**
> Stablecoins that agents can use to automate tasks, payments & endless possibilities... in less time than a human blink. All powered by MultiversX's cutting-edge tech + ultra-low costs. 🌊🤖🦾
> 
> @XcronProtocol can wake up smart contracts and query on-chain data at breathtaking speeds by running custom bare-metal nodes that completely bypass Cloudflare limits.
> 
> The chronological math of Supernova's evolution proves it: ⏱️ At 600ms block times: We natively pull 10,000+ QPS. ⏱️ At 200ms block times: Our capacity scales perfectly to 30,000+ QPS. ⏱️ Pushing the future 88ms internal tests? We break past 68,000+ QPS with fully deterministic, cross-shard execution.
> 
> The gap between intent and execution is gone. Decentralized High-Frequency Trading (HFT) and sub-second cron-jobs are here. ⚡🔥
> @MultiversX #Supernova
