#requires -Version 5.1
# Run with 64-bit Windows PowerShell (powershell.exe), after installing Work Log.
# This intentionally tests Notification Center delivery, without a sound or banner.
param(
    [string]$DesktopExe = (Join-Path $env:LOCALAPPDATA 'Programs\WorkJournalPreview\WorkJournal.exe'),
    [ValidatePattern('^t[0-9a-f]{14}$')][string]$ScheduleTag
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop' -or -not [Environment]::Is64BitProcess) { throw 'Run with 64-bit Windows PowerShell 5.1.' }
$appId = 'WorkLog.Desktop'
$group = 'WorkLogTest'
$title = 'Work Log reminder test'
$manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$notifier = $manager::CreateToastNotifier($appId)
function Own-Scheduled($tag) {
    $notifier.GetScheduledToastNotifications() | Where-Object { $_.Group -ceq $group -and $_.Tag -ceq $tag -and $_.Id -ceq $tag }
}
function Own-History($tag) {
    $manager::History.GetHistory($appId) | Where-Object { $_.Group -ceq $group -and $_.Tag -ceq $tag }
}
if ($ScheduleTag) {
    # Use the actual desktop executable's protocol XML and sender identity,
    # without starting the app, its data store, or its reminder subsystem.
    $hostType = [Reflection.Assembly]::LoadFrom($DesktopExe).GetType('WindowsNotifications', $true)
    $flags = [Reflection.BindingFlags]'Static,NonPublic'
    $hostType.GetMethod('InitializeIdentity', $flags).Invoke($null, $null)
    $notifier = $hostType.GetMethod('CreateNotifier', $flags).Invoke($null, $null)
    if ($notifier.Setting.ToString() -ne 'Enabled') { throw "Windows notifications are disabled: $($notifier.Setting)" }
    $xml = $hostType.GetMethod('Content', $flags).Invoke($null, [object[]]@($title, "Background delivery verification $ScheduleTag"))
    if ($xml.DocumentElement.GetAttribute('launch') -cne 'worklog://today') { throw 'Unexpected desktop toast activation target.' }
    $audio = $xml.CreateElement('audio'); $audio.SetAttribute('silent', 'true'); $null = $xml.DocumentElement.AppendChild($audio)
    $due = [DateTimeOffset]::UtcNow.AddSeconds(10)
    $item = [Windows.UI.Notifications.ScheduledToastNotification, Windows.UI.Notifications, ContentType=WindowsRuntime]::new($xml, $due)
    $item.Id = $item.Tag = $ScheduleTag; $item.Group = $group; $item.SuppressPopup = $true
    $item.ExpirationTime = $due.AddMinutes(2)
    $notifier.AddToSchedule($item)
    [pscustomobject]@{ processId = $PID; dueUtc = $due.ToString('o') } | ConvertTo-Json -Compress
    return
}
$tag = 't' + [guid]::NewGuid().ToString('N').Substring(0,14)
$result = [ordered]@{ appId = $appId; group = $group; tag = $tag; senderPid = $null; dueUtc = $null; senderExitObservedUtc = $null;
    queuedAfterSenderExited = $false; leftSchedule = $false; historyObserved = $false; historyObservedUtc = $null;
    popupRequested = $false; cleaned = $false; passed = $false; failure = $null }
try {
    $reply = & (Join-Path $PSHOME 'powershell.exe') -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $PSCommandPath -DesktopExe $DesktopExe -ScheduleTag $tag
    if ($LASTEXITCODE -ne 0) { throw "Scheduling process failed (exit $LASTEXITCODE)." }
    $exitObserved = [DateTimeOffset]::UtcNow
    $receipt = $reply | ConvertFrom-Json
    $result.senderPid = $receipt.processId; $result.dueUtc = $receipt.dueUtc; $result.senderExitObservedUtc = $exitObserved.ToString('o')
    $due = [DateTimeOffset]::Parse($receipt.dueUtc)
    $result.queuedAfterSenderExited = ($exitObserved -lt $due -and @(Own-Scheduled $tag).Count -eq 1)
    if (-not $result.queuedAfterSenderExited) { throw 'Could not establish that Windows retained the pending reminder after the sender exited.' }
    do {
        $now = [DateTimeOffset]::UtcNow
        if ($now -ge $due) {
            $result.leftSchedule = @(Own-Scheduled $tag).Count -eq 0
            foreach ($entry in @(Own-History $tag)) {
                $lines = $entry.Content.GetElementsByTagName('text')
                if ($lines.Length -eq 2 -and $lines.Item(0).InnerText -ceq $title -and $lines.Item(1).InnerText -ceq "Background delivery verification $tag") {
                    $result.historyObserved = $true; $result.historyObservedUtc = $now.ToString('o')
                }
            }
            if ($result.leftSchedule -and $result.historyObserved) { break }
        }
        Start-Sleep -Milliseconds 350
    } while ($now -lt $due.AddSeconds(35))
    if (-not ($result.leftSchedule -and $result.historyObserved)) { throw 'Notification Center delivery was not observed within 35 seconds of the due time.' }
} catch { $result.failure = $_.Exception.Message }
finally {
    try {
        foreach ($pending in @(Own-Scheduled $tag)) { $notifier.RemoveFromSchedule($pending) }
        $manager::History.Remove($tag, $group, $appId)
        $result.cleaned = @(Own-Scheduled $tag).Count -eq 0 -and @(Own-History $tag).Count -eq 0
    } catch { $result.failure = "$($result.failure) Cleanup: $($_.Exception.Message)".Trim() }
}
$result.passed = -not $result.failure -and $result.queuedAfterSenderExited -and $result.leftSchedule -and $result.historyObserved -and $result.cleaned
[pscustomobject]$result | ConvertTo-Json
if (-not $result.passed) { exit 1 }
