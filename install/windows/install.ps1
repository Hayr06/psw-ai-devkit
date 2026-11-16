# Deja esta PC lista para el semillero: .NET 10, Node, Git, SQL Server LocalDB, OpenCode 1.19.0 y la llave personal.
# Uso: powershell -ExecutionPolicy Bypass -File install.ps1 [-Key <llave>] [-CheckOnly]
#   -CheckOnly  muestra lo que haría sin cambiar nada.
[CmdletBinding()]
param([string]$Key, [switch]$CheckOnly, [switch]$LoadOnly)

Import-Module (Join-Path $PSScriptRoot 'PswDoctor.psm1') -Force

# Package ids in one place so they can be fixed without reading the code.
$script:Packages = [ordered]@{
    DotNet = 'Microsoft.DotNet.SDK.10'
    Node   = 'OpenJS.NodeJS.LTS'
    Git    = 'Git.Git'
}
$script:OpenCodePackage = 'opencode-ai@1.19.0'
# Microsoft's SQL Server 2022 Express web installer (the URL winget uses); it can download the LocalDB MSI alone.
$script:SqlExpressBootstrapper = 'https://download.microsoft.com/download/29654887-7cde-4397-bba3-d7f087970845/SQL2022-SSEI-Expr.exe'

function Write-PswOpenCodeConfig {
    param([Parameter(Mandatory)][string]$TargetPath, [Parameter(Mandatory)][string]$TemplatePath)
    $dir = Split-Path -Parent $TargetPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $backup = $null
    if (Test-Path $TargetPath) {
        $backup = "$TargetPath.bak-" + (Get-Date -Format 'yyyyMMddHHmmss')
        Move-Item -Path $TargetPath -Destination $backup
    }
    Copy-Item -Path $TemplatePath -Destination $TargetPath
    return $backup
}

function Get-PswInstallPlan {
    $plan = @()
    $winget = { param($id) "winget install --id $id -e" }

    $sdks = Get-PswCommandVersion -Command 'dotnet' -Arguments @('--list-sdks')
    $has10 = $sdks -and (($sdks -split "`n") | Where-Object { $_.Trim() -like '10.*' })
    $plan += [pscustomobject]@{ Name = '.NET 10 SDK'; Present = [bool]$has10; Action = $(if ($has10) { 'ninguna' } else { & $winget $script:Packages.DotNet }) }

    $node = Get-PswCommandVersion -Command 'node' -Arguments @('--version')
    $nodeOk = $node -and (Test-PswNodeVersion -Version $node)
    $plan += [pscustomobject]@{ Name = 'Node'; Present = [bool]$nodeOk; Action = $(if ($nodeOk) { 'ninguna' } else { & $winget $script:Packages.Node }) }

    $git = Get-PswCommandVersion -Command 'git' -Arguments @('--version')
    $plan += [pscustomobject]@{ Name = 'Git'; Present = [bool]$git; Action = $(if ($git) { 'ninguna' } else { & $winget $script:Packages.Git }) }

    $localdb = Get-PswCommandVersion -Command 'sqllocaldb' -Arguments @('info')
    $plan += [pscustomobject]@{ Name = 'SQL Server LocalDB'; Present = [bool]$localdb; Action = $(if ($localdb) { 'ninguna' } else { 'descargar e instalar SqlLocalDB.msi (SQL Server 2022 Express)' }) }

    $oc = Get-PswCommandVersion -Command 'opencode' -Arguments @('--version')
    $ocOk = $oc -eq '1.19.0'
    $plan += [pscustomobject]@{ Name = 'OpenCode'; Present = $ocOk; Action = $(if ($ocOk) { 'ninguna' } else { "npm install -g $script:OpenCodePackage" }) }

    return $plan
}

function Update-PswSessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

