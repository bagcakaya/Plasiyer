$ErrorActionPreference = "Stop"

$serverDir = $PSScriptRoot
$projectDir = Split-Path -Parent $serverDir
$supervisorPath = Join-Path $serverDir "bridge-supervisor.ps1"

if (-not (Test-Path $supervisorPath)) {
  Write-Host "HATA: bridge-supervisor.ps1 bulunamadi: $supervisorPath" -ForegroundColor Red
  exit 1
}

$startupDir = [Environment]::GetFolderPath("Startup")
if (-not (Test-Path $startupDir)) {
  New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
}

$vbsPath = Join-Path $startupDir "Polatlar-SQL-Koprusu.vbs"
$escapedSupervisor = $supervisorPath.Replace('"', '""')

$vbsLines = @(
  'Set WshShell = CreateObject("WScript.Shell")',
  ('WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $escapedSupervisor + '""", 0, False')
)
[System.IO.File]::WriteAllLines($vbsPath, $vbsLines, [System.Text.Encoding]::ASCII)

# Arka plan gozetmenini hemen baslat (zaten 4000 portu aciksa cift baslatmaz)
Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $vbsPath + '"') -WindowStyle Hidden

Start-Sleep -Seconds 2
$listening = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host " POLATLAR YAZILIM - TURKIYE SQL KOPRUSU OTOMATIK BASLATMA AKTIF" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host " Proje Klasoru   : $projectDir"
Write-Host " Baslangic Kaydi : $vbsPath"
if ($listening) {
  Write-Host " Servis Durumu   : CALISIYOR (Port 4000 Aktif)" -ForegroundColor Cyan
} else {
  Write-Host " Servis Durumu   : Arka planda baslatiliyor..." -ForegroundColor Yellow
}
Write-Host " Windows her acildiginda siyah pencere cikmadan otomatik baslar."
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
