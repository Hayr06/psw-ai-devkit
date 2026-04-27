# DevKit Agents

## Agente Principal

### @orchestrator

**Rol:** Hub principal - único punto de contacto con el desarrollador.

**Descripción:** Coordina todo el flujo de desarrollo usando metodología Superpowers y skills .NET técnicos.

**Ubicación:** `.opencode/agents/orchestrator.md`

---

## Subagentes (invocados automáticamente)

El Orchestrator invoca estos subagentes según necesidad:

| Subagente | Trigger |
|-----------|---------|
| `@code-reviewer` | Después de implementar tareas |
| `@vision-analyst` | Análisis de imágenes UI/UX |
| `@rag-specialist` | Búsqueda en documentos RAG |
| `@multi-tenant-specialist` | Solo si el proyecto requiere multi-tenant |

Los subagentes se invocan via Task tool, no son visibles directamente al desarrollador.

---

## Flujo de Trabajo

```
DESARROLLADOR → @orchestrator → [BRAINSTORMING] → [PLANNING] → [IMPLEMENTATION] → [VERIFY]
```

### Fases

| Fase | Skill | Gate |
|------|-------|------|
| 1. Brainstorming | `brainstorming` | OBLIGATORIO antes de crear código |
| 2. Planning | `writing-plans` | Después de diseño aprobado |
| 3. Implementation | `test-driven-development` + skills .NET | TDD obligatorio |
| 4. Verification | `verification-before-completion` | Evidencia antes de claims |

---

## Skills por Contexto

El Orchestrator auto-dispara skills según el contexto:

| Contexto | Skills |
|----------|--------|
| Nuevo proyecto | `scaffolding`, `clean-arch-design` |
| Dominio/DDD | `ddd-aggregate`, `domain-analysis` |
| API Gateway | `yarp-config`, `jwt-auth`, `rate-limiting` |
| Frontend Blazor | `blazor-component`, `blazor-authentication`, `fluentui-blazor` |
| Microservicios | `dapr-microservices` |
| Multi-tenant | `ef-core-filters`, `row-level-security`, `tenant-resolution` |
| Base de datos | `sql-optimization`, `sql-code-review`, `dapper-reading` |
| Documentos | `document-export` |

---

## Comandos

| Comando | Descripción |
|---------|-------------|
| `/start` | Sesión completa con brainstorming |
| `/brainstorm` | Solo diseño |
| `/plan` | Crear plan de implementación |
| `/execute` | Ejecutar plan |
| `/poc` | Prueba de concepto rápida |
| `/test` | Tests con coverage |
| `/review` | Code review |
| `/migrate` | Migrar monolito a microservicios |