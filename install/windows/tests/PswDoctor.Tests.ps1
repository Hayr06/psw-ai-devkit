# Pester 3.4 (the version bundled with Windows PowerShell 5.1), so the tests run on a school PC without installing anything.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulePath = Join-Path (Split-Path -Parent $here) 'PswDoctor.psm1'
Import-Module $modulePath -Force

$BaseUrl = 'https://fabrica.pyxoomsaas.com/modelo'

function Get-Check($results, $name) { $results | Where-Object { $_.Check -eq $name } | Select-Object -First 1 }

function global:New-HttpResult([int]$status, [string]$body = '') {
    [pscustomobject]@{ Status = $status; Body = $body; Error = '' }
}

$global:chatOk = '{"choices":[{"message":{"role":"assistant","content":"OK"}}]}'
$global:modelsOk = '{"data":[{"id":"qwen3.6","object":"model"}]}'

# All tools present and in range, so each tool test changes only one thing.
function Set-AllToolsPresent {
    Mock -ModuleName PswDoctor Get-PswCommandVersion {
        switch ($Command) {
            'dotnet'     { "9.0.100 [C:\dotnet\sdk]`n10.0.100 [C:\dotnet\sdk]" }
            'node'       { 'v22.12.0' }
            'git'        { 'git version 2.47.0.windows.1' }
            'opencode'   { '1.19.0' }
            'sqllocaldb' { 'MSSQLLocalDB' }
        }
    }
    Mock -ModuleName PswDoctor Get-PswScriptPolicy { 'RemoteSigned' }
    Mock -ModuleName PswDoctor Get-PswCommandPath { "C:\Users\alumno\AppData\Roaming\npm\$Command.cmd" }
    Mock -ModuleName PswDoctor Get-PswProxyStatus { [pscustomobject]@{ System = ''; Configured = '' } }
}

function Set-GatewayHealthy {
    Mock -ModuleName PswDoctor Invoke-PswHttp {
        if ($Uri -like '*/health/liveliness') { return (New-HttpResult 200 '"I''m alive!"') }
        if ($Uri -like '*/v1/models') { return (New-HttpResult 200 $global:modelsOk) }
        if ($Uri -like '*/v1/chat/completions') { return (New-HttpResult 200 $global:chatOk) }
        New-HttpResult 404
    }
}

Describe 'Test-PswNodeVersion (Angular 20: ^20.19.0 || ^22.12.0 || >=24.0.0)' {
    It 'accepts <v>' -TestCases @(@{ v = 'v20.19.0' }, @{ v = 'v22.12.0' }, @{ v = 'v24.1.0' }) {
        param($v)
        Test-PswNodeVersion -Version $v | Should Be $true
    }
    It 'rejects <v>' -TestCases @(@{ v = 'v20.18.1' }, @{ v = 'v22.11.0' }, @{ v = 'v18.20.0' }, @{ v = 'v23.5.0' }) {
        param($v)
        Test-PswNodeVersion -Version $v | Should Be $false
    }
}

Describe 'Invoke-PswDoctor: tools' {
    BeforeEach { Set-GatewayHealthy }

    It 'reports everything OK when all tools are present' {
        Set-AllToolsPresent
        $r = Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc'
        ($r | Where-Object { $_.State -ne 'OK' }).Count | Should Be 0
    }

    It 'flags .NET 10 SDK as FALTA when no SDK line starts with 10.' {
        Set-AllToolsPresent
        Mock -ModuleName PswDoctor Get-PswCommandVersion -ParameterFilter { $Command -eq 'dotnet' } { '9.0.100 [C:\dotnet\sdk]' }
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') '.NET 10 SDK'
        $c.State | Should Be 'FALTA'
        $c.Fix | Should Match 'winget install Microsoft.DotNet.SDK.10'
    }

    It 'flags OpenCode 1.18.2 as FALTA' {
        Set-AllToolsPresent
        Mock -ModuleName PswDoctor Get-PswCommandVersion -ParameterFilter { $Command -eq 'opencode' } { '1.18.2' }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'OpenCode 1.19.0').State | Should Be 'FALTA'
    }

    It 'accepts OpenCode 1.19.0' {
        Set-AllToolsPresent
        Mock -ModuleName PswDoctor Get-PswCommandVersion -ParameterFilter { $Command -eq 'opencode' } { '1.19.0' }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'OpenCode 1.19.0').State | Should Be 'OK'
    }

    It 'flags a missing git as FALTA' {
        Set-AllToolsPresent
        Mock -ModuleName PswDoctor Get-PswCommandVersion -ParameterFilter { $Command -eq 'git' } { $null }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Git').State | Should Be 'FALTA'
    }

    It 'flags SQL Server LocalDB as FALTA when sqllocaldb prints nothing' {
        Set-AllToolsPresent
        Mock -ModuleName PswDoctor Get-PswCommandVersion -ParameterFilter { $Command -eq 'sqllocaldb' } { '' }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'SQL Server LocalDB').State | Should Be 'FALTA'
    }

    It 'flags an old Node as FALTA' {
        Set-AllToolsPresent
        Mock -ModuleName PswDoctor Get-PswCommandVersion -ParameterFilter { $Command -eq 'node' } { 'v18.20.0' }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Node').State | Should Be 'FALTA'
    }
}

