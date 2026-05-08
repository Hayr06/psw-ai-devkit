# SaaS Starter Template

Template completo para proyecto SaaS multi-tenant con todas las funcionalidades empresariales.

## Estructura

```
MySaas.sln
├── src/
│   ├── MySaas.Services.Identity/           # Auth Service
│   │   ├── MySaas.Services.Identity.Domain/
│   │   ├── MySaas.Services.Identity.Application/
│   │   ├── MySaas.Services.Identity.Infrastructure/
│   │   └── MySaas.Services.Identity.API/
│   ├── MySaas.Services.Tenant/            # Tenant Management
│   │   ├── MySaas.Services.Tenant.Domain/
│   │   ├── MySaas.Services.Tenant.Application/
│   │   ├── MySaas.Services.Tenant.Infrastructure/
│   │   └── MySaas.Services.Tenant.API/
│   ├── MySaas.Services.Billing/           # Billing & Subscriptions
│   ├── MySaas.Services.Administration/    # Admin Panel
│   ├── MySaas.API.Gateway/               # YARP Gateway
│   ├── MySaas.Client.Blazor/             # Blazor WASM Admin
│   └── MySaas.Shared/
└── tests/
    └── MySaas.Tests/
```

## Características

### Identity Service
- JWT authentication con refresh tokens
- User registration/login/logout
- Role-based access control (RBAC)
- Multi-tenant user isolation

### Tenant Management
- Tenant registration y activation
- Row-level security para aislamiento
- Tenant-specific configuration

### Billing Service
- Integration ready para Stripe/PayPal
- Subscription plans (Free, Pro, Enterprise)
- Usage-based billing hooks

### Administration
- Dashboard con métricas
- User management por tenant
- Audit logging

## Scaffolding Commands

```bash
# Crear solución
dotnet new sln -n MySaas

# Crear servicios
dotnet new classlib -n MySaas.Services.Identity.Domain -o src/MySaas.Services.Identity/MySaas.Services.Identity.Domain
dotnet new classlib -n MySaas.Services.Identity.Application -o src/MySaas.Services.Identity/MySaas.Services.Identity.Application
# ... (continuar para cada capa y servicio)

# Agregar al solution
dotnet sln add src/MySaas.Services.Identity/MySaas.Services.Identity.Domain/MySaas.Services.Identity.Domain.csproj
# ... (continuar para cada proyecto)

# Agregar referencias
dotnet add reference ../MySaas.Services.Identity.Domain/MySaas.Services.Identity.Domain.csproj
```

## Configuración

```yaml
# appsettings.json
{
  "ConnectionStrings": {
    "IdentityDb": "Server=sql;Database=MySaas.Identity",
    "TenantDb": "Server=sql;Database=MySaas.Tenant",
    "BillingDb": "Server=sql;Database=MySaas.Billing"
  },
  "Jwt": {
    "Issuer": "MySaas",
    "Audience": "MySaas.Client",
    "ExpirationMinutes": 60
  }
}
```

## Convenciones

1. **Clean Architecture** en cada microservicio
2. **Database-per-service** - cada servicio su propia DB
3. **CQRS** - EF Core writes, Dapper reads
4. **Event-driven** - Dapr Pub/Sub

## Skills Relacionados

- `saas-starter` skill en `.opencode/skills/dotnet/saas-starter/`
- `clean-arch-design` - Arquitectura
- `jwt-auth` - Autenticación
