# Revisa que esta PC esté lista para el semillero.
# Uso: powershell -ExecutionPolicy Bypass -File doctor.ps1 [-BaseUrl <url>] [-Key <llave>]
[CmdletBinding()]
param([string]$BaseUrl, [string]$Key)

Import-Module (Join-Path $PSScriptRoot 'PswDoctor.psm1') -Force

$params = @{}
if ($PSBoundParameters.ContainsKey('BaseUrl')) { $params['BaseUrl'] = $BaseUrl }
if ($PSBoundParameters.ContainsKey('Key')) { $params['Key'] = $Key }
$results = Invoke-PswDoctor @params

$colors = @{ OK = 'Green'; FALTA = 'Red'; PENDIENTE = 'Yellow' }
foreach ($r in $results) {
    Write-Host ("[{0}] " -f $r.State) -ForegroundColor $colors[$r.State] -NoNewline
    Write-Host ("{0}: {1}" -f $r.Check, $r.Detail)
    if ($r.State -ne 'OK' -and $r.Fix) { Write-Host ("        -> {0}" -f $r.Fix) }
}

$missing = @($results | Where-Object { $_.State -eq 'FALTA' }).Count
$pending = @($results | Where-Object { $_.State -eq 'PENDIENTE' }).Count
Write-Host ''
if ($missing -eq 0 -and $pending -eq 0) { Write-Host 'Todo listo.' -ForegroundColor Green }
else { Write-Host ("Falta: {0}. Pendiente: {1}." -f $missing, $pending) }
if ($missing -gt 0) { exit 1 }
exit 0
