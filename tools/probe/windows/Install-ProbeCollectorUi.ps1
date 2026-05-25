Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultsPath = Join-Path $sourceDir "installer-defaults.json"
$installDir = Join-Path $env:ProgramData "ServerWatchProbe"
$configPath = Join-Path $installDir "config.json"
$taskName = "ServerWatch Probe Collector"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  try {
    Start-Process `
      -FilePath "powershell.exe" `
      -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"" `
      -WorkingDirectory $sourceDir `
      -Verb RunAs | Out-Null
  } catch {
    [System.Windows.Forms.MessageBox]::Show(
      "Nao foi possivel solicitar permissao de Administrador. Execute o instalador novamente e aceite o UAC.",
      "ServerWatch Probe Collector",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
  }
  exit 1
}

function Get-DefaultProbeName {
  try {
    $hostName = [System.Net.Dns]::GetHostName()
    if (-not [string]::IsNullOrWhiteSpace($hostName)) {
      return $hostName.Trim()
    }
  } catch {
  }
  if (-not [string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) {
    return $env:COMPUTERNAME.Trim()
  }
  return "serverwatch-probe"
}

function Get-LocalIPv4Addresses {
  try {
    return @(
      [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
        Where-Object {
          $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
          -not $_.IPAddressToString.StartsWith("127.") -and
          -not $_.IPAddressToString.StartsWith("169.254.")
        } |
        ForEach-Object { $_.IPAddressToString }
    )
  } catch {
    return @()
  }
}

function Get-LocalMacAddresses {
  try {
    $macs = @()
    if (Get-Command Get-NetAdapter -ErrorAction SilentlyContinue) {
      $macs = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -ne "Disabled" -and -not [string]::IsNullOrWhiteSpace($_.MacAddress) } |
        ForEach-Object { $_.MacAddress.ToLowerInvariant().Replace("-", ":") }
    }
    if (-not $macs -or $macs.Count -eq 0) {
      $macs = Get-CimInstance Win32_NetworkAdapter -ErrorAction SilentlyContinue |
        Where-Object { $_.PhysicalAdapter -and -not [string]::IsNullOrWhiteSpace($_.MACAddress) } |
        ForEach-Object { $_.MACAddress.ToLowerInvariant() }
    }
    return @(
      $macs |
        Where-Object { $_ -match "^[0-9a-f]{2}(:[0-9a-f]{2}){5}$" -and $_ -ne "00:00:00:00:00:00" } |
        Select-Object -Unique
    )
  } catch {
    return @()
  }
}

function Read-ExistingConfig {
  $defaultName = Get-DefaultProbeName
  if (Test-Path $defaultsPath) {
    try {
      $defaults = Get-Content $defaultsPath -Raw | ConvertFrom-Json
      return @{
        serverUrl = [string]$defaults.serverUrl
        probeId = $(if ([string]::IsNullOrWhiteSpace([string]$defaults.probeId)) { $defaultName } else { [string]$defaults.probeId })
        name = $(if ([string]::IsNullOrWhiteSpace([string]$defaults.name)) { $defaultName } else { [string]$defaults.name })
        token = [string]$defaults.token
        intervalSeconds = $(if ($defaults.intervalSeconds) { [int]$defaults.intervalSeconds } else { 10 })
        timeoutMs = $(if ($defaults.timeoutMs) { [int]$defaults.timeoutMs } else { 2500 })
      }
    } catch {
    }
  }

  if (-not (Test-Path $configPath)) {
    return @{
      serverUrl = ""
      probeId = $defaultName
      name = $defaultName
      token = ""
      intervalSeconds = 10
      timeoutMs = 2500
    }
  }

  try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    return @{
      serverUrl = [string]$config.serverUrl
      probeId = [string]$config.probeId
      name = [string]$config.name
      token = [string]$config.token
      intervalSeconds = [int]$config.intervalSeconds
      timeoutMs = [int]$config.timeoutMs
    }
  } catch {
    return @{
      serverUrl = ""
      probeId = $defaultName
      name = $defaultName
      token = ""
      intervalSeconds = 10
      timeoutMs = 2500
    }
  }
}

function Has-CompleteConfig($values) {
  return (
    -not [string]::IsNullOrWhiteSpace($values.serverUrl) -and
    -not [string]::IsNullOrWhiteSpace($values.probeId) -and
    -not [string]::IsNullOrWhiteSpace($values.token)
  )
}

