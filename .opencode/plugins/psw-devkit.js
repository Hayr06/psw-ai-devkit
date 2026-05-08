---
name: psw-devkit
description: Plugin DevKit para equipos .NET - Skills, agents, commands y scaffolding empresarial
version: 1.0.0
---

# PSW DevKit Plugin

Plugin distribuible para equipos de desarrollo .NET que automatiza:
- Skills técnicos .NET 9/10, Blazor, Clean Architecture, DDD, CQRS
- Agente orchestrator con detección automática de contexto
- Commands slash para flujo de desarrollo
- Scaffolding templates para proyectos SaaS, API Gateway, etc.

## Instalación

```json
{
  "plugin": ["psw-devkit@git+https://github.com/Hayr06/psw-ai-devkit.git"]
}
```

## Componentes

### Agentes
- `@orchestrator` - Agente principal con router de intenciones
- `@frontend-specialist` - Blazor WASM + MudBlazor/FluentUI
- `@backend-specialist` - DDD, CQRS, Clean Architecture
- `@devops-specialist` - Docker, CI/CD, infraestructura
- `@migration-specialist` - Extracción de bounded contexts
- `@qa-specialist` - Testing estratégico
- `@security-specialist` - JWT, secrets, vulnerabilidades

### Skills (50+)
- **dotnet/**: 35+ skills técnicos
- **methodology/**: 13 skills Superpowers
- **rag/**: Document retrieval y parsing
- **utils/**: Utilidades varias

### Commands
- `/start`, `/brainstorm`, `/plan`, `/execute`, `/test`, `/review`, `/migrate`
- `/onboard` - Onboarding nuevo desarrollador
- `/publish-skill` - Publicar skill internamente
- `/metrics` - Ver métricas del equipo
- `/template-list` - Listar templates disponibles

### Scaffolding Templates
- `saas-starter/` - Proyecto SaaS multi-tenant completo
- `api-gateway/` - Solo YARP Gateway
- `blazor-dashboard/` - Dashboard administrativo
- `event-sourcing/` - Microservicio con Event Sourcing
- `clean-arch-microservices/` - Template base (existente)
- `monolith-to-microservices/` - Guía migración (existente)

## Reglas del Plugin

1. **Modelo-agnóstico**: Funciona con cualquier LLM compatible OpenAI API
2. **Sin código sin diseño**: Brainstorming obligatorio antes de implementar
3. **TDD estricto**: RED-GREEN-REFACTOR siempre
4. **Evidence over claims**: Verificar antes de declarar éxito
5. **YAGNI + DRY**: No sobreingeniería

## Convenciones de Arquitectura

- **API Gateway**: Solo routing, sin lógica de negocio
- **Database-per-service**: Cada microservicio su propia DB
- **CQRS**: EF Core writes, Dapper reads
- **Minimal APIs**: Preferido sobre Controllers
- **Blazor WASM**: HttpClient tipado, NUNCA ProjectReference al backend
- **Event-driven**: Dapr Pub/Sub

## Stack Tecnológico por Defecto

- .NET 10 / .NET 9
- SQL Server / PostgreSQL
- Blazor WebAssembly (standalone)
- YARP API Gateway
- Dapr para microservicios distribuidos
- Docker + Docker Compose

## Calidad Mínima

- Coverage: 80% mínimo
- Complejidad ciclomática: <= 10
- Probar siempre: `dotnet build && dotnet test`
