# Diagnostic checks for a semillero / PSW workstation. Messages for the student are in Spanish.
# Two functions touch the outside world (processes and network); everything else is pure so it can be tested.

$script:DefaultBaseUrl = 'https://fabrica.pyxoomsaas.com/modelo'
$script:ModelId = 'qwen3.6'
$script:OpenCodeVersion = '1.19.0'

function Get-PswCommandVersion {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Command, [string[]]$Arguments = @())
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { return $null }
    try {
        $out = & $Command @Arguments 2>$null
        if ($null -eq $out) { return '' }
        return (($out | ForEach-Object { "$_" }) -join "`n").Trim()
    } catch {
        return $null
    }
}

function Invoke-PswHttp {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [string]$Key,
        [string]$Body
    )
    # Windows PowerShell 5.1 does not enable TLS 1.2 by default.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $headers = @{}
    if ($Key) { $headers['Authorization'] = "Bearer $Key" }
    $params = @{ Method = $Method; Uri = $Uri; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 120 }
    if ($Body) {
        $params['Body'] = [Text.Encoding]::UTF8.GetBytes($Body)
        $params['ContentType'] = 'application/json'
    }
    try {
        $r = Invoke-WebRequest @params
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = [string]$r.Content; Error = '' }
    } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        return [pscustomobject]@{ Status = $status; Body = ''; Error = $_.Exception.Message }
    }
}

function Test-PswNodeVersion {
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Version)
    if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)') { return $false }
    $major = [int]$Matches[1]; $minor = [int]$Matches[2]
    if ($major -eq 20) { return $minor -ge 19 }
    if ($major -eq 22) { return $minor -ge 12 }
    return $major -ge 24
}

function New-PswCheck([string]$Check, [string]$State, [string]$Detail, [string]$Fix = '') {
    [pscustomobject]@{ Check = $Check; State = $State; Detail = $Detail; Fix = $Fix }
}

function Get-PswToolChecks {
    $checks = @()

    $sdks = Get-PswCommandVersion -Command 'dotnet' -Arguments @('--list-sdks')
    $has10 = $sdks -and (($sdks -split "`n") | Where-Object { $_.Trim() -like '10.*' })
    if ($has10) { $checks += New-PswCheck '.NET 10 SDK' 'OK' 'instalado' }
    else { $checks += New-PswCheck '.NET 10 SDK' 'FALTA' 'no se encontró el SDK de .NET 10' 'Ejecuta: winget install Microsoft.DotNet.SDK.10' }

    $node = Get-PswCommandVersion -Command 'node' -Arguments @('--version')
    if ($node -and (Test-PswNodeVersion -Version $node)) { $checks += New-PswCheck 'Node' 'OK' $node }
    elseif ($node) { $checks += New-PswCheck 'Node' 'FALTA' "versión $node; Angular 20 pide 20.19+, 22.12+ o 24+" 'Ejecuta: winget install OpenJS.NodeJS.LTS' }
    else { $checks += New-PswCheck 'Node' 'FALTA' 'Node no está instalado' 'Ejecuta: winget install OpenJS.NodeJS.LTS' }

    $git = Get-PswCommandVersion -Command 'git' -Arguments @('--version')
    if ($git) { $checks += New-PswCheck 'Git' 'OK' $git }
    else { $checks += New-PswCheck 'Git' 'FALTA' 'Git no está instalado' 'Ejecuta: winget install Git.Git' }

    $oc = Get-PswCommandVersion -Command 'opencode' -Arguments @('--version')
    if ($oc -eq $script:OpenCodeVersion) { $checks += New-PswCheck "OpenCode $script:OpenCodeVersion" 'OK' $oc }
    elseif ($oc) { $checks += New-PswCheck "OpenCode $script:OpenCodeVersion" 'FALTA' "versión $oc" "Ejecuta: npm install -g opencode-ai@$script:OpenCodeVersion" }
    else { $checks += New-PswCheck "OpenCode $script:OpenCodeVersion" 'FALTA' 'OpenCode no está instalado' "Ejecuta: npm install -g opencode-ai@$script:OpenCodeVersion" }

    $localdb = Get-PswCommandVersion -Command 'sqllocaldb' -Arguments @('info')
    if ($localdb) { $checks += New-PswCheck 'SQL Server LocalDB' 'OK' (($localdb -split "`n")[0]) }
    else { $checks += New-PswCheck 'SQL Server LocalDB' 'FALTA' 'LocalDB no está instalado' 'Vuelve a correr install.ps1 o instala SQL Server Express con LocalDB' }

    return $checks
}

