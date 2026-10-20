@echo off
title ERP12 Plasiyer Koprusu - Durdurucu
echo =================================================================
echo   ERP12 Plasiyer Kopru Servisi Durduruluyor...
echo =================================================================

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo   [OK] Servis basariyla durduruldu (Port 4000 serbest birakildi).
echo =================================================================
timeout /t 2 >nul
