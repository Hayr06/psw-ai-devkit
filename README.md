# PSW AI DevKit

DevKit para proyectos .NET Microservicios con OpenCode + Superpowers + Clean Architecture + DDD.

## Quick Start

### 1. Clone este repositorio como base para tu nuevo proyecto

```bash
git clone https://github.com/Hayr06/psw-ai-devkit.git mi-nuevo-proyecto
cd mi-nuevo-proyecto
```

### 2. Renombrar solución (opcional)

```bash
# Renombra el solution name en .sln si necesitas uno nuevo
# Por defecto está vacío - el orchestrator te ayudará a crearlo
```

### 3. Configurar OpenCode

Agrega esto a tu `opencode.json` (global o de proyecto):

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "devkit-dotnet@git+https://github.com/Hayr06/superpowers.git"
  ]
}
```

### 4. Instalar dependencias

```bash
bash .opencode/scripts/setup.sh
```

### 5. Iniciar OpenCode

```bash
opencode
```

---

## Qué incluye este DevKit

### Agentes
- `@orchestrator` - Agente principal, único punto de contacto con el desarrollador

### Skills (40+)
- **Metodología (Superpowers):** brainstorming, TDD, verification, debugging
- **.NET:** scaffolding, clean-architecture, DDD, Blazor, FluentUI, YARP, Dapr, EF Core
- **RAG:** document-retrieval, document-parsing

### Comandos
- `/start` - Sesión completa con brainstorming
- `/brainstorm` - Diseño antes de crear
- `/plan` - Crear plan de implementación
- `/execute` - Ejecutar plan
- `/test` - Tests con coverage
- `/review` - Code review
- `/migrate` - Migrar monolito a microservicios

### Scripts
- `setup.sh` - Instalar dependencias
- `test-endpoints.sh` - Probar /health de microservicios
- `test-connections.sh` - Probar SQL/Redis/Dapr

---

## Stack Tecnológico

- .NET 10 / .NET 9 / .NET 8
- Clean Architecture + DDD + CQRS + MediatR
- Blazor WebAssembly (standalone)
- YARP API Gateway
- Dapr (microservicios distribuidos)
- SQL Server / PostgreSQL
- Docker + Docker Compose

---

## Estructura del Proyecto

```
mi-proyecto/
├── .opencode/              # DevKit (config, plugins, skills, agents)
│   ├── plugins/
│   ├── agents/
│   ├── skills/
│   ├── commands/
│   └── scripts/
├── src/                    # Código fuente (vacío, orchestrator lo crea)
├── tests/                  # Tests (vacío)
├── scaffolding/             # Templates de arquitectura
└── docker-compose.yml      # Template de microservicios
```

---

## Primeros Pasos con el Orchestrator

1. Ejecuta `opencode`
2. El Orchestrator te guiará con el flujo completo:
   - `/start` → brainstorming → plan → implementación → tests → review
3. El Orchestrator creará la estructura del proyecto automáticamente

---

## Documentación

- [.opencode/INSTALL.md](.opencode/INSTALL.md) - Instalación detallada
- [docs/AGENTS.md](docs/AGENTS.md) - Lista de agentes y habilidades
- [docs/METHODOLOGY.md](docs/METHODOLOGY.md) - Metodología Superpowers

---

## Actualizaciones

El DevKit se actualiza automáticamente cuando reinicias OpenCode. Para versiones específicas, consulta el tag en el plugin.

---

## Soporte

Para issues: https://github.com/Hayr06/psw-ai-devkit/issues