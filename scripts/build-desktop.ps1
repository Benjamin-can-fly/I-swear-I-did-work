param([switch]$StageOnly)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$deps=Join-Path $root '.build-tools'
$stage=Join-Path $root 'dist/stage'
if(Test-Path -LiteralPath $stage){
 $resolved=[IO.Path]::GetFullPath($stage)
 $expected=[IO.Path]::GetFullPath((Join-Path $root 'dist\stage'))
 if($resolved -ne $expected -or !(Get-Item -LiteralPath $stage).PSIsContainer){throw 'Unexpected staging path'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage,(Join-Path $stage 'runtime'),(Join-Path $stage 'app') | Out-Null
$webview=Join-Path $deps 'webview2'
foreach($file in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){Copy-Item -LiteralPath (Join-Path $webview "lib/net462/$file") -Destination $stage -Force}
Copy-Item -LiteralPath (Join-Path $webview 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $stage -Force
Copy-Item -LiteralPath (Join-Path $root 'desktop/assets/app.ico') -Destination (Join-Path $stage 'WorkJournal.ico') -Force
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ "/out:$stage\WorkJournal.exe" "/win32manifest:$root\desktop\app.manifest" "/win32icon:$root\desktop\assets\app.ico" "/resource:$root\desktop\assets\app.ico,app.ico" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/reference:$stage\Microsoft.Web.WebView2.Core.dll" "/reference:$stage\Microsoft.Web.WebView2.WinForms.dll" "$root\desktop\Program.cs"
if($LASTEXITCODE -ne 0){throw 'Desktop compilation failed'}
$node=(Get-Command node.exe).Source
Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'runtime/node.exe') -Force
Copy-Item -LiteralPath (Join-Path $deps 'NODE-LICENSE') -Destination (Join-Path $stage 'runtime/LICENSE') -Force
foreach($name in @('index.html','report.html','package.json')){Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $stage 'app') -Force}
foreach($name in @('src','server')){Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $stage 'app') -Recurse -Force}
Copy-Item -LiteralPath (Join-Path $deps 'MicrosoftEdgeWebview2Setup.exe') -Destination $stage -Force
Copy-Item -LiteralPath (Join-Path $root 'output/pdf/工作日志使用说明.pdf') -Destination (Join-Path $stage '使用说明.pdf') -Force
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $stage -Force
@'
Work Log
双击 WorkJournal.exe。无需安装 Node.js，也无需打开 GitHub。
数据保存在 %LOCALAPPDATA%\WorkJournal\data，升级和卸载不会自动删除数据。
旧版用户：先导出包含附件的 JSON 备份，再在桌面版导入。
缺少 WebView2 时，请联网运行 MicrosoftEdgeWebview2Setup.exe。
当前安装包尚未代码签名。
'@ | Set-Content -LiteralPath (Join-Path $stage '首次使用.txt') -Encoding utf8
$notices="Node.js: see runtime/LICENSE`r`nMicrosoft WebView2 SDK:`r`n"+(Get-Content -LiteralPath (Join-Path $webview 'LICENSE.txt') -Raw)+"`r`n"+(Get-Content -LiteralPath (Join-Path $webview 'NOTICE.txt') -Raw)
Set-Content -LiteralPath (Join-Path $stage 'THIRD-PARTY-NOTICES.txt') -Value $notices -Encoding utf8
if($StageOnly){Write-Output "Desktop staged: $stage";exit}
$uninstall=Join-Path $deps 'uninstall-files.nsh'
$lines=@()
Get-ChildItem -LiteralPath (Join-Path $stage 'app') -Recurse -File | ForEach-Object {$rel=$_.FullName.Substring($stage.Length+1);$lines+='Delete "$INSTDIR\'+$rel+'"'}
Get-ChildItem -LiteralPath (Join-Path $stage 'app') -Recurse -Directory | Sort-Object {$_.FullName.Length} -Descending | ForEach-Object {$rel=$_.FullName.Substring($stage.Length+1);$lines+='RMDir "$INSTDIR\'+$rel+'"'}
$lines+='RMDir "$INSTDIR\app"';Set-Content -LiteralPath $uninstall -Value $lines -Encoding utf8
$output=Join-Path $root "dist/WorkLog-$version-windows-x64-setup.exe"
& (Join-Path $deps 'nsis-packed/makensis.exe') /V2 "/DVERSION=$version" "/DSTAGE=$stage" "/DOUTPUT=$output" "/DUNINSTALL_FILES=$uninstall" "$root/desktop/installer.nsi"
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
$hash=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
Set-Content -LiteralPath ($output+'.sha256') -Value ($hash+'  '+[IO.Path]::GetFileName($output)) -Encoding ascii
Get-Item -LiteralPath $output | Select-Object FullName,Length








