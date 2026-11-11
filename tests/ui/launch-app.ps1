# launch-app.ps1 — mở vỏ Tauri đã build với cổng CDP cho các phép kiểm ui.
# Usage: powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9361
# Yêu cầu: `npm run build:tauri` rồi `cargo tauri build` (binary release phải tồn tại).
param([int]$Port = 9361, [int]$WaitSeconds = 20, [string]$WebviewProfile = "")

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $root 'src-tauri\target\release\edugame-studio-tauri.exe'
if (-not (Test-Path $exe)) {
  Write-Output "Không thấy $exe — chạy 'npm run build:tauri' rồi 'cargo tauri build' trước."
  exit 1
}
if (-not $WebviewProfile) { $WebviewProfile = Join-Path $env:TEMP 'eg-ui-check-webview2' }
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$env:WEBVIEW2_USER_DATA_FOLDER = $WebviewProfile
Start-Process -FilePath $exe
# Cổng mở sớm khi WebView2 mới có about:blank — phải chờ ĐÚNG trang ứng dụng,
# giống cổng tauri-webview-check, nếu không phép đo chạy trên DOM rỗng.
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  Start-Sleep -Seconds 1
  try {
    $list = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/list" -UseBasicParsing).Content | ConvertFrom-Json
    $pages = @($list | Where-Object { $_.type -eq 'page' -and $_.url -match 'tauri\.localhost' })
    if ($pages.Count -gt 0) {
      Write-Output ('CDP up on ' + $Port + ' after ' + ($i + 1) + 's (' + $pages[0].url + ')')
      exit 0
    }
  } catch { }
}
Write-Output ('CDP did not come up on ' + $Port)
exit 1
