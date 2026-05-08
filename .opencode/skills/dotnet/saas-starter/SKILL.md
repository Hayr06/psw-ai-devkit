---
name: saas-starter
description: Scaffold completo de SaaS multi-tenant con auth, billing, admin y arquitectura lista para producción
trigger: "nuevo proyecto saas, crear saas, multi-tenant, billing, subscription"
---

# SaaS Starter Skill

Crea un proyecto SaaS multi-tenant completo con todas las funcionalidades empresariales.

## Estructura del Proyecto

```
MySaas.sln
├── src/
│   ├── MySaas.Services.Identity/           # Auth Service
│   │   ├── MySaas.Services.Identity.Domain/
│   │   ├── MySaas.Services.Identity.Application/
│   │   ├── MySaas.Services.Identity.Infrastructure/
│   │   └── MySaas.Services.Identity.API/
│   ├── MySaas.Services.Tenant/            # Tenant Management
│   ├── MySaas.Services.Billing/           # Billing & Subscriptions
│   ├── MySaas.Services.Administration/    # Admin Panel
│   ├── MySaas.API.Gateway/               # YARP Gateway
│   ├── MySaas.Client.Blazor/             # Blazor WASM Admin
│   └── MySaas.Shared/
└── tests/
```

## Características Incluidas

### Identity Service
- JWT authentication con refresh tokens
- User registration/login/logout
- Role-based access control (RBAC)
- Multi-tenant user isolation

### Tenant Management
- Tenant registration y activation
- Row-level security para aislamiento
- Tenant-specific configuration
- Subscription tier management

### Billing Service
- Stripe/PayPal integration ready
- Subscription plans (Free, Pro, Enterprise)
- Usage-based billing hooks
- Invoice generation

### Administration
- Dashboard con métricas
- User management por tenant
- Audit logging
- System health monitoring

## Skills Auto-invocados

- `scaffolding` - Base del scaffold
- `clean-arch-design` - Arquitectura
- `jwt-auth` - Autenticación
- `multi-tenant` - Aislamiento
- `blazor-dashboard-template` - UI admin

## Reglas

1. **Clean Architecture** en cada microservicio
2. **Database-per-service** - cada servicio su propia DB
3. **CQRS** - EF Core writes, Dapper reads
4. **Event-driven** - Dapr Pub/Sub para cross-service events
5. **TDD** - tests para cada feature

## Pasos

1. Invocar brainstorming para validar diseño
2. Crear estructura con dotnet new commands
3. Implementar cada servicio con TDD
4. Configurar YARP gateway
5. Crear Blazor admin client
6. Verificar: `dotnet build && dotnet test`
