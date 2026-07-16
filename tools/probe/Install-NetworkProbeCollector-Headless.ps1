#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala ou atualiza o ServerWatch Network Probe (coleta SNMP) sem interface grafica.
    Funciona em Windows Server Core, Hyper-V sem UI e ambientes sem permissao para executar EXE de terceiros.

.EXAMPLE
    # Instalacao nova
    .\Install-NetworkProbeCollector-Headless.ps1 -ServerUrl "http://sw.empresa.com.br:3000" -Token "TOKEN" -ProbeId "HV-01-rede" -Name "Rede - Hyper-V Principal"

    # Atualizacao (le config existente automaticamente)
    .\Install-NetworkProbeCollector-Headless.ps1 -Update

    # Remocao
    .\Install-NetworkProbeCollector-Headless.ps1 -Remove
#>
param(
    [string]$ServerUrl,
    [string]$Token,
    [string]$ProbeId,
    [string]$Name,
    [int]$IntervalSeconds = 60,
    [int]$TimeoutMs       = 3000,
    [string]$InstallDir   = "$env:ProgramData\ServerWatchNetworkProbe",
    [switch]$Update,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 renderiza a barra de progresso do Invoke-WebRequest
# via Write-Progress, o que derruba a velocidade de download pra poucos KB/s
# em vez de MB/s — sem isso, baixar o runtime do Node.js (dezenas de MB)
# pode parecer "travado" por varios minutos.
$ProgressPreference = "SilentlyContinue"
$taskName         = "ServerWatch Network Probe"
$watchdogTaskName = "ServerWatch Network Probe Watchdog"
$configPath       = Join-Path $InstallDir "config.json"
$runnerPath       = Join-Path $InstallDir "Run-ServerWatchNetworkProbe.ps1"
$watchdogPath     = Join-Path $InstallDir "Watch-ServerWatchNetworkProbe.ps1"
$logPath          = Join-Path $InstallDir "network-collector.log"

# Helpers

function Write-Step([string]$msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-OK                 { Write-Host "  OK" -ForegroundColor Green }

function Get-ExistingConfig {
    if (-not (Test-Path $configPath)) { return $null }
    try   { return Get-Content $configPath -Raw | ConvertFrom-Json }
    catch { return $null }
}

function Stop-Task([string]$name) {
    $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $t) { return }
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if (-not $t -or $t.State -ne "Running") { break }
        Start-Sleep -Milliseconds 500
    }
}

function Stop-ProbeTask { Stop-Task $taskName }
function Stop-WatchdogTask { Stop-Task $watchdogTaskName }

function Find-NodeExe([string]$dir) {
    $candidate = Join-Path $dir "node.exe"
    if (Test-Path $candidate) { return $candidate }

    $extracted = Get-ChildItem -Path (Join-Path $dir "node-runtime") -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue |
                 Select-Object -First 1 -ExpandProperty FullName
    if ($extracted) { return $extracted }

    $pathNode = Get-Command node -ErrorAction SilentlyContinue
    if ($pathNode) { return $pathNode.Source }

    return $null
}

function Download-NodeRuntime([string]$serverUrl, [hashtable]$headers, [string]$dir) {
    Write-Step "Node.js nao encontrado - baixando runtime do ServerWatch..."
    $runtimeZip = Join-Path $dir "node-runtime.zip"
    # Runtime Node bundlado eh compartilhado com o probe de host — mesmo asset,
    # namespace /downloads/probe/ (nao /downloads/network-probe/).
    Invoke-WebRequest `
        -Uri     "$serverUrl/downloads/probe/node-runtime-windows-x64" `
        -Headers $headers `
        -OutFile $runtimeZip `
        -UseBasicParsing

    $runtimeDir = Join-Path $dir "node-runtime"
    if (Test-Path $runtimeDir) { Remove-Item $runtimeDir -Recurse -Force }
    Write-Step "Extraindo runtime..."
    Expand-Archive -Path $runtimeZip -DestinationPath $runtimeDir -Force
    Remove-Item $runtimeZip -Force

    $nodeExe = Get-ChildItem -Path $runtimeDir -Filter "node.exe" -Recurse |
               Select-Object -First 1 -ExpandProperty FullName
    if (-not $nodeExe) { throw "node.exe nao encontrado no arquivo de runtime baixado." }
    return $nodeExe
}

