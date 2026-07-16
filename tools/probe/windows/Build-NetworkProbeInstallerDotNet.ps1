param(
  [string]$OutputDir = "dist\network-probe-installer-dotnet",
  [switch]$FrameworkDependent,
  [switch]$SkipDownloadCopy
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$projectDir = Join-Path $PSScriptRoot "network-dotnet-installer"
$assetsDir = Join-Path $projectDir "assets"
$publishDir = Join-Path $repoRoot $OutputDir

$dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
if (-not $dotnet) {
  throw "dotnet.exe nao foi encontrado."
}

New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

Copy-Item -Path (Join-Path $repoRoot "probe\network-collector.js") -Destination (Join-Path $assetsDir "network-collector.js") -Force
Copy-Item -Path (Join-Path $repoRoot "probe\snmp\client.js") -Destination (Join-Path $assetsDir "snmp-client.js") -Force
Copy-Item -Path (Join-Path $repoRoot "probe\snmp\vendor-templates.js") -Destination (Join-Path $assetsDir "vendor-templates.js") -Force
Copy-Item -Path (Join-Path $repoRoot "probe\snmp\poller.js") -Destination (Join-Path $assetsDir "poller.js") -Force

$project = Join-Path $projectDir "ServerWatchNetworkProbeInstaller.csproj"
$selfContained = if ($FrameworkDependent) { "false" } else { "true" }

& $dotnet.Source publish $project `
  -c Release `
  -r win-x64 `
  --self-contained $selfContained `
  -p:PublishSingleFile=true `
  -p:EnableCompressionInSingleFile=true `
  -o $publishDir

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao publicar o instalador .NET. Codigo: $LASTEXITCODE"
}

$exePath = Join-Path $publishDir "ServerWatchNetworkProbeSetup.exe"
if (-not (Test-Path $exePath)) {
  throw "O instalador nao foi gerado em $exePath."
}

if (-not $SkipDownloadCopy) {
  $downloadsDir = Join-Path $repoRoot "downloads"
  $downloadExePath = Join-Path $downloadsDir "ServerWatchNetworkProbeSetup.exe"
  New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null
  Copy-Item -Path $exePath -Destination $downloadExePath -Force
  Write-Host "Installer copied to $downloadExePath"
}

Write-Host "Installer generated at $exePath"
