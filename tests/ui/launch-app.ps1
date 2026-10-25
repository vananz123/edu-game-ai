# launch-app.ps1 — start the built app with a CDP port for the ui checks.
# Usage: powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9361
param([int]$Port = 9361, [int]$WaitSeconds = 14)

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
Start-Process -FilePath 'node_modules\.bin\electron.cmd' -ArgumentList '.', "--remote-debugging-port=$Port"
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  Start-Sleep -Seconds 1
  try {
    $list = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/list" -UseBasicParsing).Content | ConvertFrom-Json
    $pages = @($list | Where-Object { $_.type -eq 'page' })
    if ($pages.Count -gt 0 -and ($pages | Where-Object { $_.url -match 'index\.html' })) {
      Write-Output ('CDP up on ' + $Port + ' after ' + ($i + 1) + 's'); exit 0
    }
  } catch { }
}
Write-Output ('CDP did not come up on ' + $Port)
exit 1
