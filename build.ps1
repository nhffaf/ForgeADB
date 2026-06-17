# ForgeADB - one-click clean production build (PowerShell)
# Installs dependencies and produces the NSIS installer + portable EXE in release\

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' ForgeADB - clean production build' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

Write-Host "`n[1/2] Installing dependencies..." -ForegroundColor Green
npm install
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host "`n[2/2] Building application (icons + renderer + installer)..." -ForegroundColor Green
npm run dist
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host ' Build complete. Output is in the release\ folder.' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
