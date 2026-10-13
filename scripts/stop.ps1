$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'data/server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $serverPid = [int](Get-Content -LiteralPath $pidFile)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
    $serverScript = Join-Path $projectRoot 'server/index.js'
    if ($process.Name -eq 'node.exe' -and $process.CommandLine.Contains($serverScript)) { Stop-Process -Id $serverPid -ErrorAction SilentlyContinue }
}
