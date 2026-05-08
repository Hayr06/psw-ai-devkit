# API Gateway Template

Template para API Gateway YARP con autenticación centralizada y routing.

## Estructura

```
MyGateway.API/
├── Program.cs
├── appsettings.json
├── Configuration/
│   ├── GatewayConfig.cs
│   ├── AuthenticationConfig.cs
│   └── RateLimitConfig.cs
├── Middleware/
│   ├── TenantMiddleware.cs
│   └── CorrelationMiddleware.cs
├── Extensions/
│   └── ServiceCollectionExtensions.cs
└── clusters.json
```

## Características

### Routing
- Route-based routing a microservicios
- Cluster discovery dinámico
- Health check routing
- Weighted routing para blue-green

### Autenticación Centralizada
- JWT validation en gateway
- Claims propagation a servicios downstream
- Tenant resolution desde JWT
- Anonymous routes configurables

### Rate Limiting
- Per-tenant rate limits
- Global rate limits
- Redis-backed para distributed limiting

### Observabilidad
- OpenTelemetry tracing
- Correlation IDs
- Request/response logging

## Scaffolding Commands

```bash
# Crear proyecto
dotnet new webapi -n MyGateway.API -o src/MyGateway.API

# Agregar paquetes
dotnet add package Yarp.ReverseProxy
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
dotnet add package AspNetCoreRateLimit
dotnet add package OpenTelemetry.Extensions.Hosting
```

## Configuración

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder();

builder.Services.AddGatewayConfig()
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddRateLimiting()
    .AddOpenTelemetry();

var app = builder.Build();

app.UseCorrelationId();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiting();

app.MapYarp();

app.Run();
```

```json
// clusters.json
{
  "Clusters": {
    "identity": {
      "Destinations": {
        "identity1": {
          "Address": "http://identity-api"
        }
      }
    },
    "tenant": {
      "Destinations": {
        "tenant1": {
          "Address": "http://tenant-api"
        }
      }
    }
  }
}
```

## Convenciones

1. **Gateway = Solo routing** - sin lógica de negocio
2. **Stateless** - no estado en el gateway
3. **Health checks** - verificar servicios downstream
4. **Timeout configurable** - para servicios lentos

## Skills Relacionados

- `api-gateway-template` skill en `.opencode/skills/dotnet/api-gateway-template/`
- `yarp-config` - Configuración YARP
- `jwt-auth` - JWT validation
