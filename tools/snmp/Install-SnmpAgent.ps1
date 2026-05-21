param(
  [Parameter(Mandatory = $true)]
  [string]$ManagerAddress,

  [string]$Community = "serverwatch-ro",

  [int]$Port = 161,

  [string]$Location = "ServerWatch monitored host",

  [string]$Contact = "ServerWatch"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script in PowerShell as Administrator."
  }
}

function Install-SnmpFeature {
  $service = Get-Service -Name SNMP -ErrorAction SilentlyContinue
  if ($service) {
    return
  }

  $capability = Get-Command Add-WindowsCapability -ErrorAction SilentlyContinue
  if ($capability) {
    try {
      $snmpCapability = Get-WindowsCapability -Online -Name "SNMP.Client~~~~0.0.1.0" -ErrorAction Stop
      if ($snmpCapability.State -ne "Installed") {
        Add-WindowsCapability -Online -Name "SNMP.Client~~~~0.0.1.0" | Out-Null
      }
    } catch {
      Write-Warning "Could not install SNMP with Windows Capability: $($_.Exception.Message)"
    }
  }

  $service = Get-Service -Name SNMP -ErrorAction SilentlyContinue
  if ($service) {
    return
  }

  $serverManager = Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue
  if ($serverManager) {
    try {
      Install-WindowsFeature -Name SNMP-Service -IncludeManagementTools | Out-Null
    } catch {
      Write-Warning "Could not install SNMP with Windows Feature: $($_.Exception.Message)"
    }
  }

  $service = Get-Service -Name SNMP -ErrorAction SilentlyContinue
  if (-not $service) {
    throw "SNMP service is not available on this Windows installation. Install an SNMP agent manually or use another agent strategy."
  }
}

function Set-SnmpRegistry {
  $base = "HKLM:\SYSTEM\CurrentControlSet\Services\SNMP\Parameters"
  $validCommunities = Join-Path $base "ValidCommunities"
  $permittedManagers = Join-Path $base "PermittedManagers"
  $agent = Join-Path $base "RFC1156Agent"

  New-Item -Path $validCommunities -Force | Out-Null
  New-ItemProperty -Path $validCommunities -Name $Community -PropertyType DWord -Value 4 -Force | Out-Null

  New-Item -Path $permittedManagers -Force | Out-Null
  $existing = Get-ItemProperty -Path $permittedManagers
  $alreadyAllowed = $existing.PSObject.Properties | Where-Object { $_.Value -eq $ManagerAddress }
  if (-not $alreadyAllowed) {
    $indexes = $existing.PSObject.Properties |
      Where-Object { $_.Name -match "^\d+$" } |
      ForEach-Object { [int]$_.Name }
    $nextIndex = if ($indexes) { ($indexes | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    New-ItemProperty -Path $permittedManagers -Name ([string]$nextIndex) -PropertyType String -Value $ManagerAddress -Force | Out-Null
  }

  New-Item -Path $agent -Force | Out-Null
  New-ItemProperty -Path $agent -Name "sysContact" -PropertyType String -Value $Contact -Force | Out-Null
  New-ItemProperty -Path $agent -Name "sysLocation" -PropertyType String -Value $Location -Force | Out-Null
}

function Set-SnmpFirewall {
  $ruleName = "ServerWatch SNMP Agent UDP $Port"
  $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existingRule) {
    Remove-NetFirewallRule -DisplayName $ruleName
  }

  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol UDP `
    -LocalPort $Port `
    -RemoteAddress $ManagerAddress | Out-Null
}

Assert-Admin
Install-SnmpFeature
Set-SnmpRegistry
Set-SnmpFirewall

Set-Service -Name SNMP -StartupType Automatic
Restart-Service -Name SNMP -Force

Write-Host "SNMP agent configured."
Write-Host "Allowed manager: $ManagerAddress"
Write-Host "Community: $Community"
Write-Host "Test from ServerWatch host:"
Write-Host "  snmpget -v2c -c $Community <this-host-ip> 1.3.6.1.2.1.1.3.0"
