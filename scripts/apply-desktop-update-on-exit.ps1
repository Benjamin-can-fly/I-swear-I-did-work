param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference='Stop'
$job=Get-Content -LiteralPath $Manifest -Raw -Encoding utf8|ConvertFrom-Json
function Status($state,$detail){@{state=$state;detail=$detail;updatedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $job.statusFile -Encoding utf8}
function FileHash($path){$stream=[IO.File]::OpenRead($path);$sha=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}}
try{
 $targetRoot=[IO.Path]::GetFullPath($job.targetRoot).TrimEnd('\')
 $sourceRoot=[IO.Path]::GetFullPath($job.sourceRoot).TrimEnd('\')
 $exe=Join-Path $targetRoot 'WorkJournal.exe'
 foreach($file in $job.files){
  $source=[IO.Path]::GetFullPath((Join-Path $sourceRoot $file.path));$target=[IO.Path]::GetFullPath((Join-Path $targetRoot $file.path))
  if(!$source.StartsWith($sourceRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or !$target.StartsWith($targetRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Update path escaped its root'}
  if((FileHash $source) -ne $file.sha256){throw "Update file changed: $($file.path)"}
 }
 Status 'waiting-for-exit' 'The running Work Log window is left untouched.'
 while($true){
  $running=@(Get-Process WorkJournal -ErrorAction SilentlyContinue|Where-Object {$_.Path -eq $exe})
  if($running.Count){$running|Wait-Process -ErrorAction SilentlyContinue;continue}
  try{Copy-Item -LiteralPath (Join-Path $sourceRoot 'WorkJournal.exe') -Destination $exe -Force;break}catch{Start-Sleep -Seconds 2}
 }
 foreach($file in $job.files){if($file.path -ne 'WorkJournal.exe'){Copy-Item -LiteralPath (Join-Path $sourceRoot $file.path) -Destination (Join-Path $targetRoot $file.path) -Force}}
 foreach($file in $job.files){if((FileHash (Join-Path $targetRoot $file.path)) -ne $file.sha256){throw "Installed hash mismatch: $($file.path)"}}
 Status 'applied' 'Verified update installed. Work Log was not relaunched.'
}catch{Status 'failed' $_.Exception.Message;exit 1}