function Install-PswLocalDb {
    $tmp = Join-Path $env:TEMP ('psw-localdb-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $ssei = Join-Path $tmp 'SQL2022-SSEI-Expr.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $script:SqlExpressBootstrapper -OutFile $ssei -UseBasicParsing
    Start-Process -FilePath $ssei -ArgumentList '/ACTION=Download', '/MEDIATYPE=LocalDB', "/MEDIAPATH=$tmp", '/QUIET' -Wait
    $msi = Get-ChildItem -Path $tmp -Recurse -Filter 'SqlLocalDB.msi' | Select-Object -First 1
    if (-not $msi) { throw 'No se pudo descargar SqlLocalDB.msi.' }
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "`"$($msi.FullName)`"", '/qn', 'IACCEPTSQLLOCALDBLICENSETERMS=YES' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "msiexec terminó con código $($p.ExitCode)." }
}

function Read-PswKey {
    $secure = Read-Host -Prompt 'Pega la llave que te dio el organizador' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Write-PswStep([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }

function Invoke-PswInstall {
    param([string]$Key, [switch]$CheckOnly)

    $plan = Get-PswInstallPlan
    if ($CheckOnly) {
        Write-Host 'Lo que haría install.ps1 (no se cambió nada):'
        foreach ($p in $plan) { Write-Host ("  {0,-20} {1}" -f $p.Name, $p.Action) }
        Write-Host ("  {0,-20} {1}" -f 'Configuración', "escribir $HOME\.config\opencode\opencode.jsonc (respaldando la anterior)")
        Write-Host ("  {0,-20} {1}" -f 'Llave', 'guardar en la variable de usuario PSW_LLM_KEY')
        return 0
    }

    $needsWinget = @($plan | Where-Object { $_.Action -like 'winget *' }).Count -gt 0
    if ($needsWinget -and -not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host 'Falta winget. Instala "Instalador de aplicación" desde Microsoft Store: https://apps.microsoft.com/detail/9NBLGGH4NNS1' -ForegroundColor Red
        return 1
    }

    foreach ($p in $plan) {
        if ($p.Action -like 'winget *') {
            $id = $p.Action -replace '^winget install --id (\S+) -e$', '$1'
            Write-PswStep "Instalando $($p.Name)"
            winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements
        }
    }
    Update-PswSessionPath

    if (-not ($plan | Where-Object { $_.Name -eq 'SQL Server LocalDB' }).Present) {
        Write-PswStep 'Instalando SQL Server LocalDB'
        try { Install-PswLocalDb } catch { Write-Host "No se pudo instalar LocalDB: $($_.Exception.Message)" -ForegroundColor Yellow }
    }

    if (-not ($plan | Where-Object { $_.Name -eq 'OpenCode' }).Present) {
        Write-PswStep "Instalando OpenCode ($script:OpenCodePackage)"
        npm install -g $script:OpenCodePackage
        Update-PswSessionPath
    }

    Write-PswStep 'Configurando OpenCode'
    $target = Join-Path $HOME '.config\opencode\opencode.jsonc'
    $backup = Write-PswOpenCodeConfig -TargetPath $target -TemplatePath (Join-Path $PSScriptRoot 'opencode.semillero.jsonc')
    if ($backup) { Write-Host "La configuración anterior quedó en $backup" }

    if (-not $Key) { $Key = Read-PswKey }
    $Key = "$Key".Trim()
    if ($Key) {
        [Environment]::SetEnvironmentVariable('PSW_LLM_KEY', $Key, 'User')
        $env:PSW_LLM_KEY = $Key
        Write-Host 'Llave guardada.'
    } else {
        Write-Host 'No se guardó ninguna llave; vuelve a correr install.ps1 cuando la tengas.' -ForegroundColor Yellow
    }

    Write-PswStep 'Diagnóstico'
    & (Join-Path $PSScriptRoot 'doctor.ps1')
    return $LASTEXITCODE
}

if ($LoadOnly) { return }
exit (Invoke-PswInstall -Key $Key -CheckOnly:$CheckOnly)
