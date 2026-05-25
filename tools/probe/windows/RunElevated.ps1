Add-Type -AssemblyName System.Windows.Forms

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$installer = Join-Path $scriptDir "Install-ProbeCollectorUi.ps1"

if (-not (Test-Path $installer)) {
  [System.Windows.Forms.MessageBox]::Show(
    "Arquivo do instalador nao encontrado: $installer",
    "ServerWatch Probe Collector",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}

try {
  $escapedInstaller = $installer.Replace('"', '""')
  $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$escapedInstaller`""
  $process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -WorkingDirectory $scriptDir `
    -Verb RunAs `
    -PassThru `
    -Wait

  exit $process.ExitCode
} catch {
  [System.Windows.Forms.MessageBox]::Show(
    "Nao foi possivel solicitar permissao de Administrador. Execute o instalador novamente e aceite o UAC. Detalhe: $($_.Exception.Message)",
    "ServerWatch Probe Collector",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  ) | Out-Null
  exit 1
}
