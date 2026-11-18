# Instalación en Windows (semillero PSW)

Deja tu PC lista para trabajar con OpenCode y el modelo de PSW: instala .NET 10, Node, Git, SQL Server LocalDB y
OpenCode 1.19.0, configura OpenCode y guarda tu llave personal.

## 1. Descarga

Abre **PowerShell** (no hace falta abrirlo como administrador, pero si winget lo pide, acepta) y ejecuta:

```powershell
$d = "$env:USERPROFILE\psw-install"; New-Item -ItemType Directory -Force $d | Out-Null
"PswDoctor.psm1","doctor.ps1","install.ps1","opencode.semillero.jsonc" | ForEach-Object {
  Invoke-WebRequest "https://raw.githubusercontent.com/Hayr06/psw-ai-devkit/main/install/windows/$_" -OutFile "$d\$_" -UseBasicParsing }
```
### 1.1 Variable de entorno

```powershell
$k = Read-Host "Pega tu llave"
[Environment]::SetEnvironmentVariable(
  "PSW_LLM_KEY", $k.Trim(), "User")
```

Si la red no deja descargar de GitHub, el organizador te da la carpeta `install\windows` en una USB; cópiala a
`%USERPROFILE%\psw-install`.

## 2. Instala

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\psw-install\install.ps1"
```

Te pedirá la llave que te dio el organizador. Pégala (no se ve al escribir) y presiona Enter. La llave es personal: no
la compartas ni la subas a ningún repositorio.

Para ver qué haría sin cambiar nada: agrega `-CheckOnly`.

## 3. Revisa

Al final se corre el diagnóstico. Puedes volver a correrlo cuando quieras:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\psw-install\doctor.ps1"
```

| Resultado | Qué hacer |
|---|---|
| `[OK]` | Nada. |
| `[FALTA]` | Sigue la indicación de la línea `->`. Si dice volver a correr `install.ps1`, hazlo en una ventana nueva de PowerShell. |
| `[PENDIENTE] Puerta de enlace` | El modelo no responde desde tu red. Avísale al organizador. |
| `[PENDIENTE] Modelo responde` (429) | El modelo está ocupado. Espera un minuto y vuelve a correr el diagnóstico. |
| `[PENDIENTE] Proxy` | Tu red sale por un proxy. Corre el comando de la línea `->` para que OpenCode también lo use. |

`[FALTA] Política de scripts` significa que PowerShell no dejará abrir `opencode` en una ventana nueva, aunque el diagnóstico sí corra.

Cuando todo esté en `[OK]`, cierra PowerShell, abre una ventana nueva y escribe `opencode`.
