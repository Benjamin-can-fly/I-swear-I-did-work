param([string]$Owner='Benjamin-can-fly',[string]$Repository='I-swear-I-did-work')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if(!(Get-Command git -ErrorAction SilentlyContinue)){throw 'Install Git for Windows or GitHub Desktop first: https://git-scm.com/download/win'}
$toolDir=Join-Path $env:LOCALAPPDATA 'WorkJournalPublishTools'
$gh=Join-Path $toolDir 'bin/gh.exe'
if(!(Test-Path -LiteralPath $gh)){
 New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
 $release=Invoke-RestMethod 'https://api.github.com/repos/cli/cli/releases/latest'
 $asset=$release.assets | Where-Object name -Match '^gh_.*_windows_amd64.zip$' | Select-Object -First 1
 $zip=Join-Path $toolDir 'gh.zip'
 Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing
 if($asset.digest -and $asset.digest.StartsWith('sha256:')){if((Get-FileHash $zip).Hash.ToLowerInvariant() -ne $asset.digest.Substring(7)){throw 'GitHub CLI checksum mismatch'}}
 Expand-Archive -LiteralPath $zip -DestinationPath $toolDir -Force
}
& $gh auth status
if($LASTEXITCODE -ne 0){& $gh auth login --hostname github.com --git-protocol https --web --scopes workflow;if($LASTEXITCODE -ne 0){throw 'GitHub login did not finish. No repository was published.'}}
$login=(& $gh api user --jq .login).Trim()
if($LASTEXITCODE -ne 0 -or $login -ne $Owner){throw "Please log in as $Owner. Current account: $login"}
if(!(Test-Path -LiteralPath '.git')){git init -b main;if($LASTEXITCODE -ne 0){throw 'Git init failed'}}
git config user.name $Owner
git config user.email "$Owner@users.noreply.github.com"
git add --all
if($LASTEXITCODE -ne 0){throw 'Git staging failed'}
$tracked=@(git ls-files)
if($tracked | Where-Object {$_ -match '^(data/|node_modules/|dist/|artifacts/|\.build-tools/|release-prep/)' -or $_ -eq '.env'}){throw 'Private or generated files detected. Upload stopped.'}
git diff --cached --quiet
if($LASTEXITCODE -eq 1){git commit -m 'Prepare open-source desktop preview';if($LASTEXITCODE -ne 0){throw 'Git commit failed'}}
$remote=git config --get remote.origin.url
if(!$remote){
 & $gh repo create "$Owner/$Repository" --public --description ((Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json).description) --source . --remote origin --push
 if($LASTEXITCODE -ne 0){throw 'Repository creation or upload failed. Existing repositories were not overwritten.'}
}else{
 if($remote -notin @("https://github.com/$Owner/$Repository.git","https://github.com/$Owner/$Repository","git@github.com:$Owner/$Repository.git")){throw 'Unexpected origin. Upload stopped.'}
 git push -u origin main
 if($LASTEXITCODE -ne 0){throw 'Push failed. No force push was attempted.'}
}
Write-Output "Uploaded: https://github.com/$Owner/$Repository"
Write-Output 'Next: Actions > Build desktop previews > Run workflow. Check all builds before creating a Release.'

