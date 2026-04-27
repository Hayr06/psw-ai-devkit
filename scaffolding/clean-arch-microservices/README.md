# Clean Architecture Microservices Scaffolding

Template para crear nuevos microservicios siguiendo Clean Architecture + DDD + CQRS.

## Estructura del Proyecto

```
[SolutionName].sln
├── src/
│   ├── [ServiceName].Services.Identity/           # Identity Service
│   │   ├── [ServiceName].Services.Identity.Domain/
│   │   ├── [ServiceName].Services.Identity.Application/
│   │   ├── [ServiceName].Services.Identity.Infrastructure/
│   │   └── [ServiceName].Services.Identity.API/
│   │
│   ├── [ServiceName].Services.[BoundedContext]/   # Cada BC = 1 microservicio
│   │   ├── [ServiceName].Services.[BC].Domain/
│   │   ├── [ServiceName].Services.[BC].Application/
│   │   ├── [ServiceName].Services.[BC].Infrastructure/
│   │   └── [ServiceName].Services.[BC].API/
│   │
│   ├── [ServiceName].API.Gateway/               # YARP API Gateway
│   │   ├── Program.cs
│   │   └── appsettings.json
│   │
│   ├── [ServiceName].Client.Blazor/             # Blazor WASM Client
│   │   ├── Program.cs
│   │   └── Pages/
│   │
│   └── [ServiceName].Shared/                     # Shared Kernel
│       ├── Constants/
│       ├── Enums/
│       └── Exceptions/
│
└── tests/
    └── [ServiceName].Tests/
```

## Por cada Capa

### Domain Layer
- **Entities/** - Entidades con identidad
- **ValueObjects/** - Objetos valor inmutables
- **Aggregates/** - Aggregates raiz
- **DomainEvents/** - Eventos de dominio
- **Interfaces/** - Contratos para repositorios

### Application Layer
- **Commands/** - CQS Commands (Create, Update, Delete)
- **Queries/** - CQS Queries (Read)
- **Handlers/** - MediatR handlers
- **DTOs/** - Data Transfer Objects
- **Interfaces/** - Contratos de servicios
- **Behaviors/** - MediatR pipeline behaviors

### Infrastructure Layer
- **Data/** - DbContext, Configurations
- **Repositories/** - Implementaciones de repos
- **Services/** - Servicios externos

### API Layer
- **Endpoints/** - Minimal API endpoints
- **Middleware/** - Custom middleware
- **Extensions/** - Extension methods

## Commands de Scaffolding

### Crear nuevo microservicio
```bash
dotnet new sln -n [SolutionName]
dotnet new classlib -n [ServiceName].Services.[BC].Domain -o src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].Domain
dotnet new classlib -n [ServiceName].Services.[BC].Application -o src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].Application
dotnet new classlib -n [ServiceName].Services.[BC].Infrastructure -o src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].Infrastructure
dotnet new webapi -n [ServiceName].Services.[BC].API -o src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].API
```

### Agregar al solution
```bash
dotnet sln add src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].Domain/[ServiceName].Services.[BC].Domain.csproj
dotnet sln add src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].Application/[ServiceName].Services.[BC].Application.csproj
dotnet sln add src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].Infrastructure/[ServiceName].Services.[BC].Infrastructure.csproj
dotnet sln add src/[ServiceName].Services.[BC]/[ServiceName].Services.[BC].API/[ServiceName].Services.[BC].API.csproj
```

### Agregar referencias entre capas
```bash
# Domain no referencia nada
# Application referencia Domain
dotnet add reference ../[ServiceName].Services.[BC].Domain/[ServiceName].Services.[BC].Domain.csproj
# Infrastructure referencia Application + Domain
dotnet add reference ../[ServiceName].Services.[BC].Application/[ServiceName].Services.[BC].Application.csproj
dotnet add reference ../[ServiceName].Services.[BC].Domain/[ServiceName].Services.[BC].Domain.csproj
# API referencia Application
dotnet add reference ../[ServiceName].Services.[BC].Application/[ServiceName].Services.[BC].Application.csproj
```

## NuGet Packages Tipicos

### Domain
- (ninguno, puro C#)

### Application
- MediatR
- FluentValidation

### Infrastructure
- Microsoft.EntityFrameworkCore
- Pomelo.EntityFrameworkCore.MySql (o Npgsql.EntityFrameworkCore.PostgreSQL)
- Dapr.Client

### API
- Microsoft.AspNetCore.Authentication.JwtBearer
- Yarp.ReverseProxy
- OpenTelemetry.Extensions.Hosting
- Polly

## Convenciones

1. **Entidades**: `EntityName.cs` con `Guid Id`
2. **Value Objects**: `ValueObjectName.cs` inmutables
3. **Commands/Queries**: `[Action][Entity]Command/Query.cs`
4. **Handlers**: `[Action][Entity]Handler.cs`
5. **DTOs**: `[Entity]Dto.cs`
6. **Endpoints**: `[Entity]Endpoints.cs`

## Ejemplo de Aggregate

```csharp
// Domain/Entities/Order.cs
public class Order : AggregateRoot
{
    public Guid Id { get; private set; }
    public OrderStatus Status { get; private set; }
    public IReadOnlyList<OrderItem> Items => _items.AsReadOnly();
    
    private readonly List<OrderItem> _items = new();
    
    // Factory method
    public static Order Create(Guid customerId)
    {
        var order = new Order
        {
            Id = Guid.NewGuid(),
            Status = OrderStatus.Pending
        };
        
        order.AddDomainEvent(new OrderCreatedEvent(order));
        return order;
    }
    
    public void AddItem(Product product, int quantity)
    {
        // Business rules
        var item = new OrderItem(product, quantity);
        _items.Add(item);
    }
}
```