Describe 'Invoke-PswDoctor: gateway, key and model' {
    BeforeEach { Set-AllToolsPresent }

    It 'marks the gateway PENDIENTE with the URL when it cannot be reached' {
        Mock -ModuleName PswDoctor Invoke-PswHttp { New-HttpResult 0 }
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Puerta de enlace'
        $c.State | Should Be 'PENDIENTE'
        $c.Detail | Should Match ([regex]::Escape($BaseUrl))
    }

    It 'marks key and model PENDIENTE without more network calls when the gateway is unreachable' {
        Mock -ModuleName PswDoctor Invoke-PswHttp { New-HttpResult 0 }
        $r = Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc'
        (Get-Check $r 'Llave').State | Should Be 'PENDIENTE'
        (Get-Check $r 'Modelo responde').State | Should Be 'PENDIENTE'
        Assert-MockCalled -ModuleName PswDoctor Invoke-PswHttp -Times 1 -Exactly -Scope It
    }

    It 'flags an empty key as FALTA and points to install.ps1' {
        Set-GatewayHealthy
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key '') 'Llave'
        $c.State | Should Be 'FALTA'
        $c.Fix | Should Match 'install\.ps1'
    }

    It 'flags a rejected key (401) as FALTA' {
        Mock -ModuleName PswDoctor Invoke-PswHttp {
            if ($Uri -like '*/health/liveliness') { return (New-HttpResult 200 '"I''m alive!"') }
            New-HttpResult 401
        }
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Llave'
        $c.State | Should Be 'FALTA'
        $c.Detail | Should Match 'la llave fue rechazada'
    }

    It 'accepts the key when /v1/models lists qwen3.6, and the model when it answers OK' {
        Set-GatewayHealthy
        $r = Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc'
        (Get-Check $r 'Llave').State | Should Be 'OK'
        (Get-Check $r 'Modelo responde').State | Should Be 'OK'
    }

    It 'sends the key trimmed' {
        Set-GatewayHealthy
        Invoke-PswDoctor -BaseUrl $BaseUrl -Key "  abc `r`n" | Out-Null
        Assert-MockCalled -ModuleName PswDoctor Invoke-PswHttp -ParameterFilter { $Uri -like '*/v1/models' -and $Key -eq 'abc' } -Times 1 -Exactly -Scope It
    }
}

Describe 'Invoke-PswDoctor: what the student hits after the doctor passes' {
    BeforeEach { Set-AllToolsPresent; Set-GatewayHealthy }

    It 'flags the script policy as FALTA when PowerShell would block opencode.ps1 (<policy>)' -TestCases @(@{ policy = 'Restricted' }, @{ policy = 'AllSigned' }, @{ policy = 'Undefined' }) {
        param($policy)
        $global:testPolicy = $policy
        Mock -ModuleName PswDoctor Get-PswScriptPolicy { $global:testPolicy }
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Política de scripts'
        $c.State | Should Be 'FALTA'
        $c.Fix | Should Match 'Set-ExecutionPolicy -Scope CurrentUser RemoteSigned'
    }

    It 'accepts the script policy <policy>' -TestCases @(@{ policy = 'RemoteSigned' }, @{ policy = 'Unrestricted' }, @{ policy = 'Bypass' }) {
        param($policy)
        $global:testPolicy = $policy
        Mock -ModuleName PswDoctor Get-PswScriptPolicy { $global:testPolicy }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Política de scripts').State | Should Be 'OK'
    }

    It 'shows which OpenCode answered when the version is wrong' {
        Mock -ModuleName PswDoctor Get-PswCommandVersion { 'opencode v2.2.7' } -ParameterFilter { $Command -eq 'opencode' }
        Mock -ModuleName PswDoctor Get-PswCommandPath { 'C:\tools\bin\opencode.ps1' } -ParameterFilter { $Command -eq 'opencode' }
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'OpenCode 1.19.0'
        $c.State | Should Be 'FALTA'
        $c.Detail | Should Match ([regex]::Escape('C:\tools\bin\opencode.ps1'))
        $c.Fix | Should Match 'PATH'
    }

    It 'marks the gateway PENDIENTE when health answers 200 with something that is not the gateway' {
        Mock -ModuleName PswDoctor Invoke-PswHttp { New-HttpResult 200 '<html>Portal de la red</html>' }
        $r = Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc'
        (Get-Check $r 'Puerta de enlace').State | Should Be 'PENDIENTE'
        (Get-Check $r 'Llave').State | Should Be 'PENDIENTE'
    }

    It 'warns when the network uses a proxy that OpenCode will not pick up' {
        Mock -ModuleName PswDoctor Get-PswProxyStatus { [pscustomobject]@{ System = 'http://proxy.escuela:8080'; Configured = '' } }
        $c = Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Proxy'
        $c.State | Should Be 'PENDIENTE'
        $c.Detail | Should Match ([regex]::Escape('http://proxy.escuela:8080'))
        $c.Fix | Should Match 'HTTPS_PROXY'
    }

    It 'accepts a proxy that is already set in HTTPS_PROXY' {
        Mock -ModuleName PswDoctor Get-PswProxyStatus { [pscustomobject]@{ System = 'http://proxy.escuela:8080'; Configured = 'http://proxy.escuela:8080' } }
        (Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Proxy').State | Should Be 'OK'
    }

    It 'adds no proxy check when the network has no proxy' {
        @(Get-Check (Invoke-PswDoctor -BaseUrl $BaseUrl -Key 'abc') 'Proxy' | Where-Object { $_ }).Count | Should Be 0
    }
}

Describe 'Script encoding' {
    # Windows PowerShell 5.1 reads BOM-less files as ANSI, which garbles the Spanish messages.
    $scripts = Get-ChildItem (Split-Path -Parent $here) -Recurse -Include *.ps1, *.psm1
    It '<name> is saved as UTF-8 with BOM' -TestCases @($scripts | ForEach-Object { @{ name = $_.Name; path = $_.FullName } }) {
        param($name, $path)
        $bytes = [IO.File]::ReadAllBytes($path)
        ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) | Should Be $true
    }
}
