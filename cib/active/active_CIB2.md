# CIB2 - Diseño (Iteración 3 - Red Team Feedback)

**Vulnerabilidad Adicional: Proof Forgery y Hash Collision**
- **Causa:** `submit_proof` no verifica que el caller sea un Keeper autorizado. Además, la concatenación `claimed_value` + `salt` permite colisiones de hash (ej. `12` + `34` vs `1` + `234`).
- **Diseño de Solución (Red Team):**
  1. Integrar validación de Keeper: Solo direcciones autorizadas (o comunicándose con el KeeperRegistry) pueden enviar y verificar pruebas. Para no complicar llamadas síncronas excesivas, el ZK-Verifier puede tener un mapper `whitelist_keepers` administrado por el owner/scheduler.
  2. Hash Delimiter: Añadir un delimitador estricto (`|` o similar) o serialización segura (byte length prefix) al calcular el hash para prevenir colisiones.

**Regla Aplicable:** Safety Development Loop.