function New-ServerWatchIcon {
  $bitmap = New-Object System.Drawing.Bitmap 32, 32
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $background = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#dc2626"))
  $foreground = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)

  $graphics.FillRectangle($background, 0, 0, 32, 32)
  $size = $graphics.MeasureString("SW", $font)
  $x = [Math]::Max(0, (32 - $size.Width) / 2)
  $y = [Math]::Max(0, (32 - $size.Height) / 2 - 1)
  $graphics.DrawString("SW", $font, $foreground, $x, $y)

  $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
  $graphics.Dispose()
  $background.Dispose()
  $foreground.Dispose()
  $font.Dispose()
  $bitmap.Dispose()
  return $icon
}

function Set-InstallProgress($value, $message) {
  if ($script:progressBar) {
    $script:progressBar.Value = [Math]::Max($script:progressBar.Minimum, [Math]::Min($script:progressBar.Maximum, [int]$value))
  }
  if ($script:statusLabel) {
    $script:statusLabel.Text = $message
  }
  [System.Windows.Forms.Application]::DoEvents()
}

function Get-NodeSource {
  Set-InstallProgress 25 "Verificando runtime Node.js..."
  $bundled = Join-Path $sourceDir "node.exe"
  if (Test-Path $bundled) {
    return $bundled
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    return $node.Source
  }

  throw "Node.js nao foi encontrado. Gere o instalador com node.exe embutido ou instale Node.js 20+."
}

function Register-Probe($values) {
  Set-InstallProgress 80 "Registrando probe no ServerWatch..."
  $serverUrl = $values.serverUrl.TrimEnd("/")
  $probeId = [System.Uri]::EscapeDataString($values.probeId.Trim())
  $probeName = $(if ([string]::IsNullOrWhiteSpace($values.name)) { $values.probeId.Trim() } else { $values.name.Trim() })
  $probeName = [System.Uri]::EscapeDataString($probeName)
  $addresses = @(Get-LocalIPv4Addresses)
  $primaryAddress = $(if ($addresses.Count -gt 0) { $addresses[0] } else { "" })
  $encodedAddresses = [System.Uri]::EscapeDataString((ConvertTo-Json -Compress -InputObject @($addresses)))
  $macAddresses = @(Get-LocalMacAddresses)
  $primaryMac = [System.Uri]::EscapeDataString($(if ($macAddresses.Count -gt 0) { $macAddresses[0] } else { "" }))
  $encodedMacAddresses = [System.Uri]::EscapeDataString((ConvertTo-Json -Compress -InputObject @($macAddresses)))
  $hostName = [System.Uri]::EscapeDataString((Get-DefaultProbeName))
  $targetUrl = "$serverUrl/api/probe/targets?probeId=$probeId&name=$probeName&version=0.1.0-installer&hostName=$hostName&primaryAddress=$primaryAddress&addresses=$encodedAddresses&platform=windows&primaryMac=$primaryMac&macAddresses=$encodedMacAddresses"
  $headers = @{
    Authorization = "Bearer $($values.token.Trim())"
    "X-ServerWatch-Probe-Token" = $values.token.Trim()
  }

  try {
    Invoke-RestMethod -Method Get -Uri $targetUrl -Headers $headers -TimeoutSec 20 | Out-Null
  } catch {
    throw "O probe foi instalado, mas nao conseguiu se registrar no ServerWatch. Verifique URL, token e acesso de rede. Detalhe: $($_.Exception.Message)"
  }
}

function Validate-Config($values) {
  if ($values.serverUrl -notmatch "^https?://") {
    throw "A URL do ServerWatch deve iniciar com http:// ou https://."
  }
  if ([string]::IsNullOrWhiteSpace($values.probeId)) {
    throw "Informe o ID do probe."
  }
  if ([string]::IsNullOrWhiteSpace($values.token)) {
    throw "Informe o token."
  }
  if ($values.intervalSeconds -lt 3) {
    throw "O intervalo minimo e 3 segundos."
  }
  if ($values.timeoutMs -lt 500) {
    throw "O timeout minimo e 500 ms."
  }
}

