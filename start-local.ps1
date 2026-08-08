# Starts the local Montaji server (port 8787) and the Vite dev server (port 8080)
Write-Host "=============================================="
Write-Host "  Montaji AI - Local Development"
Write-Host "=============================================="

# 1) Local server
Push-Location "$PSScriptRoot\server"
if (-not (Test-Path node_modules)) { npm install }
Write-Host "[1/2] Starting local server on http://localhost:8787 ..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","start","/b","node","server.js" -WindowStyle Hidden
Pop-Location

# 2) Vite dev server
Push-Location $PSScriptRoot
if (-not (Test-Path node_modules)) { npm install }
Write-Host "[2/2] Starting Vite dev server on http://localhost:8080 ..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","start","/b","npm","run","dev","--","--host" -WindowStyle Hidden
Pop-Location

Write-Host ""
Write-Host "Editor:      http://localhost:8080"
Write-Host "API server:  http://localhost:8787/api/health"
Write-Host "Press Enter to stop this window (servers keep running in background)..."
Read-Host
