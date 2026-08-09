# OmniRoute stop script - cleanly kills all omniroute node processes so the
# port frees up (prevents the "takes dozens of tries to start" problem).
param(
  [int]$Port = 20128
)

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "=== OmniRoute stop ==="

$stale = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'omniroute' }
if ($stale) {
  foreach ($p in $stale) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host "Killed $($stale.Count) process(es)."
} else {
  Write-Host "No omniroute processes found."
}

Start-Sleep -Seconds 2
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "WARNING: port $Port is still busy:" -ForegroundColor Red
  netstat -ano | Select-String ":$Port"
} else {
  Write-Host "Port $Port is free." -ForegroundColor Green
}
