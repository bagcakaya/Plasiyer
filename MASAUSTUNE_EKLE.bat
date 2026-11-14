@echo off
title ERP12 Mobil Plasiyer - Masaustu Kisayolu Olusturucu
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[System.Environment]::GetFolderPath('Desktop');$p=Join-Path $d 'ERP12 Mobil Plasiyer.lnk';$vbs=Join-Path (Get-Location).Path 'server\open-desktop-app.vbs';$ico=Join-Path (Get-Location).Path 'client\public\erp12-icon.ico';$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut($p);$s.TargetPath='C:\Windows\System32\wscript.exe';$s.Arguments='\"'+$vbs+'\"';$s.WorkingDirectory=(Get-Location).Path;if(Test-Path $ico){$s.IconLocation=$ico+',0'};$s.Save();Write-Host 'Masaustune ERP12 Mobil Plasiyer kisayolu basariyla eklendi!'"
pause
