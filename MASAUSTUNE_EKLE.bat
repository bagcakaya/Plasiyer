@echo off
title ERP12 Saha Satis - Masaustu Kisayolu Olusturucu
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[System.Environment]::GetFolderPath('Desktop');$p=Join-Path $d 'ERP12 Saha Satis.lnk';$c='C:\Program Files\Google\Chrome\Application\chrome.exe';$e='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe';$t=if(Test-Path $c){$c}else{$e};$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut($p);$s.TargetPath=$t;$s.Arguments='--app=https://plasiyer.vercel.app';$s.Save();Write-Host 'Masaustune kisayol basariyla eklendi!'"
pause
