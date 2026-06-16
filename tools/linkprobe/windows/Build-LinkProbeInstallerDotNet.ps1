param(
  [string]$OutputDir = "dist\linkprobe-installer-dotnet",
  [switch]$FrameworkDependent,
  [switch]$SkipDownloadCopy
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$projectDir = Join-Path $PSScriptRoot "dotnet-installer"
$assetsDir = Join-Path $projectDir "assets"
$publishDir = Join-Path $repoRoot $OutputDir

$dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
if (-not $dotnet) {
  throw "dotnet.exe nao foi encontrado."
}

New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

$linkProbeBinary = Join-Path $repoRoot "downloads\linkprobe-windows-amd64.exe"
if (-not (Test-Path $linkProbeBinary)) {
  throw "Binario Windows do LinkProbe nao encontrado em $linkProbeBinary."
}

Copy-Item -Path $linkProbeBinary -Destination (Join-Path $assetsDir "linkprobe.exe") -Force

$project = Join-Path $projectDir "ServerWatchLinkProbeInstaller.csproj"
$selfContained = if ($FrameworkDependent) { "false" } else { "true" }

& $dotnet.Source publish $project `
  -c Release `
  -r win-x64 `
  --self-contained $selfContained `
  -p:PublishSingleFile=true `
  -p:EnableCompressionInSingleFile=true `
  -o $publishDir

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao publicar o instalador .NET do LinkProbe. Codigo: $LASTEXITCODE"
}

$exePath = Join-Path $publishDir "ServerWatchLinkProbeSetup.exe"
if (-not (Test-Path $exePath)) {
  throw "O instalador nao foi gerado em $exePath."
}

if (-not $SkipDownloadCopy) {
  $downloadsDir = Join-Path $repoRoot "downloads"
  $downloadExePath = Join-Path $downloadsDir "ServerWatchLinkProbeSetup.exe"
  New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null
  Copy-Item -Path $exePath -Destination $downloadExePath -Force
  Write-Host "Installer copied to $downloadExePath"
}

Write-Host "Installer generated at $exePath"