function Download-CollectorFiles([string]$serverUrl, [hashtable]$headers, [string]$dir) {
    New-Item -ItemType Directory -Path (Join-Path $dir "snmp") -Force | Out-Null

    Invoke-WebRequest -Uri "$serverUrl/downloads/network-probe/network-collector.js" -Headers $headers `
        -OutFile (Join-Path $dir "network-collector.js.new") -UseBasicParsing
    Move-Item (Join-Path $dir "network-collector.js.new") (Join-Path $dir "network-collector.js") -Force

    Invoke-WebRequest -Uri "$serverUrl/downloads/network-probe/snmp-client.js" -Headers $headers `
        -OutFile (Join-Path $dir "snmp\client.js.new") -UseBasicParsing
    Move-Item (Join-Path $dir "snmp\client.js.new") (Join-Path $dir "snmp\client.js") -Force

    Invoke-WebRequest -Uri "$serverUrl/downloads/network-probe/vendor-templates.js" -Headers $headers `
        -OutFile (Join-Path $dir "snmp\vendor-templates.js.new") -UseBasicParsing
    Move-Item (Join-Path $dir "snmp\vendor-templates.js.new") (Join-Path $dir "snmp\vendor-templates.js") -Force

    Invoke-WebRequest -Uri "$serverUrl/downloads/network-probe/poller.js" -Headers $headers `
        -OutFile (Join-Path $dir "snmp\poller.js.new") -UseBasicParsing
    Move-Item (Join-Path $dir "snmp\poller.js.new") (Join-Path $dir "snmp\poller.js") -Force
}

function Write-ProbeRunner([string]$nodeExe) {
    $runner = @"
`$ErrorActionPreference = "Continue"
`$NodeExe = "$($nodeExe.Replace('"', '""'))"
`$CollectorPath = "$((Join-Path $InstallDir "network-collector.js").Replace('"', '""'))"
`$ConfigPath = "$($configPath.Replace('"', '""'))"
`$LogPath = "$($logPath.Replace('"', '""'))"

function Write-ProbeLog([string]`$message) {
    try {
        `$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path `$LogPath -Value "[`$stamp] `$message" -Encoding UTF8
    } catch {}
}

while (`$true) {
    try {
        Write-ProbeLog "Iniciando network collector."
        & `$NodeExe `$CollectorPath --config `$ConfigPath *>> `$LogPath
        `$exitCode = `$LASTEXITCODE
        Write-ProbeLog "Network collector finalizou com codigo `$exitCode. Reiniciando em 10s."
    } catch {
        Write-ProbeLog "Network collector falhou: `$(`$_.Exception.Message). Reiniciando em 10s."
    }
    Start-Sleep -Seconds 10
}
"@
    Set-Content -Path $runnerPath -Value $runner -Encoding UTF8
}

function Write-ProbeWatchdog {
    $watchdog = @"
`$ErrorActionPreference = "SilentlyContinue"
`$LogPath = "$($logPath.Replace('"', '""'))"
`$TaskName = "$taskName"

`$needsRestart = `$false
if (-not (Test-Path `$LogPath)) {
    `$needsRestart = `$true
} else {
    `$lastWrite = (Get-Item `$LogPath).LastWriteTime
    if (`$lastWrite -lt (Get-Date).AddMinutes(-5)) { `$needsRestart = `$true }
}

if (`$needsRestart) {
    try { Stop-ScheduledTask -TaskName `$TaskName -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 2
    try { Start-ScheduledTask -TaskName `$TaskName -ErrorAction SilentlyContinue } catch {}
    `$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path `$LogPath -Value "[`$stamp] Watchdog: log parado ha mais de 5 min, tarefa reiniciada." -Encoding UTF8
}
"@
    Set-Content -Path $watchdogPath -Value $watchdog -Encoding UTF8
}

function Register-ProbeTask([string]$nodeExe) {
    Write-ProbeRunner $nodeExe
    $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""

    $bootTrigger = New-ScheduledTaskTrigger -AtStartup
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $taskArgs -WorkingDirectory $InstallDir
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet `
        -MultipleInstances IgnoreNew `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable

    Register-ScheduledTask `
        -TaskName  $taskName `
        -Action    $action `
        -Trigger   @($bootTrigger, $repeatTrigger) `
        -Principal $principal `
        -Settings  $settings `
        -Force | Out-Null

    Start-ScheduledTask -TaskName $taskName

    Register-WatchdogTask
}