function Stop-ExistingProbe {
  Set-InstallProgress 8 "Parando instalacao anterior, se existir..."

  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    try {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    } catch {
    }
  }

  $collectorPath = (Join-Path $installDir "collector.js").ToLowerInvariant()
  $nodePath = (Join-Path $installDir "node.exe").ToLowerInvariant()
  $deadline = (Get-Date).AddSeconds(12)

  do {
    $running = @()
    try {
      $running = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $commandLine = ([string]$_.CommandLine).ToLowerInvariant()
        $executablePath = ([string]$_.ExecutablePath).ToLowerInvariant()
        $commandLine.Contains($collectorPath) -or $executablePath -eq $nodePath
      })
    } catch {
      $running = @()
    }

    if ($running.Count -eq 0) {
      return
    }

    foreach ($process in $running) {
      try {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
      } catch {
      }
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Nao foi possivel parar a instalacao anterior do Probe Collector. Feche processos node.exe relacionados ao ServerWatch ou reinicie o Windows e tente novamente."
}

function Copy-WithRetry($source, $destination, $description) {
  for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
      Copy-Item -Path $source -Destination $destination -Force
      return
    } catch {
      if ($attempt -eq 6) {
        throw "Nao foi possivel copiar $description para $destination. O arquivo pode estar em uso por uma instalacao anterior. Detalhe: $($_.Exception.Message)"
      }
      Start-Sleep -Milliseconds (400 * $attempt)
      [System.Windows.Forms.Application]::DoEvents()
    }
  }
}

function Install-Probe($values) {
  Validate-Config $values

  Stop-ExistingProbe

  Set-InstallProgress 10 "Criando pasta de instalacao..."
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null

  Set-InstallProgress 18 "Copiando arquivos do collector..."
  Copy-WithRetry (Join-Path $sourceDir "collector.js") (Join-Path $installDir "collector.js") "collector.js"
  if (Test-Path (Join-Path $sourceDir "setup-server.js")) {
    Copy-WithRetry (Join-Path $sourceDir "setup-server.js") (Join-Path $installDir "setup-server.js") "setup-server.js"
  }

  $nodeSource = Get-NodeSource
  Set-InstallProgress 38 "Copiando runtime Node.js..."
  $nodeTarget = Join-Path $installDir "node.exe"
  if ((Split-Path -Leaf $nodeSource) -eq "node.exe") {
    Copy-WithRetry $nodeSource $nodeTarget "node.exe"
  } else {
    $nodeTarget = $nodeSource
  }

  $config = [ordered]@{
    serverUrl = $values.serverUrl.TrimEnd("/")
    probeId = $values.probeId.Trim()
    name = $(if ([string]::IsNullOrWhiteSpace($values.name)) { $values.probeId.Trim() } else { $values.name.Trim() })
    token = $values.token.Trim()
    intervalSeconds = $values.intervalSeconds
    timeoutMs = $values.timeoutMs
  }
  Set-InstallProgress 52 "Salvando configuracao..."
  $config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

  Set-InstallProgress 62 "Configurando tarefa agendada..."
  $action = New-ScheduledTaskAction `
    -Execute $nodeTarget `
    -Argument "`"$installDir\collector.js`" --config `"$configPath`"" `
    -WorkingDirectory $installDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null

  Set-InstallProgress 74 "Iniciando Probe Collector..."
  Start-ScheduledTask -TaskName $taskName
  Register-Probe $values
  Set-InstallProgress 100 "Instalacao concluida. O probe ja foi registrado no ServerWatch."
}

$existing = Read-ExistingConfig
$appIcon = New-ServerWatchIcon

