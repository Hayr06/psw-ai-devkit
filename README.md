# PSW AI DevKit

DevKit para proyectos .NET Microservicios con OpenCode + Superpowers + Clean Architecture + DDD.

## Quick Start

### 1. Agregar a tu opencode.json

En tu proyecto, crea o edita `opencode.json`:

```json
{
  "plugin": ["psw-devkit@git+https://github.com/Hayr06/psw-ai-devkit.git"]
}
```

O para una version especifica (recomendado):

```json
{
  "plugin": ["psw-devkit@git+https://github.com/Hayr06/psw-ai-devkit.git#v1.0.0"]
}
```

### 2. Reiniciar OpenCode

```bash
opencode
```

### 3. Verificar instalacion

Al iniciar, deberias ver en los logs:
```
PSW DevKit v1.0.0 initialized
Enterprise context loaded
```

### 4. Usar el Orchestrator

```
@orchestrator
```

El orchestrator leera automaticamente el contexto empresarial y estara listo para ayudarte.

---

## Qué incluye este DevKit

### Agentes (7)

| Agente | Especialidad |
|--------|--------------|
| `@orchestrator` | Router de intenciones, coordinación |
| `@frontend-specialist` | Blazor WASM, MudBlazor, FluentUI |
| `@backend-specialist` | DDD, CQRS, Clean Architecture |
| `@devops-specialist` | Docker, CI/CD, Azure |
| `@migration-specialist` | Extracción bounded contexts |
| `@qa-specialist` | Testing, coverage, calidad |
| `@security-specialist` | JWT, secrets, OWASP |

### Skills (55+)

- **dotnet/**: 45+ skills técnicos (.NET 9/10, Blazor, DDD, EF Core, Dapr, etc.)
- **methodology/**: 16 skills Superpowers (TDD, brainstorming, etc.)
- **rag/**: Document retrieval y parsing
- **utils/**: Utilidades varias

### Scaffolding Templates (6)

| Template | Descripción |
|----------|--------------|
| `clean-arch-microservices` | Base microservicios CA+DDD+CQRS |
| `monolith-to-microservices` | Guía migración |
| `saas-starter` | SaaS multi-tenant completo |
| `api-gateway` | YARP Gateway standalone |
| `blazor-dashboard` | Dashboard admin MudBlazor |
| `event-sourcing` | Microservicio Event Sourcing |

### Commands Slash (13)

`/start`, `/brainstorm`, `/plan`, `/execute`, `/test`, `/review`, `/migrate`, `/onboard`, `/publish-skill`, `/metrics`, `/template-list`, `/rag-search`, `/mcp`

---

## Stack Tecnológico

- **.NET 10 / .NET 9 / .NET 8**
- **Clean Architecture + DDD + CQRS + MediatR**
- **Blazor WebAssembly** (standalone)
- **YARP** API Gateway
- **Dapr** (microservicios distribuidos)
- **SQL Server / PostgreSQL**
- **Docker + Docker Compose**

---

## Estructura del Plugin

```
.opencode/
├── agents/
│   ├── orchestrator.md
│   └── specialists/
│       ├── frontend-specialist.md
│       ├── backend-specialist.md
│       ├── devops-specialist.md
│       ├── migration-specialist.md
│       ├── qa-specialist.md
│       └── security-specialist.md
├── commands/
│   ├── brainstorm.md, execute-plan.md, migrate.md, ...
│   ├── onboard.md
│   ├── publish-skill.md
│   ├── metrics.md
│   └── template-list.md
├── context/
│   └── enterprise.yaml          # ← Contexto empresarial
├── plugins/
│   └── psw-devkit.js           # ← Plugin principal
├── skills/
│   ├── dotnet/                 # 40+ skills técnicos
│   ├── methodology/           # 15 skills Superpowers
│   ├── rag/                   # Document retrieval
│   └── utils/                 # Utilidades
├── scripts/
│   ├── setup.sh
│   ├── test-connections.sh
│   └── test-endpoints.sh
└── context/enterprise.yaml     # Contexto leido por orchestrator
```

---

## Reglas del Plugin

1. **Nunca código sin diseño aprobado** (brainstorming obligatorio)
2. **Siempre TDD** (RED-GREEN-REFACTOR)
3. **Evidence over claims** - verificar antes de declarar éxito
4. **YAGNI + DRY**
5. **Modelo-agnóstico** - funciona con cualquier LLM compatible OpenAI API

---

## Convenciones de Arquitectura

- **API Gateway**: solo routing, sin lógica de negocio
- **Database-per-service**: cada microservicio su propia DB
- **CQRS**: EF Core writes, Dapper reads
- **Minimal APIs**: preferido sobre Controllers
- **Blazor WASM**: HttpClient tipado, NUNCA ProjectReference al backend
- **Event-driven**: Dapr Pub/Sub

---

## Calidad Mínima

| Métrica | Target |
|---------|--------|
| Code Coverage | >= 80% |
| Cyclomatic Complexity | <= 10 |
| Build | `dotnet build --no-incremental` |
| Test | `dotnet test --no-build --verbosity normal` |

---

## Comandos del Orchestrator

```
/start         → Sesión completa con brainstorming
/brainstorm    → Diseño antes de crear
/plan          → Crear plan de implementación
/execute       → Ejecutar plan
/test          → Tests con coverage
/review        → Code review
/migrate       → Migrar monolito a microservicios
/onboard       → Onboarding nuevo desarrollador
/metrics       → Ver métricas del equipo
/template-list → Listar templates disponibles
```

---

## Funcionalidades Enterprise

### MCPs (Model Context Protocol)
El DevKit recomienda MCPs para enriquecer el contexto del agente:
- **nuget** - Buscar paquetes y versiones
- **github** - Issues, PRs y releases
- **postgresql** - Introspeccion de schema
- **docker** - Gestion de contenedores
- **fetch** - HTTP requests

Instalacion: `opencode mcp add <nombre>`
Configuracion: `.mcp.json`

### LSP Tools
Navegacion y refactoring con herramientas LSP nativas:
- `lsp_goto_definition` - Saltar a definicion
- `lsp_find_references` - Encontrar referencias
- `lsp_rename` - Renombrar globalmente
- `lsp_diagnostics` - Ver errores del compilador

### Background Analysis
Analisis en paralelo mientras desarrollas:
- Revision de arquitectura
- Scan de seguridad
- Analisis de calidad
- Check de dependencias

### IntentGate Avanzado
Router de intenciones que detecta automaticamente:
- Tipo de tarea (backend, frontend, infra, etc.)
- Modo de trabajo (normal, ultrawork, team)
- MCPs relevantes segun contexto
- LSP tools para refactoring

---

## Documentation

- [INSTALL.md](./.opencode/INSTALL.md) - Instalacion detallada
- [AGENTS.md](./docs/AGENTS.md) - Lista de agentes
- [METHODOLOGY.md](./docs/METHODOLOGY.md) - Metodologia Superpowers
