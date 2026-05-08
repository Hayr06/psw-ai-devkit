# Event Sourcing Template

Microservicio con Event Sourcing + CQRS para trazabilidad completa.

## Estructura

```
MyService/
├── src/
│   ├── MyService.Domain/
│   │   ├── Aggregates/
│   │   ├── Events/
│   │   └── ValueObjects/
│   ├── MyService.Application/
│   │   ├── Commands/
│   │   ├── Queries/
│   │   ├── Handlers/
│   │   └── Services/
│   ├── MyService.Infrastructure/
│   │   ├── EventStore/
│   │   │   ├── IEventStore.cs
│   │   │   └── MongoEventStore.cs
│   │   ├── Projections/
│   │   └── Repositories/
│   └── MyService.API/
└── tests/
```

## Event Sourcing Conceptos

### Aggregate Root con Eventos

```csharp
public class Order : AggregateRoot
{
    public OrderStatus Status { get; private set; }
    private readonly List<IDomainEvent> _events = new();

    public Order(IEnumerable<IDomainEvent> events)
    {
        foreach (var @event in events)
            Apply(@event);
    }

    public void PlaceOrder()
    {
        Apply(new OrderPlacedEvent(Id, DateTime.UtcNow));
    }

    protected override void When(IDomainEvent @event)
    {
        switch (@event)
        {
            case OrderPlacedEvent e:
                Status = OrderStatus.Placed;
                break;
        }
    }
}
```

### Event Store Interface

```csharp
public interface IEventStore
{
    Task<IEnumerable<IDomainEvent>> GetEventsAsync(Guid aggregateId);
    Task AppendAsync(Guid aggregateId, IEnumerable<IDomainEvent> events);
    Task<IEnumerable<T>> GetProjectionsAsync<T>(string projectionName);
}
```

## CQRS en Event Sourcing

### Commands (Writes)
- Generan nuevos eventos
- Validan business rules
- Aplican al aggregate

### Queries (Reads)
- Proyecciones desde event store
- Materialized views
- Dapper para reads optimizados

## Scaffolding Commands

```bash
# Crear solución
dotnet new sln -n MyService

# Crear proyectos
dotnet new classlib -n MyService.Domain -o src/MyService/MyService.Domain
dotnet new classlib -n MyService.Application -o src/MyService/MyService.Application
dotnet new classlib -n MyService.Infrastructure -o src/MyService/MyService.Infrastructure
dotnet new webapi -n MyService.API -o src/MyService/MyService.API

# Agregar paquetes
dotnet add package MongoDB.Driver
dotnet add package Dapr.Client
```

## Cuándo Usar Event Sourcing

### Pros
- Completa trazabilidad
- Audit trail automático
- Replay de eventos
- Time-travel debugging

### Cons
- Eventual consistency
- Complejidad adicional
- Proyecciones asíncronas

## Skills Relacionados

- `event-sourcing-template` skill en `.opencode/skills/dotnet/event-sourcing-template/`
- `ddd-aggregate` - Aggregates
- `clean-arch-design` - Arquitectura
