$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$deps=Join-Path $projectRoot '.build-tools'
New-Item -ItemType Directory -Force $deps | Out-Null
function Download-Checked($url,$name,$hash){
 $target=Join-Path $deps $name
 if(!(Test-Path -LiteralPath $target)){Invoke-WebRequest $url -OutFile $target -UseBasicParsing}
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $hash){throw "Hash mismatch: $name"}
 return $target
}
$webview=Download-Checked 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg' 'webview2.zip' '56F7F4B8BF9AEE4B8EFEFBBDD4F67D5F74EBD1B100ED0806DA71BF76AF481AA9'
Expand-Archive -LiteralPath $webview -DestinationPath (Join-Path $deps 'webview2') -Force
$nsis=Download-Checked 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z' 'nsis.7z' '9877DF902530F96357D13A7A31AE2B9DF67F48B11FFC9A1700A7C961574EC5FA'
$nsisDir=Join-Path $deps 'nsis-packed';New-Item -ItemType Directory -Force $nsisDir | Out-Null
$sevenZip=(Get-Command 7z -ErrorAction SilentlyContinue).Source
if(!$sevenZip -and (Test-Path "$env:ProgramFiles\7-Zip\7z.exe")){$sevenZip="$env:ProgramFiles\7-Zip\7z.exe"}
if($sevenZip){& $sevenZip x $nsis "-o$nsisDir" -y | Out-Null}
else {tar -xf $nsis -C $nsisDir}
if($LASTEXITCODE -ne 0){throw 'NSIS extraction failed'}
$bootstrap=Join-Path $deps 'MicrosoftEdgeWebview2Setup.exe'
if(!(Test-Path -LiteralPath $bootstrap)){Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap -UseBasicParsing}
$signature=Get-AuthenticodeSignature -LiteralPath $bootstrap
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){throw 'Invalid Microsoft bootstrap signature'}
$nodeVersion=(& node --version).Trim()
Invoke-WebRequest "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $deps 'NODE-LICENSE') -UseBasicParsing
Write-Output 'Desktop build tools ready.'

