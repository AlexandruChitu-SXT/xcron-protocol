# DriftLock™ — Protocolo de Control de Desviación para XCron

Este directorio implementa la metodología **DriftLock** diseñada para bloquear la desviación de alcance (*scope drift*) y asegurar la claridad y continuidad absoluta del contexto del proyecto XCron a lo largo del tiempo, sin importar el cambio de hilos de conversación de la IA.

## ¿Qué es DriftLock?
Es un sistema en cuatro etapas secuenciales que elimina la desviación de objetivos e implementa disciplina rigurosa de desarrollo:

```
[1. BRAINSTORM] --------> [2. DESIGN] --------> [3. BRIDGE] --------> [4. EXECUTION]
 (CIB1 -> CIB2)           (CIB2 -> CIB3)       (CIB3 -> CIB4)        (CIB4 -> Output)
        ^                                                                  |
        |                                                                  v
        +--------------- [NEXT CYCLE CIB1 (Feed Loop)] <----------- [EEB: EXIT BLOCK]
```

---

## Estructura de Bloques de Inyección de Contexto (CIB)

Cada etapa lee únicamente el bloque anterior (**Input CIB**) y produce exclusivamente el bloque siguiente (**Output CIB**). Los bloques se representan en markdown para inyección inmediata en la memoria del agente.

1. **CIB1 — Brainstorming Input**: Captura de ideas libres, requerimientos crudos del usuario, transcripciones de chat y notas del sistema.
2. **CIB2 — Design Input**: Definición de la dirección técnica elegida, eliminación de ambigüedad, selección de patrones y estructuras de datos.
3. **CIB3 — Bridge Input**: Traducción del diseño técnico en un plan de implementación formal estructurado archivo por archivo.
4. **CIB4 — Execution Input**: Checklist de tareas secuenciales con pre/post condiciones y reporte de pruebas.
5. **EEB (Execution Exit Block)**: El bloque de salida seguro. Captura hallazgos críticos, errores conocidos, decisiones validadas y el estado para el siguiente ciclo. Se inyecta como CIB1 del ciclo posterior si se abre un nuevo chat.

---

## Reglas Duras (Hard Rules)

1. **Una Etapa a la Vez**: No se permite escribir código de producción durante las fases 1 y 2.
2. **Límites de Fase Strict**: Solo los CIBs validados y completados pueden actuar como entrada para la siguiente fase.
3. **Prohibida la Reinterpretación**: Una vez cerrado el CIB de diseño (CIB2), no se puede reinterpretar la dirección a menos que se regrese explícitamente a Brainstorming y se actualice el CIB.
4. **Cero Desviación (*Zero Drift*)**: No se permite la expansión del alcance técnico a mitad del ciclo. Cualquier idea paralela se anota en el EEB para el siguiente ciclo.
