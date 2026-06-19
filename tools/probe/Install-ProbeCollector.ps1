param(
  [string]$ServerUrl,

  [string]$ProbeId,

  [string]$Token,

  [string]$Name,

  [string]$InstallDir = "C:\ProgramData\ServerWatchProbe"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator."
  }
}

Assert-Admin

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js 20+ is required. Install Node.js before running this installer."
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path "probe\collector.js" -Destination (Join-Path $InstallDir "collector.js") -Force
Copy-Item -Path "probe\setup-server.js" -Destination (Join-Path $InstallDir "setup-server.js") -Force

$configPath = Join-Path $InstallDir "config.json"

if (-not $ServerUrl -or -not $ProbeId -or -not $Token) {
  Write-Host "Opening ServerWatch Probe setup at http://localhost:8777/setup"
  $setup = Start-Process `
    -FilePath $node.Source `
    -ArgumentList "`"$InstallDir\setup-server.js`" --config `"$configPath`"" `
    -WindowStyle Hidden `
    -PassThru
  try {
    Start-Process "http://localhost:8777/setup"
    Read-Host "After saving the configuration in the browser, press Enter to finish the installation"
  } finally {
    if ($setup -and -not $setup.HasExited) {
      Stop-Process -Id $setup.Id -Force
    }
  }

  if (-not (Test-Path $configPath)) {
    throw "Configuration was not saved. Run the installer again and complete the setup form."
  }

  $savedConfig = Get-Content $configPath -Raw | ConvertFrom-Json
  $ServerUrl = $savedConfig.serverUrl
  $ProbeId = $savedConfig.probeId
  $Name = $savedConfig.name
  $Token = $savedConfig.token
}

if (-not $Name) {
  $Name = $ProbeId
}

if (-not (Test-Path $configPath)) {
  $config = [ordered]@{
    serverUrl = $ServerUrl
    probeId = $ProbeId
    name = $Name
    token = $Token
    intervalSeconds = 10
    timeoutMs = 2500
  }
  $config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8
}

$action = New-ScheduledTaskAction `
  -Execute $node.Source `
  -Argument "`"$InstallDir\collector.js`" --config `"$configPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName "ServerWatch Probe Collector" `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Start-ScheduledTask -TaskName "ServerWatch Probe Collector"
Write-Host "ServerWatch Probe Collector installed and started."
