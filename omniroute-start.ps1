# OmniRoute start script - kills stale processes, waits for a free port,
# starts the daemon, then polls until the gateway is actually ready.
param(
  [int]$Port = 20128,
  [int]$TimeoutSec = 300
)

$ErrorActionPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here "omniroute.log"

Write-Host "=== OmniRoute starter ==="

# 1) Kill any stale omniroute processes (parent CLI + child server-ws)
$stale = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'omniroute' }
if ($stale) {
  Write-Host "Cleaning $($stale.Count) stale process(es)..."
  foreach ($p in $stale) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

# 2) Wait until the port is actually free (prevents EADDRINUSE restart cascade)
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 500
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "ERROR: port $Port is still in use by another process:" -ForegroundColor Red
  netstat -ano | Select-String ":$Port"
  exit 1
}

# 3) Start the daemon
Write-Host "Starting omniRoute on port $Port (log: $log)..."
$omniCmd = Join-Path $env:APPDATA "npm\omniroute.cmd"
if (-not (Test-Path $omniCmd)) { $omniCmd = "omniroute" }
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","`"$omniCmd`" serve --port $Port --daemon --no-open" `
  -WorkingDirectory $here -WindowStyle Hidden `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru

# 4) Poll until the gateway answers (boot takes 1.5-2 min: credentials + model sync)
Write-Host "Waiting for the gateway to be ready (up to $TimeoutSec s)... " -NoNewline
$ready = $false
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Port/v1/models" -TimeoutSec 4 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Write-Host "." -NoNewline
  Start-Sleep -Seconds 3
}
Write-Host ""

if ($ready) {
  Write-Host "READY. OmniRoute is up on http://localhost:$Port" -ForegroundColor Green
  try {
    $models = (Invoke-RestMethod -Uri "http://localhost:$Port/v1/models" -TimeoutSec 5).data.Count
    Write-Host "Connected models available: $models"
  } catch {}
  exit 0
}

Write-Host "Timed out - server did not become ready. Last log lines:" -ForegroundColor Red
Get-Content $log -Tail 25 -ErrorAction SilentlyContinue
exit 1
