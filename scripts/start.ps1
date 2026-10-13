param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$url = 'http://127.0.0.1:4317'
try { $status = Invoke-RestMethod "$url/api/status" -TimeoutSec 2 } catch { $status = $null }
if ($null -eq $status) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'data') | Out-Null
    $serverScript = Join-Path $projectRoot 'server/index.js'
    $process = Start-Process -FilePath $nodePath -ArgumentList '--env-file-if-exists=.env',('"' + $serverScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'data/server.log') -RedirectStandardError (Join-Path $projectRoot 'data/server.error.log') -PassThru
    $process.Id | Set-Content -LiteralPath (Join-Path $projectRoot 'data/server.pid')
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $status = Invoke-RestMethod "$url/api/status" -TimeoutSec 1; break } catch {}
    }
    if ($null -eq $status) { throw '启动失败，请查看 data/server.error.log。' }
}
if (-not $NoBrowser) { Start-Process $url }