function Get-PswGatewayChecks([string]$BaseUrl, [string]$Key) {
    $base = $BaseUrl.TrimEnd('/')
    $health = Invoke-PswHttp -Method 'GET' -Uri "$base/health/liveliness"
    if ($health.Status -ne 200) {
        $why = if ($health.Status -eq 0) { 'no hubo respuesta' } else { "respondió $($health.Status)" }
        return @(
            (New-PswCheck 'Puerta de enlace' 'PENDIENTE' "no se llega a $base ($why)" 'Si el organizador ya la publicó, la red de la escuela la está bloqueando: avísale.'),
            (New-PswCheck 'Llave' 'PENDIENTE' 'se revisa cuando responda la puerta de enlace'),
            (New-PswCheck 'Modelo responde' 'PENDIENTE' 'se revisa cuando responda la puerta de enlace')
        )
    }
    $checks = @(New-PswCheck 'Puerta de enlace' 'OK' $base)

    if (-not $Key) {
        $checks += New-PswCheck 'Llave' 'FALTA' 'no hay llave configurada (PSW_LLM_KEY)' 'Vuelve a correr install.ps1 y pega la llave que te dio el organizador.'
        $checks += New-PswCheck 'Modelo responde' 'PENDIENTE' 'se revisa cuando haya llave'
        return $checks
    }

    $models = Invoke-PswHttp -Method 'GET' -Uri "$base/v1/models" -Key $Key
    if ($models.Status -eq 401 -or $models.Status -eq 403) {
        $checks += New-PswCheck 'Llave' 'FALTA' 'la llave fue rechazada' 'Revisa que la copiaste completa y vuelve a correr install.ps1; si sigue, pide otra al organizador.'
        $checks += New-PswCheck 'Modelo responde' 'PENDIENTE' 'se revisa cuando la llave funcione'
        return $checks
    }
    if ($models.Status -ne 200 -or $models.Body -notmatch [regex]::Escape("`"$script:ModelId`"")) {
        $checks += New-PswCheck 'Llave' 'FALTA' "la puerta de enlace respondió $($models.Status) sin el modelo $script:ModelId" 'Avísale al organizador.'
        $checks += New-PswCheck 'Modelo responde' 'PENDIENTE' 'se revisa cuando la llave funcione'
        return $checks
    }
    $checks += New-PswCheck 'Llave' 'OK' "el modelo $script:ModelId está disponible"

    $body = '{"model":"' + $script:ModelId + '","messages":[{"role":"user","content":"Responde solo: OK"}],"max_tokens":32,"chat_template_kwargs":{"enable_thinking":false}}'
    $chat = Invoke-PswHttp -Method 'POST' -Uri "$base/v1/chat/completions" -Key $Key -Body $body
    $content = ''
    if ($chat.Status -eq 200) {
        try { $content = [string](($chat.Body | ConvertFrom-Json).choices[0].message.content) } catch { $content = '' }
    }
    if ($content -match 'OK') { $checks += New-PswCheck 'Modelo responde' 'OK' 'respondió a una pregunta de prueba' }
    elseif ($chat.Status -eq 429) { $checks += New-PswCheck 'Modelo responde' 'PENDIENTE' 'el modelo está ocupado (429)' 'Espera un minuto y vuelve a correr doctor.ps1.' }
    else { $checks += New-PswCheck 'Modelo responde' 'FALTA' "respondió $($chat.Status) sin la respuesta esperada" 'Avísale al organizador.' }
    return $checks
}

function Invoke-PswDoctor {
    [CmdletBinding()]
    param([string]$BaseUrl = $script:DefaultBaseUrl, [string]$Key)
    if (-not $PSBoundParameters.ContainsKey('Key')) {
        $Key = $env:PSW_LLM_KEY
        if (-not $Key) { $Key = [Environment]::GetEnvironmentVariable('PSW_LLM_KEY', 'User') }
    }
    if ($Key) { $Key = $Key.Trim() }
    return @(Get-PswToolChecks) + @(Get-PswGatewayChecks -BaseUrl $BaseUrl -Key $Key)
}

Export-ModuleMember -Function Get-PswCommandVersion, Invoke-PswHttp, Test-PswNodeVersion, Invoke-PswDoctor
