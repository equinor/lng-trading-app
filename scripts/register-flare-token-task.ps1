<#
.SYNOPSIS
  Registers a Windows scheduled task that keeps the WoodMac login token fresh for the flare
  collector running on Radix.

.DESCRIPTION
  Every few hours the task signs in to WoodMac through the Edge profile in FLARE_BROWSER_PROFILE
  (Equinor single sign-on completes without a prompt) and stores the 24-hour login token in the
  flare_api_token table. It only runs while you are signed in to Windows, because the sign-in uses
  your device. If a run is missed (the machine was off) it starts as soon as the machine is back.

  Run once from a normal PowerShell window:   .\scripts\register-flare-token-task.ps1
  Remove it with:                             Unregister-ScheduledTask FlareMonitor-PublishToken
#>
param(
  [int]$EveryHours = 4,
  [string]$TaskName = 'FlareMonitor-PublishToken'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repo 'backend'
$uv = (Get-Command uv -ErrorAction Stop).Source

$action = New-ScheduledTaskAction `
  -Execute $uv `
  -Argument 'run --group collector python -m app.features.flare_monitor.collector.publish_token' `
  -WorkingDirectory $backend

$triggers = @(
  New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Hours $EveryHours) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Registered '$TaskName': at log-on and every $EveryHours hours."
Write-Host "Test it now with: Start-ScheduledTask -TaskName $TaskName"
Write-Host "Close the Edge profile in FLARE_BROWSER_PROFILE first; it cannot be open elsewhere."
