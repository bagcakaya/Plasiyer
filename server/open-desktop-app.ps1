$ErrorActionPreference = "SilentlyContinue"
$serverDir = $PSScriptRoot
$supervisorPath = Join-Path $serverDir "bridge-supervisor.ps1"

$listening = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  if (Test-Path $supervisorPath) {
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisorPath`"" -WindowStyle Hidden
  } else {
    $indexJs = Join-Path $serverDir "src\index.js"
    Start-Process -FilePath "node" -ArgumentList "`"$indexJs`"" -WorkingDirectory $serverDir -WindowStyle Hidden
  }

  for ($i = 0; $i -lt 16; $i++) {
    Start-Sleep -Milliseconds 250
    $listening = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
    if ($listening) { break }
  }
}

$chrome64 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$chrome86 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
$edge86 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$edge64 = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"

$browser = $null
foreach ($candidate in @($chrome64, $chrome86, $edge86, $edge64)) {
  if (Test-Path $candidate) {
    $browser = $candidate
    break
  }
}

if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=http://localhost:4000"
} else {
  Start-Process "http://localhost:4000"
}