function Register-WatchdogTask {
    Write-ProbeWatchdog
    $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $watchdogArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogPath`""

    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $watchdogArgs -WorkingDirectory $InstallDir
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable

    Register-ScheduledTask `
        -TaskName  $watchdogTaskName `
        -Action    $action `
        -Trigger   $trigger `
        -Principal $principal `
        -Settings  $settings `
        -Force | Out-Null

    Start-ScheduledTask -TaskName $watchdogTaskName
}

# Modo: Remocao

if ($Remove) {
    Write-Host "ServerWatch Network Probe - Remocao" -ForegroundColor White
    Write-Step "Parando tarefas agendadas..."
    Stop-ProbeTask
    Stop-WatchdogTask
    $t = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($t) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue }
    $w = Get-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
    if ($w) { Unregister-ScheduledTask -TaskName $watchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue }
    if (Test-Path $InstallDir) {
        Write-Step "Removendo arquivos em $InstallDir..."
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }
    Write-Host "  Network Probe removido." -ForegroundColor Green
    return
}

# Modo: Atualizacao

if ($Update) {
    Write-Host "ServerWatch Network Probe - Atualizacao" -ForegroundColor White
    $cfg = Get-ExistingConfig
    if (-not $cfg) { throw "Configuracao nao encontrada em $configPath. Use o modo de instalacao." }

    $hdrs = @{
        "Authorization"             = "Bearer $($cfg.token)"
        "X-ServerWatch-Probe-Token" = $cfg.token
    }

    Write-Step "Baixando nova versao do network probe..."
    Download-CollectorFiles $cfg.serverUrl $hdrs $InstallDir
    Write-OK

    Write-Step "Reiniciando network probe..."
    Stop-ProbeTask
    $nodeExe = Find-NodeExe $InstallDir
    if (-not $nodeExe) {
        $nodeExe = Download-NodeRuntime $cfg.serverUrl $hdrs $InstallDir
    }
    Register-ProbeTask $nodeExe
    Write-Host "  Network Probe atualizado e reiniciado." -ForegroundColor Green
    return
}

# Modo: Instalacao

Write-Host "ServerWatch Network Probe - Instalacao sem UI" -ForegroundColor White
Write-Host ""

if ([string]::IsNullOrWhiteSpace($ProbeId)) { $ProbeId = "$env:COMPUTERNAME-rede" }
if ([string]::IsNullOrWhiteSpace($Name))    { $Name    = $ProbeId }
if ([string]::IsNullOrWhiteSpace($ServerUrl) -or [string]::IsNullOrWhiteSpace($Token)) {
    throw "Uso: .\Install-NetworkProbeCollector-Headless.ps1 -ServerUrl URL -Token TOKEN [-ProbeId ID] [-Name NOME]"
}

$ServerUrl = $ServerUrl.TrimEnd("/")
$headers   = @{
    "Authorization"             = "Bearer $Token"
    "X-ServerWatch-Probe-Token" = $Token
}

Write-Host "  Servidor : $ServerUrl"
Write-Host "  ProbeId  : $ProbeId"
Write-Host "  Nome     : $Name"
Write-Host ""

# 1 - Valida conexao
Write-Step "[1/6] Validando conexao com o ServerWatch..."
try {
    $enc = [Uri]::EscapeDataString($ProbeId)
    Invoke-RestMethod -Uri "$ServerUrl/api/network-probe/validate?probeId=$enc" -Headers $headers -TimeoutSec 15 | Out-Null
} catch {
    throw "Nao foi possivel conectar ao ServerWatch: $($_.Exception.Message)"
}
Write-OK

# 2 - Cria pasta
Write-Step "[2/6] Criando pasta de instalacao..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Write-OK

# 3 - Baixa os arquivos do collector
Write-Step "[3/6] Baixando network-collector.js e cliente SNMP..."
Download-CollectorFiles $ServerUrl $headers $InstallDir
Write-OK

# 4 - Localiza Node.js
Write-Step "[4/6] Localizando Node.js..."
$nodeExe = Find-NodeExe $InstallDir
if (-not $nodeExe) {
    $nodeExe = Download-NodeRuntime $ServerUrl $headers $InstallDir
}
Write-Host "  Node     : $nodeExe" -ForegroundColor DarkGray

# 5 - Grava config.json
Write-Step "[5/6] Gravando configuracao..."
[ordered]@{
    serverUrl       = $ServerUrl
    probeId         = $ProbeId.Trim()
    name            = $Name.Trim()
    token           = $Token.Trim()
    intervalSeconds = $IntervalSeconds
    timeoutMs       = $TimeoutMs
} | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8
Write-OK

# 6 - Registra e inicia tarefa agendada
Write-Step "[6/6] Registrando tarefa agendada como SYSTEM..."
Stop-ProbeTask
Register-ProbeTask $nodeExe
Write-OK

Write-Host ""
Write-Host "  Instalacao concluida. O network probe '$ProbeId' aparecera no ServerWatch em instantes." -ForegroundColor Green
