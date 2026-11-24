#!/usr/bin/env bash
# Chạy binary đã đóng gói với profile WebView2 SẠCH và KHÔNG đặt biến cloud nào:
# đây là tình huống trên máy giáo viên. Cấu hình phải nằm trong binary.
set -u
PORT="${1:-9390}"
PROFILE="$TEMP/eg-tauri-blind-$PORT"
APP=./src-tauri/target/release/edugame-studio-tauri.exe
powershell -NoProfile -Command "Get-Process edugame-studio-tauri -ErrorAction SilentlyContinue | Stop-Process -Force" >/dev/null 2>&1
sleep 2
unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY GEMINI_API_KEY
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$PORT" \
WEBVIEW2_USER_DATA_FOLDER="$PROFILE" \
nohup "$APP" >/dev/null 2>&1 &
for _ in $(seq 1 40); do
  sleep 1
  curl -s -m 1 "http://127.0.0.1:$PORT/json/list" 2>/dev/null | grep -q '"type": "page"' && { echo ready; exit 0; }
done
echo "no page target on $PORT"; exit 1
