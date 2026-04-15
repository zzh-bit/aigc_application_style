# 保存当前已连接设备/模拟器截屏到 apk-exports/（需 adb）
param([string]$OutName = "")
$OutName = if ($null -eq $OutName) { "" } else { "$OutName" }

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exportDir = Join-Path $root "apk-exports"
New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

$sdkLine = Join-Path $root "android\ps2-shell\local.properties"
$adb = $null
if (Test-Path $sdkLine) {
  $l = Get-Content $sdkLine | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1
  if ($l) {
    $raw = $l.Substring("sdk.dir=".Length).Trim() -replace "\\\\", "\" -replace "\\:", ":"
    $cand = Join-Path $raw "platform-tools\adb.exe"
    if (Test-Path $cand) { $adb = $cand }
  }
}
if (-not $adb) {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { $adb = $cmd.Source }
}
if (-not $adb) { throw "adb not found" }

$ts = if ($null -ne $OutName -and $OutName.Trim().Length -gt 0) { $OutName.Trim() } else { Get-Date -Format "yyyyMMdd-HHmmss" }
$png = Join-Path $exportDir "adb-screencap-$ts.png"
$remote = "/sdcard/ps2-screencap-temp.png"
& $adb shell screencap -p $remote
if ($LASTEXITCODE -ne 0) { throw "adb shell screencap failed" }
& $adb pull $remote $png
if ($LASTEXITCODE -ne 0) { throw "adb pull screencap failed" }
& $adb shell rm $remote 2>$null
if (-not (Test-Path $png) -or (Get-Item $png).Length -lt 100) {
  throw "screencap file missing or empty: $png"
}
Write-Host "Saved: $png" -ForegroundColor Green
