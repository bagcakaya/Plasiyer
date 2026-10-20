@echo off
title ERP12 Plasiyer Koprusu - Sessiz Baslatici
cd /d "%~dp0"

REM Eger 4000 portunda acik kalan eski bir islem varsa sonlandir
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

REM PowerShell ile Node.js servisini tamamen arka planda ve penceresiz baslat
powershell -NoProfile -Command "Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'server/src/index.js' -WorkingDirectory '%~dp0.' -WindowStyle Hidden"

echo =================================================================
echo   POLATLAR YAZILIM - ERP12 PLASIYER SQL BAGLANTI KOPRUSU
echo =================================================================
echo   [OK] Servis arka planda SESSIZCE calismaya basladi!
echo   [OK] Ekranda acik siyah pencere kalmayacak.
echo   [OK] Baglanti Portu: 4000 - Veritabani: OSMANLIGIDA
echo.
echo   Servisi kapatmak istediginizde SUNUCUYU_DURDUR.bat dosyasina
echo   cift tiklamaniz yeterlidir.
echo =================================================================
ping 127.0.0.1 -n 3 >nul
