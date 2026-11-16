# Isolated shell integration test: creates only temporary shortcuts, never pins
# an app or edits the user's Start Menu / Desktop / notification registration.
param([Parameter(Mandatory=$true)][string]$TestDir)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$TestDir=[IO.Path]::GetFullPath($TestDir)
$null=[IO.Directory]::CreateDirectory($TestDir)
Add-Type -Path (Join-Path $root 'desktop\RegistrationShortcut.cs')
$exe=Join-Path $TestDir 'WorkJournal.exe'
$unrelated=Join-Path $TestDir 'Unrelated.exe'
$icon=Join-Path $TestDir 'chosen-blue.ico'
[IO.File]::WriteAllBytes($exe,[byte[]]@())
[IO.File]::WriteAllBytes($unrelated,[byte[]]@())
Copy-Item -LiteralPath (Join-Path $root 'desktop\assets\app.ico') -Destination $icon -Force
$own=Join-Path $TestDir 'owned.lnk'
$other=Join-Path $TestDir 'unrelated.lnk'
$shell=New-Object -ComObject WScript.Shell
try {
    foreach($entry in @(@($own,$exe),@($other,$unrelated))) {
        $link=$shell.CreateShortcut($entry[0])
        try {$link.TargetPath=$entry[1];$link.Arguments='--open-today';$link.IconLocation=$entry[1]+',0';$link.Save()}
        finally {[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link)}
    }
    [WorkLogRegistrationShortcut]::Set($own)
    if(-not [WorkLogRegistrationShortcut]::UpdateOwnedIcon($own,$exe,$icon)){throw 'Owned shortcut was not updated'}
    if([WorkLogRegistrationShortcut]::LinkIcon($own) -ne ($icon+',0')){throw 'Chosen icon was not persisted'}
    $identity=[WorkLogRegistrationShortcut]::Read($own)
    if($identity[0] -ne 'WorkLog.Desktop' -or $identity[1] -ne [WorkLogRegistrationShortcut]::Activator){throw 'Shortcut identity/notification activation changed'}
    if([WorkLogRegistrationShortcut]::UpdateOwnedIcon($own,$exe,$icon)){throw 'Unchanged icon should not rewrite shortcut'}
    $link=$shell.CreateShortcut($own)
    try {if($link.TargetPath -ne $exe -or $link.Arguments -ne '--open-today'){throw 'Theme change damaged shortcut target/arguments'}}
    finally {[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link)}
    $before=(Get-FileHash -LiteralPath $other).Hash
    if([WorkLogRegistrationShortcut]::UpdateOwnedIcon($other,$exe,$icon)){throw 'Unrelated shortcut was touched'}
    if((Get-FileHash -LiteralPath $other).Hash -ne $before){throw 'Unrelated shortcut bytes changed'}
    'PASS owned shortcut icon persisted, AppID/activator/arguments retained, idempotent, unrelated shortcut untouched.'
} finally {[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)}
