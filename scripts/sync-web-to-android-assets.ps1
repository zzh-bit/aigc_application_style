# Sync Next.js static export (out/) into Android WebView assets, and rename _next -> next
# (underscore prefixes can break some Android asset pipelines; MainActivity maps URL _next -> next).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "out"
$dest = Join-Path $root "android\ps2-shell\app\src\main\assets\web"
if (-not (Test-Path $out)) {
  throw "Missing out/. Run: npm run build:android"
}
if (-not (Test-Path (Join-Path $out "index.html"))) {
  throw "out/index.html not found. Run: npm run build:android"
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Get-ChildItem -Path $dest -Force | Remove-Item -Recurse -Force
Copy-Item -Recurse -Force (Join-Path $out "*") $dest
$nextUnderscore = Join-Path $dest "_next"
$nextPlain = Join-Path $dest "next"
if (Test-Path $nextUnderscore) {
  if (Test-Path $nextPlain) { Remove-Item -Recurse -Force $nextPlain }
  Rename-Item $nextUnderscore "next"
}
Write-Host "sync-web-to-android-assets: OK -> $dest"
