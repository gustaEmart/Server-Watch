param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl,

  [Parameter(Mandatory = $true)]
  [string]$ProbeId,

  [Parameter(Mandatory = $true)]
  [string]$Token,

  [string]$Name,

  [string]$InstallDir = "C:\ProgramData\ServerWatchNetworkProbe"
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

if (-not $Name) {
  $Name = $ProbeId
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallDir "snmp") -Force | Out-Null
Copy-Item -Path "probe\network-collector.js" -Destination (Join-Path $InstallDir "network-collector.js") -Force
Copy-Item -Path "probe\snmp\client.js" -Destination (Join-Path $InstallDir "snmp\client.js") -Force
Copy-Item -Path "probe\snmp\vendor-templates.js" -Destination (Join-Path $InstallDir "snmp\vendor-templates.js") -Force

$configPath = Join-Path $InstallDir "config.json"
$config = [ordered]@{
  serverUrl = $ServerUrl.TrimEnd("/")
  probeId = $ProbeId
  name = $Name
  token = $Token
  intervalSeconds = 60
  timeoutMs = 3000
}
$config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

$action = New-ScheduledTaskAction `
  -Execute $node.Source `
  -Argument "`"$InstallDir\network-collector.js`" --config `"$configPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName "ServerWatch Network Probe" `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Start-ScheduledTask -TaskName "ServerWatch Network Probe"
Write-Host "ServerWatch Network Probe installed and started."
