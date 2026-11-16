param([string]$Destination=(Join-Path $env:LOCALAPPDATA 'WorkJournal/capture-model'))
$ErrorActionPreference='Stop'
# A packaged Node app can inherit PowerShell 7's module path. Restore native Windows modules.
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+[IO.Path]::PathSeparator+$env:PSModulePath
[Console]::OutputEncoding=[Text.Encoding]::UTF8
[Console]::InputEncoding=[Text.Encoding]::UTF8
# On-demand Windows x64 language component. No service, cloud account or autostart.
$dir=[IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
function Fetch-Verified($name,$uri,$sha){
 $file=Join-Path $dir $name
 if((Test-Path -LiteralPath $file) -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -eq $sha){return $file}
 $temp=$file+'.part'
 $network=@('--fail','--location','--retry','5','--retry-all-errors','--continue-at','-','--max-time','900','--output',$temp)
 $proxy=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
 if($proxy.ProxyEnable -eq 1 -and $proxy.ProxyServer -match '^([a-zA-Z0-9.-]+:\d+)$'){$network+=@('--proxy',('http://'+$proxy.ProxyServer))}
 curl.exe @network $uri
 if($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash -ne $sha){throw "Failed to verify $name"}
 Move-Item -LiteralPath $temp -Destination $file -Force
 return $file
}
$model=Fetch-Verified 'qwen25-1.5b.gguf' 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf' '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'
$zip=Fetch-Verified 'runtime.zip' 'https://github.com/ggml-org/llama.cpp/releases/download/b6500/llama-b6500-bin-win-cpu-x64.zip' '73e00267e852e666a6fce2c3fb7a2603dd1934a37259f3f45c2c1b6983fa605a'
$license=Fetch-Verified 'MODEL-LICENSE.txt' 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/LICENSE' '832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e'
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $dir 'runtime') -Force
$root=Split-Path $PSScriptRoot -Parent
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /optimize+ ('/out:'+(Join-Path $dir 'runtime/WorkLogModelHost.exe')) (Join-Path $root 'server/ModelHost.cs')
if($LASTEXITCODE -ne 0){throw 'Could not build the model lifetime guard'}
@{model='Qwen2.5-1.5B-Instruct-Q4_K_M';source='https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF';revision='91cad51170dc346986eccefdc2dd33a9da36ead9';sha256='6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e';runtime='llama.cpp b6500';idleSeconds=120}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $dir 'component.json') -Encoding utf8
Write-Output "Ready: $model"
