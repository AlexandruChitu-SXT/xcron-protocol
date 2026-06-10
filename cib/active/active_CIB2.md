# CIB2 (Design) - Unbreakable Shielded Pool v2.1

Arquitectura consolidada (Grok + Gemini) para el protocolo híbrido de privacidad de XCron.

## 1. El Flujo de Usuario (Magia Web2)
- El remitente envía cifrado con **ML-KEM (Kyber)**. Paga la cantidad + Privacy Fee.
- El receptor no hace nada. Recibe el balance de forma nativa en su wallet. El Smart Contract corta el vínculo entre el origen y el destino.

## 2. Nivel 1: Blindaje del TEE
- **Pool 4-de-7:** Mínimo 7 Keepers en hardware diverso (Intel, AMD, AWS, ARM). Se requiere que 4 firmen para validar la transacción (Threshold ML-DSA).
- **Attestation L1:** El contrato verifica los PCRs de los 4 Keepers.

## 3. Nivel 2: Smart Contract (Anti-DoS & Replay)
- **Replay 2.0:** `hash(user_nonce + timestamp + keeper_id + payload)`.
- **Cobro Directo:** Tarifa Premium cobrada automáticamente por transacción.
- **Escape Hatch (15 min):** Basado en bloques (~1500 bloques de Supernova a 600ms). Si el sistema falla, retiro asegurado.

## 4. Nivel 3: Sistema de Centinelas Descentralizado
- Detección de ataques térmicos/voltaje en menos de 1 segundo.
- **Verdugo 3-de-7:** Para pausar el contrato en L1 por emergencia, deben coincidir al menos 3 centinelas independientes, eliminando el riesgo de que una sola máquina maliciosa bloquee la red.
