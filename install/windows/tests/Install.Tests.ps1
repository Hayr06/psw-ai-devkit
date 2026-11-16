# Pester 3.4 (bundled with Windows PowerShell 5.1).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
. (Join-Path $root 'install.ps1') -LoadOnly

$templatePath = Join-Path $root 'opencode.semillero.jsonc'

Describe 'Invoke-PswNativeStep' {
    It 'returns only $true when the command exits 0, so its output never leaks into the exit code' {
        $r = @(Invoke-PswNativeStep -Name 'Prueba' -Command { cmd /c 'echo salida de winget' })
        $r.Count | Should Be 1
        $r[0] | Should Be $true
    }

    It 'returns only $false when the command fails' {
        $r = @(Invoke-PswNativeStep -Name 'Prueba' -Command { cmd /c 'echo salida & exit 3' })
        $r.Count | Should Be 1
        $r[0] | Should Be $false
    }
}

Describe 'Write-PswOpenCodeConfig' {
    $dir = Join-Path $env:TEMP ("psw-install-test-" + [guid]::NewGuid().ToString('N'))

    AfterEach { if (Test-Path $dir) { Remove-Item $dir -Recurse -Force } }

    It 'creates the config identical to the template and returns $null when none existed' {
        $target = Join-Path $dir 'opencode\opencode.jsonc'
        $backup = Write-PswOpenCodeConfig -TargetPath $target -TemplatePath $templatePath
        $backup | Should BeNullOrEmpty
        (Get-FileHash $target).Hash | Should Be (Get-FileHash $templatePath).Hash
    }

    It 'backs up an existing config with a timestamp and writes the template' {
        $target = Join-Path $dir 'opencode\opencode.jsonc'
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        Set-Content -Path $target -Value '{ "old": true }'
        $backup = Write-PswOpenCodeConfig -TargetPath $target -TemplatePath $templatePath
        $backup | Should Match 'opencode\.jsonc\.bak-\d{14}$'
        (Get-Content $backup -Raw) | Should Match '"old": true'
        (Get-FileHash $target).Hash | Should Be (Get-FileHash $templatePath).Hash
    }
}

Describe 'Get-PswInstallPlan' {
    function Get-Action($plan, $name) { ($plan | Where-Object { $_.Name -eq $name } | Select-Object -First 1).Action }

    Mock Get-PswCommandVersion {
        switch ($Command) {
            'dotnet'     { '10.0.100 [C:\dotnet\sdk]' }
            'node'       { 'v22.12.0' }
            'git'        { 'git version 2.47.0' }
            'opencode'   { '1.19.0' }
            'sqllocaldb' { 'MSSQLLocalDB' }
        }
    }

    It 'plans to install Node LTS when Node is v18.20.0' {
        Mock Get-PswCommandVersion -ParameterFilter { $Command -eq 'node' } { 'v18.20.0' }
        Get-Action (Get-PswInstallPlan) 'Node' | Should Be 'winget install --id OpenJS.NodeJS.LTS -e'
    }

    It 'plans nothing for Node v22.12.0' {
        Mock Get-PswCommandVersion -ParameterFilter { $Command -eq 'node' } { 'v22.12.0' }
        Get-Action (Get-PswInstallPlan) 'Node' | Should Be 'ninguna'
    }

    It 'plans to install OpenCode 1.19.0 over 1.18.2' {
        Mock Get-PswCommandVersion -ParameterFilter { $Command -eq 'opencode' } { '1.18.2' }
        Get-Action (Get-PswInstallPlan) 'OpenCode' | Should Be 'npm install -g opencode-ai@1.19.0'
    }
}

Describe 'opencode.semillero.jsonc' {
    $text = Get-Content $templatePath -Raw

    It 'points to the gateway with the key from the environment' {
        $text | Should Match ([regex]::Escape('https://fabrica.pyxoomsaas.com/modelo/v1'))
        $text | Should Match ([regex]::Escape('{env:PSW_LLM_KEY}'))
        $text | Should Match '"qwen3\.6"'
        $text | Should Match '"chat_template_kwargs"'
    }

    It 'has no extraBody and no internal PCAI host' {
        $text | Should Not Match 'extraBody'
        $text | Should Not Match 'ciisagl\.local'
    }
}
