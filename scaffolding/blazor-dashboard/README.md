# Blazor Dashboard Template

Dashboard administrativo con MudBlazor siguiendo el design system del equipo.

## Estructura

```
MyDashboard.Client/
├── Pages/
│   ├── Dashboard.razor
│   ├── Users/
│   │   ├── UserList.razor
│   │   └── UserEdit.razor
│   └── Settings/
├── Components/
│   ├── MetricCard.razor
│   ├── DataGrid.razor
│   └── LoadingOverlay.razor
├── Services/
│   ├── IDashboardService.cs
│   └── DashboardService.cs
├── Layout/
│   ├── MainLayout.razor
│   ├── NavMenu.razor
│   └── AppBar.razor
├── Program.cs
└── wwwroot/
```

## Características

### Dashboard
- Metric cards con gráficos
- Recent activity feed
- System health indicators
- Quick actions

### User Management
- DataGrid con paginación
- CRUD operations
- Role assignment

### Design System (contexto empresarial)

```css
/* Colors */
--primary: #594AE2;
--secondary: #717171;

/* Typography */
--font-family: 'Segoe UI', Roboto, sans-serif;

/* Spacing */
--spacing-unit: 8px;
--border-radius: 4px;
```

## Scaffolding Commands

```bash
# Crear proyecto Blazor WASM
dotnet new blazorwasm -n MyDashboard.Client -o src/MyDashboard.Client

# Agregar paquetes
dotnet add package MudBlazor
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
dotnet add package Refit.HttpClientFactory
```

## Configuración

```csharp
// Program.cs
builder.Services.AddMudServices();
builder.Services.AddJwtAuthentication();
builder.Services.AddScoped<IDashboardService, DashboardService>();

builder.Configuration.AddJsonFile("wwwroot/appsettings.json", optional: true);
```

```razor
@* MainLayout.razor *@
<MudThemeProvider @bind-IsDarkMode="_isDarkMode" />
<MudPopoverProvider />
<MudDialogProvider />
<MudSnackbarProvider />

<MudLayout>
    <MudAppBar>
        <MudIconButton Icon="@Icons.Material.Filled.Menu" OnClick="ToggleDrawer" />
        <MudText Typo="Typo.h6">My Dashboard</MudText>
        <MudSpacer />
        <MudIconButton Icon="@Icons.Material.Filled.Logout" />
    </MudAppBar>
    <MudNavMenu>
        <MudNavLink Href="/" Match="NavLinkMatch.All">Dashboard</MudNavLink>
        <MudNavLink Href="/users">Users</MudNavLink>
        <MudNavLink Href="/settings">Settings</MudNavLink>
    </MudNavMenu>
    <MudMainContent>
        @Body
    </MudMainContent>
</MudLayout>
```

## Convenciones Blazor WASM

1. **HttpClient tipado SIEMPRE**
2. **NUNCA ProjectReference al backend** - API Gateway only
3. **Lazy loading** para páginas pesadas
4. **Cascading authentication state**

## Skills Relacionados

- `blazor-dashboard-template` skill en `.opencode/skills/dotnet/blazor-dashboard-template/`
- `blazor-component` - Componentes
- `blazor-authentication` - Auth client-side
