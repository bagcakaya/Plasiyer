@echo off
title ERP12 - Plasiyer SQL Server Kopru Servisi
cd /d "%~dp0server"
echo =================================================================
echo   POLATLAR YAZILIM - ERP12 PLASIYER SQL BAGLANTI KOPRUSU
echo =================================================================
echo   Yerel IP Adresi    : 192.168.1.116 (Port: 4000)
echo   Veritabani         : OSMANLIGIDA
echo   Servis Durumu      : Baslatiliyor...
echo =================================================================
echo.

REM Eger 4000 portunda eski bir islem kaldiysa otomatik sonlandir:
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

node src/index.js
pause
