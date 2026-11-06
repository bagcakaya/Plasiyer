$ErrorActionPreference = "SilentlyContinue"
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

while ($true) {
  $inUse = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
  if (-not $inUse) {
    $proc = Start-Process -FilePath "node.exe" -ArgumentList "server/src/index.js" -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru
    if ($proc) {
      $proc.WaitForExit()
    }
  }
  Start-Sleep -Seconds 5
}
