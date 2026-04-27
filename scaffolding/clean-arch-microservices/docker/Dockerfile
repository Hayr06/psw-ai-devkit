# Multi-Container Dockerfile para .NET Microservices

# Solution Dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copiar solution y restore
COPY [SolutionName].sln .
COPY src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].Domain/[ServiceName].Services.[BC].Domain.csproj src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].Domain/
COPY src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].Application/[ServiceName].Services.[BC].Application.csproj src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].Application/
COPY src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].Infrastructure/[ServiceName].Services.[BC].Infrastructure.csproj src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].Infrastructure/
COPY src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].API/[ServiceName].Services.[BC].API.csproj src/[ServiceName].Services.[BoundedContext]/[ServiceName].Services.[BC].API/

RUN dotnet restore

# Copiar todo el codigo y build
COPY src/ src/
RUN dotnet build -c Release --no-restore

# Publicar
RUN dotnet publish -c Release --no-build -o /app/publish

# Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Instalar Dapr
RUN wget -q https://raw.githubusercontent.com/dapr/cli/master/install/install.sh && bash install.sh && mv /usr/local/bin/dapr /usr/local/bin/dapr && rm install.sh

COPY --from=build /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

EXPOSE 5000

ENTRYPOINT ["dotnet", "[ServiceName].Services.[BC].API.dll"]
