# CIB1 (Brainstorming) - Transferencias Confidenciales y Balances Privados

## 1. Estado Actual en el Código Base (XCron Protocol)

Tras revisar el código (en `/contracts/scheduler/src/` y `/xse-protocol/`), he confirmado lo siguiente:

- **SÍ TENEMOS "Confidential Execution" (XSE / ZK-PQ):**
  A través de `confidential: bool` en las tareas de Quantum y `scheduleSovereignTask`, el protocolo permite que los **payloads de ejecución**, las condiciones de triggering y la lógica estén encriptados y procesados off-chain dentro de un TEE (Enclave). La verificación se hace on-chain mediante `settleXseTask` usando pruebas ZK-SNARK (Groth16) que verifican la firma Post-Quantum (Dilithium) y el hash de estado.
  
- **NO TENEMOS Transferencias Confidenciales ni Balances Privados On-Chain:**
  El asentamiento (`settleXseTask`) finalmente ejecuta `self.tx().to(target_contract)...`. Esto significa que los cambios de estado resultantes en L1 (MultiversX), incluyendo transferencias de EGLD/ESDT, cantidades (`target_args`) y balances de las wallets, **son completamente públicos**. El Ledger de MultiversX por defecto es transparente.

## 2. Investigación: ¿Cómo conseguir Transferencias Confidenciales y Balances Privados On-Chain en MultiversX?

Para lograr que los saldos y las cantidades transferidas sean privados (modelo Zcash/Monero/Aztec), necesitamos abstraer el estado de L1 usando criptografía ZK (Zero-Knowledge) o FHE (Fully Homomorphic Encryption).

### Alternativas Viables:

1. **Shielded Pool Contract (Modelo UTXO con ZK-SNARKs)**
   - **Concepto:** Construir un smart contract "Vault" (Shielded Pool) donde los usuarios depositen EGLD/ESDT público y se "acuñen" notas privadas (UTXOs representados como commitments en un Merkle Tree on-chain).
   - **Transferencias Privadas:** Un usuario genera una prueba ZK off-chain demostrando que posee notas que suman `X`, invalida esas notas publicando "nullifiers" en el contrato, y crea nuevas notas para el destinatario. Todo on-chain es un hash y una prueba ZK; las cantidades y los destinatarios permanecen ocultos.
   - **Viabilidad en XCron:** Alta. Ya tenemos infraestructura de `zk_prover` (SP1/Risc0) y un `zk_verifier` en los smart contracts. Podemos extender la infraestructura de XCron Keeper para que actúe como "Relayer" de estas transacciones privadas (pagando el gas en nombre del usuario a cambio de una fee, garantizando anonimato total del sender).

2. **FHE (Fully Homomorphic Encryption)**
   - **Concepto:** Los balances se guardan encriptados en el storage del contrato. Las transferencias se realizan enviando operaciones matemáticas encriptadas que el contrato aplica sin desencriptar los datos.
   - **Viabilidad en XCron:** Baja a corto plazo. MultiversX no soporta precompilados FHE, y calcular operaciones FHE directamente en WASM superaría los límites de gas (Gas Limit = 600M).

3. **Stealth Addresses (Privacidad del Destinatario, pero cantidades públicas)**
   - **Concepto:** Usar criptografía de curva elíptica para generar una dirección de un solo uso por cada transferencia. El destinatario es la única persona con la clave privada para derivar los fondos.
   - **Viabilidad en XCron:** Muy Alta y barata. Ya se usa en Ethereum (EIP-5564). Oculta "quién" recibe el dinero, pero **no** oculta "cuánto" dinero se envió. No resuelve el problema de "cantidades privadas" que pides.

## 3. Conclusión y Propuesta Inicial

Para tener **cantidades y balances privados on-chain**, la única solución real y criptográficamente segura en MultiversX hoy es implementar un **Shielded UTXO Pool** (similar a Tornado Cash Nova o Aztec). 

Dado que **XCron ya tiene una red de Keepers y un Prover ZK-PQ off-chain**, podemos aprovechar los Keepers para que ensamblen y envíen las pruebas ZK al smart contract. Esto crearía un ecosistema DeFi privado e irrastreable integrado directamente en XCron.

## Próximos Pasos (Pendiente de Aprobación):
¿Avanzamos con el diseño arquitectónico (CIB2) para un **Shielded UTXO Pool Contract** que se integre con los Keepers de XCron?
