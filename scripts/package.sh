#!/usr/bin/env bash
# 產生上傳到 Chrome 線上應用程式商店的 zip（只含擴充功能執行所需檔案）
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
mkdir -p dist
OUT="dist/sop-snap-${VERSION}.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json background.js recorder.js popup.html popup.js popup.css \
  editor.html editor.js editor.css lib icons -x '*.DS_Store'
echo "已產生 $OUT"
unzip -l "$OUT" | tail -1
