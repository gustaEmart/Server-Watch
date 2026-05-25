param(
  [string]$OutputDir = "dist\probe-installer",
  [switch]$SkipBundledNode,
  [string]$DefaultsPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$outputRoot = Join-Path $repoRoot $OutputDir
$packageDir = Join-Path $outputRoot "package"
$sedPath = Join-Path $outputRoot "ServerWatchProbeSetup.sed"
$exePath = Join-Path $outputRoot "ServerWatchProbeSetup.exe"

$iexpress = Get-Command iexpress.exe -ErrorAction SilentlyContinue
if (-not $iexpress) {
  throw "iexpress.exe nao foi encontrado neste Windows."
}

New-Item -ItemType Directory -Path $packageDir -Force | Out-Null

Copy-Item -Path (Join-Path $PSScriptRoot "Install-ProbeCollectorUi.ps1") -Destination (Join-Path $packageDir "Install-ProbeCollectorUi.ps1") -Force
Copy-Item -Path (Join-Path $PSScriptRoot "RunInstaller.vbs") -Destination (Join-Path $packageDir "RunInstaller.vbs") -Force
Copy-Item -Path (Join-Path $PSScriptRoot "RunElevated.ps1") -Destination (Join-Path $packageDir "RunElevated.ps1") -Force
Copy-Item -Path (Join-Path $repoRoot "probe\collector.js") -Destination (Join-Path $packageDir "collector.js") -Force
Copy-Item -Path (Join-Path $repoRoot "probe\setup-server.js") -Destination (Join-Path $packageDir "setup-server.js") -Force

$files = @(
  "RunInstaller.vbs",
  "RunElevated.ps1",
  "Install-ProbeCollectorUi.ps1",
  "collector.js",
  "setup-server.js"
)

if (-not [string]::IsNullOrWhiteSpace($DefaultsPath)) {
  $resolvedDefaults = Resolve-Path $DefaultsPath
  Copy-Item -Path $resolvedDefaults -Destination (Join-Path $packageDir "installer-defaults.json") -Force
  $files += "installer-defaults.json"
}

if (-not $SkipBundledNode) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "node.exe nao foi encontrado. Use -SkipBundledNode ou instale Node.js neste computador."
  }
  Copy-Item -Path $node.Source -Destination (Join-Path $packageDir "node.exe") -Force
  $files += "node.exe"
}

$fileStrings = New-Object System.Collections.Generic.List[string]
$sourceFiles = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $files.Count; $i++) {
  $fileStrings.Add("FILE$i=$($files[$i])")
  $sourceFiles.Add("%FILE$i%=")
}

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$exePath
FriendlyName=ServerWatch Probe Collector
AppLaunched=wscript.exe RunInstaller.vbs
PostInstallCmd=<None>
AdminQuietInstCmd=wscript.exe RunInstaller.vbs
UserQuietInstCmd=wscript.exe RunInstaller.vbs
$($fileStrings -join "`r`n")

[SourceFiles]
SourceFiles0=$packageDir\

[SourceFiles0]
$($sourceFiles -join "`r`n")
"@

$sed | Set-Content -Path $sedPath -Encoding ASCII

$process = Start-Process `
  -FilePath $iexpress.Source `
  -ArgumentList "/N", $sedPath `
  -Wait `
  -PassThru

if ($process.ExitCode -ne 0) {
  throw "Falha ao gerar o instalador com iexpress.exe. Codigo: $($process.ExitCode)"
}

if (-not (Test-Path $exePath)) {
  throw "O instalador nao foi gerado em $exePath."
}

Write-Host "Installer generated at $exePath"
