---
name: compliance-check
description: Valida arquitectura, coverage, seguridad, secrets y conformance al contexto empresarial
trigger: "compliance, validación, quality gates, security scan, coverage"
---

# Compliance Check Skill

Valida que el código cumple con las reglas del equipo antes de merge/PR.

## Checklist de Validación

### Arquitectura
- [ ] Clean Architecture layers respetados
- [ ] Domain sin dependencias externas
- [ ] Application solo依赖Domain e Infrastructure
- [ ] Database-per-service respetado

### Código
- [ ] Coverage >= 80%
- [ ] Cyclomatic complexity <= 10
- [ ] No code smells críticos
- [ ] Tests pasando

### Seguridad
- [ ] No secrets en código
- [ ] JWT validation configurado
- [ ] Input validation en APIs
- [ ] SQL injection prevention

### Convenciones
- [ ]命名 convention respetada
- [ ] File organization correcta
- [ ] Documentation actualizada

## Comandos de Verificación

```bash
# Build
dotnet build --no-incremental

# Test con coverage
dotnet test --verbosity normal --collect:"XPlat Code Coverage"

# Security scan (secrets)
git secrets --scan

# Dependency check
dotnet list package --include-transitive | grep -v "Transitive"
```

## Skills Auto-invocados

- `verification-before-completion` - Gate de calidad
- `test-driven-development` - TDD validation
- `sql-code-review` - SQL validation
- `security-check` - Security scan

## Integración CI/CD

```yaml
# GitHub Actions
- name: Compliance Check
  run: |
    dotnet build --no-incremental
    dotnet test --verbosity normal
    ./scripts/compliance-check.sh
```

## Reglas

1. **Todo debe pasar** - sin excepciones
2. **Evidence** - screenshots/logs como evidencia
3. **Bloquear merge** si no pasa
4. **Report** - generar reporte de compliance

## Pasos

1. Ejecutar dotnet build
2. Ejecutar dotnet test con coverage
3. Verificar coverage >= 80%
4. Ejecutar security scan
5. Verificar arquitectura
6. Generar reporte
