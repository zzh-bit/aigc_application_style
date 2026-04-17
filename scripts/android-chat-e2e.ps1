param(
  [string]$OutPrefix = "chat-e2e"
)

$ErrorActionPreference = "Stop"

function Resolve-AdbPath {
  $root = Split-Path -Parent $PSScriptRoot
  $localProperties = Join-Path $root "android\ps2-shell\local.properties"
  if (Test-Path $localProperties) {
    $line = Get-Content $localProperties | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1
    if ($line) {
      $sdk = $line.Substring("sdk.dir=".Length).Trim() -replace "\\\\", "\" -replace "\\:", ":"
      $cand = Join-Path $sdk "platform-tools\adb.exe"
      if (Test-Path $cand) { return $cand }
    }
  }
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "adb not found"
}

function Invoke-Adb($adb, [string[]]$adbArgs) {
  & $adb @adbArgs | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "adb command failed: $($adbArgs -join ' ')"
  }
}

function Invoke-AdbAllowFail($adb, [string[]]$adbArgs) {
  & $adb @adbArgs | Out-Null
  return $LASTEXITCODE
}

function Get-DeviceSize($adb) {
  $line = & $adb shell wm size | Select-String -Pattern "Physical size:"
  if (-not $line) { return @{ w = 2400; h = 1080 } }
  $txt = $line.ToString()
  if ($txt -match "([0-9]+)x([0-9]+)") {
    return @{ w = [int]$Matches[1]; h = [int]$Matches[2] }
  }
  return @{ w = 2400; h = 1080 }
}

function TapRatio($adb, $w, $h, [double]$rx, [double]$ry) {
  $x = [int]([math]::Round($w * $rx))
  $y = [int]([math]::Round($h * $ry))
  Invoke-Adb $adb @("shell", "input", "tap", "$x", "$y")
}

function InputAsciiText($adb, [string]$text) {
  $safe = $text.Replace(" ", "%s")
  Invoke-Adb $adb @("shell", "input", "text", $safe)
}

function SaveScreen($adb, [string]$name) {
  $root = Split-Path -Parent $PSScriptRoot
  $exportDir = Join-Path $root "apk-exports"
  New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
  $remote = "/sdcard/$name.png"
  $local = Join-Path $exportDir "$name.png"
  Invoke-Adb $adb @("shell", "screencap", "-p", $remote)
  Invoke-Adb $adb @("pull", $remote, $local)
  & $adb shell rm $remote | Out-Null
  Write-Host "Saved: $local" -ForegroundColor Green
}

function Dump-UiXml($adb, [string]$name) {
  $root = Split-Path -Parent $PSScriptRoot
  $exportDir = Join-Path $root "apk-exports"
  New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
  $remote = "/sdcard/$name.xml"
  $local = Join-Path $exportDir "$name.xml"
  # uiautomator dump 偶发返回非 0（例如 UI 还没稳定），但往往仍会生成文件；这里不强制失败。
  $null = Invoke-AdbAllowFail $adb @("shell", "uiautomator", "dump", $remote)
  $pullExit = Invoke-AdbAllowFail $adb @("pull", $remote, $local)
  $null = Invoke-AdbAllowFail $adb @("shell", "rm", $remote)
  if ($pullExit -ne 0 -or -not (Test-Path $local)) {
    return $null
  }
  return $local
}

function Dump-UiRaw($adb) {
  $xml = Dump-UiXml $adb "ps2-ui-dump-temp"
  if (-not $xml) { return $null }
  return Get-Content -Raw $xml
}

function TapByText($adb, [string]$containsText) {
  $raw = Dump-UiRaw $adb
  if (-not $raw) { return $false }
  $regex = '<node[^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
  $matches = [regex]::Matches($raw, $regex)
  foreach ($m in $matches) {
    $text = $m.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    if ($text.Contains($containsText)) {
      $x1 = [int]$m.Groups[2].Value
      $y1 = [int]$m.Groups[3].Value
      $x2 = [int]$m.Groups[4].Value
      $y2 = [int]$m.Groups[5].Value
      $x = [int](($x1 + $x2) / 2)
      $y = [int](($y1 + $y2) / 2)
      Invoke-Adb $adb @("shell", "input", "tap", "$x", "$y")
      return $true
    }
  }
  return $false
}

function WaitForAnyText($adb, [string[]]$texts, [int]$timeoutSec = 20) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $timeoutSec) {
    $raw = Dump-UiRaw $adb
    if (-not $raw) { Start-Sleep -Milliseconds 500; continue }
    foreach ($t in $texts) {
      if ($raw.Contains($t)) { return $t }
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

$adb = Resolve-AdbPath
Invoke-Adb $adb @("wait-for-device")
Invoke-AdbAllowFail $adb @("logcat", "-c") | Out-Null
Invoke-Adb $adb @("shell", "pm", "clear", "com.ps2.shell")
Invoke-Adb $adb @("shell", "monkey", "-p", "com.ps2.shell", "-c", "android.intent.category.LAUNCHER", "1")
Start-Sleep -Seconds 2

$size = Get-DeviceSize $adb
$w = $size.w
$h = $size.h
Write-Host "Device size: ${w}x${h}"

SaveScreen $adb "$OutPrefix-welcome"

# NOTE: Avoid non-ASCII literals in this script to prevent encoding issues on some shells.
# Use coordinate taps only (stable for our current UI layout).
TapRatio $adb $w $h 0.18 0.52
Start-Sleep -Milliseconds 1400
SaveScreen $adb "$OutPrefix-mentor-library"

# 2) 在导师库里随便点一个“开始聊天/对话”按钮（不同版本文案可能不同）
TapRatio $adb $w $h 0.50 0.56
Start-Sleep -Milliseconds 1600
SaveScreen $adb "$OutPrefix-mentor-chat"

# 3) 输入并发送一条稳定的 ASCII 文本（避免 input text 对中文兼容问题）
TapRatio $adb $w $h 0.50 0.90
Start-Sleep -Milliseconds 250
InputAsciiText $adb "hello_backend_please_reply_json"
Start-Sleep -Milliseconds 250
Invoke-Adb $adb @("shell", "input", "keyevent", "66")

# 4) 等待回复或错误提示
Start-Sleep -Seconds 10
SaveScreen $adb "$OutPrefix-mentor-chat-after-send"

try {
  $root = Split-Path -Parent $PSScriptRoot
  $exportDir = Join-Path $root "apk-exports"
  $logPath = Join-Path $exportDir ("$OutPrefix-logcat.txt")
  # 只抓高信号 tag，避免文件过大
  & $adb logcat -d -v time PS2WebView:I PS2ApiProxy:I chromium:I *:S | Out-File -FilePath $logPath -Encoding utf8
  Write-Host "Saved: $logPath" -ForegroundColor Green
} catch {
  Write-Host "WARN: logcat dump failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "Chat E2E finished." -ForegroundColor Cyan