if ((Test-Path $defaultsPath) -and (Has-CompleteConfig $existing)) {
  $progressForm = New-Object System.Windows.Forms.Form
  $progressForm.Text = "ServerWatch Probe Collector"
  $progressForm.StartPosition = "CenterScreen"
  $progressForm.ClientSize = New-Object System.Drawing.Size(480, 116)
  $progressForm.FormBorderStyle = "FixedDialog"
  $progressForm.MaximizeBox = $false
  $progressForm.MinimizeBox = $false
  $progressForm.Icon = $appIcon

  $autoLabel = New-Object System.Windows.Forms.Label
  $autoLabel.Location = New-Object System.Drawing.Point(18, 18)
  $autoLabel.Size = New-Object System.Drawing.Size(444, 20)
  $autoLabel.Text = "Instalando ServerWatch Probe Collector..."
  $progressForm.Controls.Add($autoLabel)
  $script:statusLabel = $autoLabel

  $autoProgress = New-Object System.Windows.Forms.ProgressBar
  $autoProgress.Location = New-Object System.Drawing.Point(18, 52)
  $autoProgress.Size = New-Object System.Drawing.Size(444, 22)
  $autoProgress.Minimum = 0
  $autoProgress.Maximum = 100
  $progressForm.Controls.Add($autoProgress)
  $script:progressBar = $autoProgress

  $progressForm.Show()
  [System.Windows.Forms.Application]::DoEvents()

  try {
    Install-Probe $existing
    [System.Windows.Forms.MessageBox]::Show(
      "Probe instalado, iniciado e cadastrado automaticamente.",
      "ServerWatch Probe Collector",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    $progressForm.Close()
    exit 0
  } catch {
    Set-InstallProgress 0 $_.Exception.Message
    [System.Windows.Forms.MessageBox]::Show(
      $_.Exception.Message,
      "Erro na instalacao",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    $progressForm.Close()
    exit 1
  }
}

function Color($hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

$colorBg = Color "#eef2f3"
$colorSurface = Color "#ffffff"
$colorText = Color "#142022"
$colorMuted = Color "#657477"
$colorAccent = Color "#123c69"
$colorAccentStrong = Color "#0b2545"
$colorDanger = Color "#dc2626"
$colorLine = Color "#dbe3e4"

$form = New-Object System.Windows.Forms.Form
$form.Text = "ServerWatch Probe Collector"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(640, 520)
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = $colorBg
$form.Icon = $appIcon

$font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Font = $font

$header = New-Object System.Windows.Forms.Panel
$header.Location = New-Object System.Drawing.Point(0, 0)
$header.Size = New-Object System.Drawing.Size(640, 112)
$header.BackColor = $colorAccentStrong
$form.Controls.Add($header)

$brandMark = New-Object System.Windows.Forms.Label
$brandMark.Text = "SW"
$brandMark.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$brandMark.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$brandMark.ForeColor = [System.Drawing.Color]::White
$brandMark.BackColor = $colorDanger
$brandMark.Location = New-Object System.Drawing.Point(26, 24)
$brandMark.Size = New-Object System.Drawing.Size(42, 42)
$header.Controls.Add($brandMark)

$brand = New-Object System.Windows.Forms.Label
$brand.Text = "ServerWatch"
$brand.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$brand.ForeColor = [System.Drawing.Color]::White
$brand.BackColor = $colorAccentStrong
$brand.Location = New-Object System.Drawing.Point(80, 22)
$brand.Size = New-Object System.Drawing.Size(200, 22)
$header.Controls.Add($brand)

$caption = New-Object System.Windows.Forms.Label
$caption.Text = "Probe Collector"
$caption.ForeColor = Color "#9fb9b9"
$caption.BackColor = $colorAccentStrong
$caption.Location = New-Object System.Drawing.Point(80, 44)
$caption.Size = New-Object System.Drawing.Size(200, 20)
$header.Controls.Add($caption)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Instalar probe local"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::White
$title.BackColor = $colorAccentStrong
$title.Location = New-Object System.Drawing.Point(318, 24)
$title.Size = New-Object System.Drawing.Size(290, 28)
$title.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
$header.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Configure a conexao de saida com o ServerWatch central."
$subtitle.ForeColor = Color "#d8e9e7"
$subtitle.BackColor = $colorAccentStrong
$subtitle.Location = New-Object System.Drawing.Point(248, 55)
$subtitle.Size = New-Object System.Drawing.Size(360, 22)
$subtitle.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
$header.Controls.Add($subtitle)

$card = New-Object System.Windows.Forms.Panel
$card.Location = New-Object System.Drawing.Point(22, 132)
$card.Size = New-Object System.Drawing.Size(596, 322)
$card.BackColor = $colorSurface
$form.Controls.Add($card)

function Add-Label($text, $x, $y) {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $text
  $label.ForeColor = $colorText
  $label.BackColor = $colorSurface
  $label.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
  $label.Location = New-Object System.Drawing.Point($x, $y)
  $label.Size = New-Object System.Drawing.Size(210, 20)
  $card.Controls.Add($label)
  return $label
}

function Add-TextBox($x, $y, $width, $text, $password = $false) {
  $box = New-Object System.Windows.Forms.TextBox
  $box.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $box.BackColor = [System.Drawing.Color]::White
  $box.ForeColor = $colorText
  $box.Location = New-Object System.Drawing.Point($x, $y)
  $box.Size = New-Object System.Drawing.Size($width, 24)
  $box.Text = $text
  if ($password) {
    $box.UseSystemPasswordChar = $true
  }
  $card.Controls.Add($box)
  return $box
}

function Add-Number($x, $y, $width, $value, $minimum, $maximum) {
  $box = New-Object System.Windows.Forms.NumericUpDown
  $box.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $box.BackColor = [System.Drawing.Color]::White
  $box.ForeColor = $colorText
  $box.Location = New-Object System.Drawing.Point($x, $y)
  $box.Size = New-Object System.Drawing.Size($width, 24)
  $box.Minimum = $minimum
  $box.Maximum = $maximum
  $box.Value = $value
  $card.Controls.Add($box)
  return $box
}

Add-Label "URL do ServerWatch" 22 22 | Out-Null
$serverUrlBox = Add-TextBox 22 45 552 $existing.serverUrl

Add-Label "ID do probe" 22 84 | Out-Null
$probeIdBox = Add-TextBox 22 107 260 $existing.probeId

Add-Label "Nome" 314 84 | Out-Null
$nameBox = Add-TextBox 314 107 260 $existing.name

Add-Label "Token" 22 146 | Out-Null
$tokenBox = Add-TextBox 22 169 552 $existing.token $true

Add-Label "Intervalo em segundos" 22 208 | Out-Null
$intervalBox = Add-Number 22 231 120 $existing.intervalSeconds 3 3600

Add-Label "Timeout em ms" 172 208 | Out-Null
$timeoutBox = Add-Number 172 231 120 $existing.timeoutMs 500 60000

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(22, 272)
$progressBar.Size = New-Object System.Drawing.Size(552, 18)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$progressBar.Value = 0
$card.Controls.Add($progressBar)
$script:progressBar = $progressBar

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(22, 300)
$status.Size = New-Object System.Drawing.Size(552, 18)
$status.ForeColor = $colorMuted
$status.BackColor = $colorSurface
$status.Text = "O probe sera instalado em C:\ProgramData\ServerWatchProbe."
$card.Controls.Add($status)
$script:statusLabel = $status

$installButton = New-Object System.Windows.Forms.Button
$installButton.Text = "Instalar e iniciar"
$installButton.Location = New-Object System.Drawing.Point(458, 470)
$installButton.Size = New-Object System.Drawing.Size(160, 34)
$installButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$installButton.FlatAppearance.BorderSize = 0
$installButton.BackColor = $colorAccent
$installButton.ForeColor = [System.Drawing.Color]::White
$installButton.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($installButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = "Cancelar"
$cancelButton.Location = New-Object System.Drawing.Point(344, 470)
$cancelButton.Size = New-Object System.Drawing.Size(100, 34)
$cancelButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$cancelButton.FlatAppearance.BorderColor = $colorLine
$cancelButton.BackColor = $colorSurface
$cancelButton.ForeColor = $colorText
$cancelButton.Add_Click({ $form.Close() })
$form.Controls.Add($cancelButton)

$installButton.Add_Click({
  $installButton.Enabled = $false
  $cancelButton.Enabled = $false
  Set-InstallProgress 0 "Instalando..."
  try {
    $values = @{
      serverUrl = $serverUrlBox.Text
      probeId = $probeIdBox.Text
      name = $nameBox.Text
      token = $tokenBox.Text
      intervalSeconds = [int]$intervalBox.Value
      timeoutMs = [int]$timeoutBox.Value
    }
    Install-Probe $values
    [System.Windows.Forms.MessageBox]::Show(
      "ServerWatch Probe Collector instalado, iniciado e registrado com sucesso.",
      "ServerWatch Probe Collector",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    $form.Close()
  } catch {
    Set-InstallProgress 0 $_.Exception.Message
    [System.Windows.Forms.MessageBox]::Show(
      $_.Exception.Message,
      "Erro na instalacao",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } finally {
    $installButton.Enabled = $true
    $cancelButton.Enabled = $true
  }
})

[void]$form.ShowDialog()
