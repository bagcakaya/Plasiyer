@echo off
chcp 65001 >nul
title POLATLAR YAZILIM - Otomatik Türkiye SQL Köprüsü Kurulumu

set "PROJECT_DIR=%~dp0"
set "VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Polatlar-SQL-Koprusu.vbs"

(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%PROJECT_DIR%server\bridge-supervisor.ps1""", 0, False
) > "%VBS_PATH%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%PROJECT_DIR%server\bridge-supervisor.ps1""' -WindowStyle Hidden"

echo ================================================================
echo  POLATLAR YAZILIM - TÜRKIYE SQL KÖPRÜSÜ OTOMATIK BAŞLATMA AKTİF
echo ================================================================
echo  Windows her açıldığında arka planda sessizce otomatik başlar.
echo  Başlangıç kaydı: %VBS_PATH%
echo ================================================================
pause
