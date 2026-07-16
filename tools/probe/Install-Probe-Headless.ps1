#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala ou atualiza o ServerWatch Probe Collector sem interface grafica.
    Funciona em Windows Server Core, Hyper-V sem UI e ambientes sem permissao para executar EXE de terceiros.

.EXAMPLE
    # Instalacao nova
    .\Install-Probe-Headless.ps1 -ServerUrl "http://sw.empresa.com.br:3000" -Token "TOKEN" -ProbeId "HV-01" -Name "Hyper-V Principal"

    # Atualizacao (le config existente automaticamente)
    .\Install-Probe-Headless.ps1 -Update

    # Remocao
    .\Install-Probe-Headless.ps1 -Remove
#>
param(
    [string]$ServerUrl,
    [string]$Token,
    [string]$ProbeId,
    [string]$Name,
    [int]$IntervalSeconds = 10,
    [int]$TimeoutMs       = 2500,
    [string]$InstallDir   = "$env:ProgramData\ServerWatchProbe",
    [switch]$Update,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$taskName         = "ServerWatch Probe Collector"
$watchdogTaskName = "ServerWatch Probe Watchdog"
$configPath       = Join-Path $InstallDir "config.json"
$runnerPath       = Join-Path $InstallDir "Run-ServerWatchProbe.ps1"
$watchdogPath     = Join-Path $InstallDir "Watch-ServerWatchProbe.ps1"
$logPath          = Join-Path $InstallDir "collector.log"

# Helpers

function Write-Step([string]$msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-OK                 { Write-Host "  OK" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  AVISO: $msg" -ForegroundColor Yellow }

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
    # 1. node.exe junto ao collector (instalacao anterior)
    $candidate = Join-Path $dir "node.exe"
    if (Test-Path $candidate) { return $candidate }

    # 2. runtime extraido numa instalacao anterior
    $extracted = Get-ChildItem -Path (Join-Path $dir "node-runtime") -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue |
                 Select-Object -First 1 -ExpandProperty FullName
    if ($extracted) { return $extracted }

    # 3. node.exe no PATH do sistema
    $pathNode = Get-Command node -ErrorAction SilentlyContinue
    if ($pathNode) { return $pathNode.Source }

    return $null
}

function Download-NodeRuntime([string]$serverUrl, [hashtable]$headers, [string]$dir) {
    Write-Step "Node.js nao encontrado - baixando runtime do ServerWatch..."
    $runtimeZip = Join-Path $dir "node-runtime.zip"
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

function Write-ProbeRunner([string]$nodeExe) {
    $runner = @"
`$ErrorActionPreference = "Continue"
`$NodeExe = "$($nodeExe.Replace('"', '""'))"
`$CollectorPath = "$((Join-Path $InstallDir "collector.js").Replace('"', '""'))"
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
        Write-ProbeLog "Iniciando collector."
        & `$NodeExe `$CollectorPath --config `$ConfigPath *>> `$LogPath
        `$exitCode = `$LASTEXITCODE
        Write-ProbeLog "Collector finalizou com codigo `$exitCode. Reiniciando em 10s."
    } catch {
        Write-ProbeLog "Collector falhou: `$(`$_.Exception.Message). Reiniciando em 10s."
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
    if (`$lastWrite -lt (Get-Date).AddMinutes(-3)) { `$needsRestart = `$true }
}

if (`$needsRestart) {
    try { Stop-ScheduledTask -TaskName `$TaskName -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 2
    try { Start-ScheduledTask -TaskName `$TaskName -ErrorAction SilentlyContinue } catch {}
    `$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path `$LogPath -Value "[`$stamp] Watchdog: log parado ha mais de 3 min, tarefa reiniciada." -Encoding UTF8
}
"@
    Set-Content -Path $watchdogPath -Value $watchdog -Encoding UTF8
}

function Register-ProbeTask([string]$nodeExe) {
    Write-ProbeRunner $nodeExe
    $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""

    # Dois gatilhos nativos (nao XML manual, que se mostrou pouco confiavel em
    # Windows Server 2016 quando a repeticao ficava sem <Duration> explicito):
    # inicia no boot e se recria a cada 5 min caso a instancia anterior tenha
    # morrido sem que o Task Scheduler perceba a tempo.
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

    # Tarefa independente e deliberadamente simples: nao confia no estado
    # "Running" do Task Scheduler (um processo pode aparecer travado/zumbi
    # ainda como "Running"), verifica um sinal objetivo (o log do collector
    # parou de crescer) e forca o restart quando necessario.
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 3) -RepetitionDuration (New-TimeSpan -Days 3650)
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
    Write-Host "ServerWatch Probe Collector - Remocao" -ForegroundColor White
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
    Write-Host "  Probe removido." -ForegroundColor Green
    return
}

# Modo: Atualizacao

if ($Update) {
    Write-Host "ServerWatch Probe Collector - Atualizacao" -ForegroundColor White
    $cfg = Get-ExistingConfig
    if (-not $cfg) { throw "Configuracao nao encontrada em $configPath. Use o modo de instalacao." }

    $hdrs = @{
        "Authorization"             = "Bearer $($cfg.token)"
        "X-ServerWatch-Probe-Token" = $cfg.token
    }

    Write-Step "Baixando nova versao do collector.js..."
    Invoke-WebRequest `
        -Uri     "$($cfg.serverUrl)/downloads/probe/collector.js" `
        -Headers $hdrs `
        -OutFile (Join-Path $InstallDir "collector.js.new") `
        -UseBasicParsing
    Move-Item (Join-Path $InstallDir "collector.js.new") (Join-Path $InstallDir "collector.js") -Force
    Write-OK

    Write-Step "Reiniciando probe..."
    Stop-ProbeTask
    $nodeExe = Find-NodeExe $InstallDir
    if (-not $nodeExe) {
        $nodeExe = Download-NodeRuntime $cfg.serverUrl $hdrs $InstallDir
    }
    Register-ProbeTask $nodeExe
    Write-Host "  Probe atualizado e reiniciado." -ForegroundColor Green
    return
}

# Modo: Instalacao

Write-Host "ServerWatch Probe Collector - Instalacao sem UI" -ForegroundColor White
Write-Host ""

# Defaults
if ([string]::IsNullOrWhiteSpace($ProbeId)) { $ProbeId = $env:COMPUTERNAME }
if ([string]::IsNullOrWhiteSpace($Name))    { $Name    = $ProbeId }
if ([string]::IsNullOrWhiteSpace($ServerUrl) -or [string]::IsNullOrWhiteSpace($Token)) {
    throw "Uso: .\Install-Probe-Headless.ps1 -ServerUrl URL -Token TOKEN [-ProbeId ID] [-Name NOME]"
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
    Invoke-RestMethod -Uri "$ServerUrl/api/probe/validate?probeId=$enc" -Headers $headers -TimeoutSec 15 | Out-Null
} catch {
    throw "Nao foi possivel conectar ao ServerWatch: $($_.Exception.Message)"
}
Write-OK

# 2 - Cria pasta
Write-Step "[2/6] Criando pasta de instalacao..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Write-OK

# 3 - Baixa collector.js
Write-Step "[3/6] Baixando collector.js..."
Invoke-WebRequest `
    -Uri     "$ServerUrl/downloads/probe/collector.js" `
    -Headers $headers `
    -OutFile (Join-Path $InstallDir "collector.js.new") `
    -UseBasicParsing
Move-Item (Join-Path $InstallDir "collector.js.new") (Join-Path $InstallDir "collector.js") -Force
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
Write-Host "  Instalacao concluida. O probe '$ProbeId' aparecera no ServerWatch em instantes." -ForegroundColor Green
