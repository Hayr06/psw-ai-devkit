# Metodología Superpowers - Workflow para Agentes

## Principios Fundamentales

1. **Diseño ANTES de código** - Todo proyecto requiere spec aprobada
2. **TDD** - Test-Driven Development obligatorio
3. **Evidencia sobre afirmaciones** - Verificar antes de claim
4. **YAGNI** - You Aren't Gonna Need It
5. **DRY** - Don't Repeat Yourself

## Flujo Completo

```
DISEÑO → SPEC → PLAN → EJECUCIÓN → REVIEW → MERGE
```

---

## Fase 1: Brainstorming (OBLIGATORIO)

### Gate: HARD

NO se puede escribir código sin spec aprobada.

### Proceso

1. Explorar contexto del proyecto
2. Hacer preguntas clarificadoras (una a la vez)
3. Proponer 2-3 enfoques con trade-offs
4. Presentar diseño por secciones
5. Obtener aprobación por sección
6. Escribir spec document
7. Auto-review del spec
8. Usuario aprueba spec

### Output

`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`

---

## Fase 2: Writing Plans

### Proceso

1. Mapear archivos a crear/modificar
2. Descomponer en tareas pequeñas (2-5 min)
3. Cada tarea con file paths exactos
4. Cada paso con código completo
5. Verificación por paso

### Output

`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

---

## Fase 3: Implementation

### Con TDD

1. Escribir test fallando
2. Ver que falla
3. Escribir código minimal para pasar
4. Ver que pasa
5. Refactorizar

### Con Subagentes

- Un subagent por tarea
- Review de spec compliance
- Review de code quality

---

## Fase 4: Verification

### Antes de claim completion

1. Identificar comando de verificación
2. Ejecutar comando completo
3. Leer output
4. Verificar contra claim
5. SOLO entonces claim

---

## Skills de Metodología

### brainstorming
**Cuando:** Antes de cualquier creación de código
**Gate:** HARD - No se puede saltar

### test-driven-development
**Cuando:** Implementando cualquier feature o bugfix
**Ley:** SIN CÓDIGO DE PRODUCCIÓN SIN UN TEST FALLANDO PRIMERO

```
RED - Escribir test fallando
GREEN - Código minimal para pasar
REFACTOR - Limpiar
```

### verification-before-completion
**Cuando:** A punto de claimar que trabajo está completo
**Gate:** Evidencia ANTES de afirmaciones

```
❌ "Tests deberían pasar ahora"
✅ [Run: dotnet test] [See: 0 failures] "All tests pass"
```

### systematic-debugging
**Cuando:** Encontrando cualquier bug o test failure
**Regla:** SIN FIXES SIN INVESTIGACIÓN DE CAUSA RAÍZ PRIMERO

```
Fase 1: Investigar causa raíz
Fase 2: Análisis de patrón
Fase 3: Hipótesis y testing
Fase 4: Implementación
```

---

## Red Flags - STOP

| Señal | Significado |
|-------|-------------|
| "Simple, no necesita diseño" | Siempre necesita diseño |
| "Voy a testear después" | Tests-after = no verifica nada |
| "Ya lo probé manualmente" | Ad-hoc no es sistemático |
| "Un fix rápido" | Fixear síntomas es fracaso |
| "Debería funcionar" | Sin evidencia = sin claim |

---

## Integración con .NET DevKit

El Orchestrator coordina automáticamente:

1. **Skills se auto-disparan** según contexto
2. **Subagentes** se invocan via Task tool
3. **Gates obligatorios** impiden skipping
4. **Evidencia** requerida antes de claims

---

## Anti-Patrones

### "Esto es muy simple para un diseño"
Todo proyecto necesita diseño. "Simple" es donde suposiciones no examinadas causan trabajo desperdiciado.

### "Escribiré tests después"
Tests passing inmediatamente no prueban nada. Test-first prueba que el test realmente prueba algo.

### "Ya lo probé manualmente"
Testing manual es ad-hoc. No hay record, no se puede re-run.

### "Un fix rápido"
Fijos random crean nuevos bugs. Systematic debugging es más rápido.

### "Lo borraré después"
Código sin tests es technical debt. Mejor no escribirlo que escribirlo sin tests.