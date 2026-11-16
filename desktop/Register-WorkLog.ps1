#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Verify', 'Uninstall')][string]$Mode = 'Install',
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\WorkJournalPreview')
)
$ErrorActionPreference = 'Stop'
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$exe = Join-Path $InstallDir 'WorkJournal.exe'
$icon = Join-Path $InstallDir 'WorkJournal.ico'
$logo = Join-Path $InstallDir 'app\src\assets\app-icon.png'
# Updating registration must preserve the user's chosen accent. All shell
# surfaces use the same multi-resolution icon as the running window.
$appearance = Join-Path $env:LOCALAPPDATA 'WorkJournal\appearance'
$colorFile = Join-Path $appearance 'color.txt'
if ([IO.File]::Exists($colorFile)) {
    $color = [IO.File]::ReadAllText($colorFile).Trim()
    if ($color -match '^#[0-9a-fA-F]{6}$') {
        $customIcon = Join-Path $appearance ('desktop-v2-' + $color.Substring(1).ToLowerInvariant() + '.ico')
        $customLogo = Join-Path $appearance ('icon-' + $color.Substring(1) + '.png')
        if ([IO.File]::Exists($customIcon)) { $icon = $customIcon }
        if ([IO.File]::Exists($customLogo)) { $logo = $customLogo }
    }
}
$uninstaller = Join-Path $InstallDir 'Uninstall.exe'
$menuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'Work Log'
$menu = Join-Path $menuDir 'Work Log.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Work Log.lnk'
$arp = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview'
$scheme = 'Software\Classes\worklog'
$open = "$scheme\shell\open\command"
# Only this fixed action is needed. Never interpolate an external URI into the
# command line: WorkJournal also accepts developer-only flags like --data-dir.
$command = '"{0}" --open-today' -f $exe
if (-not ('WorkLogRegistrationShortcut' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'RegistrationShortcut.cs')
}
$aumid = [WorkLogRegistrationShortcut]::AppId
$identity = "Software\Classes\AppUserModelId\$aumid"
$registry = [Microsoft.Win32.Registry]::CurrentUser
function Read-Value($path, $name) {
    $key = $registry.OpenSubKey($path)
    if ($key) { try { $key.GetValue($name) } finally { $key.Dispose() } }
}
function Has-Key($path) {
    $key = $registry.OpenSubKey($path)
    if (-not $key) { return $false }
    $key.Dispose()
    return $true
}
function Write-Values($path, $values) {
    $key = $registry.CreateSubKey($path)
    try { foreach ($entry in $values.GetEnumerator()) { $key.SetValue($entry.Key, $entry.Value) } }
    finally { $key.Dispose() }
}
function Get-Link($path) {
    if (-not [IO.File]::Exists($path)) { return $null }
    $shell = New-Object -ComObject WScript.Shell
    try {
        $link = $shell.CreateShortcut($path)
        try { return [pscustomobject]@{ Target = $link.TargetPath; Args = $link.Arguments; Icon = $link.IconLocation } }
        finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
function Set-MenuLink {
    $null = [IO.Directory]::CreateDirectory($menuDir)
    $scratch = Join-Path $menuDir (([guid]::NewGuid().ToString()) + '.lnk')
    try {
        $shell = New-Object -ComObject WScript.Shell
        try {
            $link = $shell.CreateShortcut($scratch)
            try {
                $link.TargetPath = $exe
                $link.WorkingDirectory = $InstallDir
                $link.IconLocation = $icon + ',0'
                $link.Description = 'Work Log'
                $link.Save()
            } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
        } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
        [WorkLogRegistrationShortcut]::Set($scratch)
        $properties = [WorkLogRegistrationShortcut]::Read($scratch)
        if ($properties[0] -cne $aumid -or $properties[1] -ne [WorkLogRegistrationShortcut]::Activator) {
            throw 'Windows did not persist the Work Log shortcut identity.'
        }
        if ([IO.File]::Exists($menu)) { [IO.File]::Replace($scratch, $menu, [NullString]::Value) }
        else { [IO.File]::Move($scratch, $menu) }
        [WorkLogRegistrationShortcut]::Changed($menu)
    } finally { if ([IO.File]::Exists($scratch)) { [IO.File]::Delete($scratch) } }
}
function Remove-OwnedLink($path) {
    $link = Get-Link $path
    if ($link -and $link.Target -eq $exe) { [IO.File]::Delete($path) }
}
function Clear-Sender {
    # Only the owning install calls this. The user controls notification
    # preferences; we never write Notifications\Settings or system policy.
    try {
        $manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
        $notifier = $manager::CreateToastNotifier($aumid)
        foreach ($item in @($notifier.GetScheduledToastNotifications())) {
            $notifier.RemoveFromSchedule($item)
        }
        $manager::History.Clear($aumid)
    } catch { Write-Warning "Windows notification cleanup: $($_.Exception.Message)" }
    $ledger = Join-Path $env:LOCALAPPDATA 'WorkJournal\windows-reminders.json'
    foreach ($path in @($ledger, ($ledger + '.tmp'))) { if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) } }
}
if ($Mode -eq 'Uninstall') {
    if ((Read-Value $identity 'WorkLogExecutable') -eq $exe) {
        Clear-Sender
        $registry.DeleteSubKeyTree($identity, $false)
    }
    if ((Read-Value $scheme 'WorkLogExecutable') -eq $exe -and (Read-Value $open '') -eq $command) {
        $registry.DeleteSubKeyTree($scheme, $false)
    }
    if ((Read-Value $arp 'UninstallString') -eq ('"{0}"' -f $uninstaller)) {
        $registry.DeleteSubKeyTree($arp, $false)
    }
    Remove-OwnedLink $menu
    Remove-OwnedLink $desktop
    if ([IO.Directory]::Exists($menuDir) -and -not [IO.Directory]::GetFileSystemEntries($menuDir).Length) {
        [IO.Directory]::Delete($menuDir)
    }
    [WorkLogRegistrationShortcut]::AssociationsChanged()
    return
}
foreach ($path in @($exe, $icon, $logo, $uninstaller)) {
    if (-not [IO.File]::Exists($path)) { throw "Work Log installation file missing: $path" }
}
$version = (Get-Content -Raw -LiteralPath (Join-Path $InstallDir 'app\package.json') -Encoding UTF8 | ConvertFrom-Json).version
if (-not $version) { throw 'Missing Work Log version.' }
$start = Get-Link $menu
if ($Mode -eq 'Install') {
    # An unrelated URI handler or same-named shortcut is not ours to replace.
    if ((Has-Key $scheme) -and (Read-Value $scheme 'WorkLogExecutable') -ne $exe) {
        throw 'The worklog: protocol is already registered to another installation.'
    }
    if ((Has-Key $identity) -and (Read-Value $identity 'WorkLogExecutable') -ne $exe) {
        throw 'The Work Log notification identity belongs to another installation.'
    }
    if ((Has-Key $arp) -and (Read-Value $arp 'UninstallString') -ne ('"{0}"' -f $uninstaller)) {
        throw 'Use the existing Work Log installation folder to upgrade it.'
    }
    if ($start -and $start.Target -ne $exe) { throw "The existing shortcut points to a different app: $menu" }
    $properties = @(if ($start) { [WorkLogRegistrationShortcut]::Read($menu) })
    if (-not $start -or $start.Args -or $start.Icon -ne ($icon + ',0') -or
        $properties[0] -cne $aumid -or $properties[1] -ne [WorkLogRegistrationShortcut]::Activator) { Set-MenuLink }
    Write-Values $identity @{ DisplayName = 'Work Log'; IconUri = $logo; IconBackgroundColor = '00000000'; WorkLogExecutable = $exe }
    Write-Values $scheme @{ '' = 'URL:Work Log'; 'URL Protocol' = ''; WorkLogExecutable = $exe }
    Write-Values "$scheme\DefaultIcon" @{ '' = ('"{0}",0' -f $icon) }
    Write-Values $open @{ '' = $command }
    Write-Values $arp @{ DisplayName = 'Work Log'; DisplayVersion = [string]$version; InstallLocation = $InstallDir;
        DisplayIcon = ('"{0}",0' -f $icon); UninstallString = ('"{0}"' -f $uninstaller);
        QuietUninstallString = ('"{0}" /S' -f $uninstaller); NoModify = 1; NoRepair = 1 }
    [WorkLogRegistrationShortcut]::AssociationsChanged()
}
$start = Get-Link $menu
$properties = @(if ($start) { [WorkLogRegistrationShortcut]::Read($menu) })
$checks = [ordered]@{
    shortcut = [bool]($start -and $start.Target -eq $exe -and -not $start.Args -and $start.Icon -eq ($icon + ',0') -and
        $properties[0] -ceq $aumid -and $properties[1] -eq [WorkLogRegistrationShortcut]::Activator)
    sender = ((Read-Value $identity 'WorkLogExecutable') -eq $exe -and (Read-Value $identity 'DisplayName') -ceq 'Work Log' -and
        (Read-Value $identity 'IconUri') -eq $logo)
    protocol = ((Read-Value $open '') -eq $command -and (Read-Value $scheme 'WorkLogExecutable') -eq $exe -and
        '' -ceq (Read-Value $scheme 'URL Protocol'))
    addRemovePrograms = ((Read-Value $arp 'InstallLocation') -eq $InstallDir -and (Read-Value $arp 'DisplayVersion') -eq $version -and
        (Read-Value $arp 'UninstallString') -eq ('"{0}"' -f $uninstaller) -and (Read-Value $arp 'DisplayIcon') -eq ('"{0}",0' -f $icon))
}
[pscustomobject]@{ mode = $Mode; executable = $exe; appId = $aumid; checks = $checks } | ConvertTo-Json -Depth 3
if ($checks.Values -contains $false) { throw 'Work Log Windows registration did not pass all checks.' }
