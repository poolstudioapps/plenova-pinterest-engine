# Registers the daily TikTok spy pass on this computer.
#
#   npm run spy:install
#
# Every day at 9:00, without a window (conhost --headless). If the computer was
# off or asleep at 9:00, the pass runs as soon as it is back (StartWhenAvailable).
# Runs as the current user, while the session is open. Re-running this replaces
# the task; to remove it:  Unregister-ScheduledTask -TaskName "Plenova Spy TikTok"
# Logs: .data\spy-logs\<date>.log

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source

$action = New-ScheduledTaskAction `
  -Execute "conhost.exe" `
  -Argument "--headless `"$node`" scripts\tiktok-spy.mjs" `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 9:00
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName "Plenova Spy TikTok" `
  -Description "Plenova Studio : relève chaque jour les carrousels des comptes TikTok suivis et les envoie dans Supabase. Logs : $root\.data\spy-logs" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Force | Out-Null

$task = Get-ScheduledTask -TaskName "Plenova Spy TikTok"
Write-Output "Tâche « $($task.TaskName) » : $($task.State), chaque jour à 9:00, depuis $root"
