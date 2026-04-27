# Monolith to Microservices Migration Template

Template y guia para migrar aplicaciones monoliticas a arquitectura de microservicios.

## Estrategia: Strangler Pattern

Mantener el monolito funcionando mientras se extraen funcionalidades una a una.

## Fases de Migracion

### Fase 1: Analisis
1. Identificar bounded contexts del monolito
2. Mapear dependencias entre modulos
3. Definir contratos de API
4. Identificar riesgos

### Fase 2: Preparacion
1. Configurar API Gateway (YARP)
2. Configurar Dapr sidecar
3. Crear estructura de microservicios
4. Establecer pipeline de CI/CD

### Fase 3: Extraccion
1. Extraer modulo mas independiente primero
2. Crear nuevo microservicio
3. Configurar routing en API Gateway
4. Migrar datos (database-per-service)
5. Validar con tests
6. Desplegar

### Fase 4: Repetir
Para cada bounded context:
1. Repetir Fase 3
2. Monitorear y ajustar
3. Eventually descomisionar modulo del monolito

## Bounded Contexts Comunes

| Contexto | Descripcion | Dependencies |
|---------|-------------|--------------|
| Identity | Auth, users, roles | Ninguno |
| Catalog | Products, categories | Ninguno |
| Inventory | Stock management | Catalog |
| Orders | Order processing | Catalog, Inventory |
| Customers | Customer data | Identity |
| Payments | Payment processing | Orders |
| Shipping | Logistics | Orders |

## Database-per-Service

```
Monolith DB                  Microservices DBs
┌─────────────────┐         ┌─────────────────┐
│  Shared DB      │   →     │  Identity DB    │
│  (monolitico)   │         ├─────────────────┤
│                 │         │  Catalog DB     │
│                 │         ├─────────────────┤
│                 │         │  Orders DB      │
└─────────────────┘         └─────────────────┘
```

## Patrones de Comunicacion

### Sync (Dapr Service Invocation)
```csharp
// Llamada directa entre servicios
await daprClient.InvokeMethodAsync<OrderDto>(
    "order-service",
    "/api/orders/{id}"
);
```

### Async (Dapr Pub/Sub)
```csharp
// Publicar evento
await client.PublishEventAsync(
    "pubsub",
    "order-created",
    orderCreatedEvent
);

// Suscribir
[Topic("pubsub", "order-created")]
public async Task Handle(OrderCreatedEvent evt)
{
    // Process event
}
```

## Saga Pattern para Transacciones Distribuidas

```csharp
// Crear orden (OrderService)
public async Task<Guid> CreateOrder(CreateOrderCommand cmd)
{
    var orderId = await _mediator.Send(cmd);
    
    // Publicar evento para actualizar inventario
    await _daprClient.PublishEventAsync(
        "pubsub",
        "order-initiated",
        new OrderInitiatedEvent(orderId, cmd.Items));
    
    return orderId;
}

// Reducir inventario (InventoryService)
[Topic("pubsub", "order-initiated")]
public async Task Handle(OrderInitiatedEvent evt)
{
    try
    {
        await _inventoryService.ReserveStock(evt.Items);
        await _daprClient.PublishEventAsync(
            "pubsub",
            "stock-reserved",
            new StockReservedEvent(evt.OrderId));
    }
    catch (InsufficientStockException)
    {
        await _daprClient.PublishEventAsync(
            "pubsub",
            "stock-rejected",
            new StockRejectedEvent(evt.OrderId));
    }
}
```

## Checklist de Migracion

- [ ] Bounded contexts identificados
- [ ] API Gateway configurado con YARP
- [ ] Dapr sidecar instalado
- [ ] Base de datos separada por servicio
- [ ] Contratos de API definidos
- [ ] Tests de integracion escritos
- [ ] Health checks implementados
- [ ] OpenTelemetry configurado
- [ ] Logging centralizado
- [ ] CI/CD pipeline establecido

## Riesgos y Mitigaciones

| Riesgo | Mitigacion |
|--------|------------|
| Datos inconsistentes | Saga pattern con compensations |
| Latencia de red | Circuit breaker + retry |
| Acoplamiento | Contratos de API estables |
| Fallos en cascada | Bulkhead pattern |
| Debugging distribuido | OpenTelemetry + correlacion IDs |
