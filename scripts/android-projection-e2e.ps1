param(
  [string]$OutPrefix = "projection-e2e"
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
  Invoke-Adb $adb @("shell", "uiautomator", "dump", $remote)
  Invoke-Adb $adb @("pull", $remote, $local)
  & $adb shell rm $remote | Out-Null
  return $local
}

function TapByText($adb, [string]$containsText) {
  $xml = Dump-UiXml $adb "ps2-ui-dump-temp"
  $raw = Get-Content -Raw $xml
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

function Dump-UiRaw($adb) {
  $xml = Dump-UiXml $adb "ps2-ui-dump-temp"
  return Get-Content -Raw $xml
}

function WaitAndTapText($adb, [string]$text, [int]$timeoutSec = 20) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $timeoutSec) {
    $raw = Dump-UiRaw $adb
    if ($raw.Contains("设置中心")) {
      $null = TapByText $adb "关闭"
      Start-Sleep -Milliseconds 500
      continue
    }
    if ($raw.Contains($text)) {
      return (TapByText $adb $text)
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

$adb = Resolve-AdbPath
Invoke-Adb $adb @("wait-for-device")
Invoke-Adb $adb @("shell", "pm", "clear", "com.ps2.shell")
Invoke-Adb $adb @("shell", "monkey", "-p", "com.ps2.shell", "-c", "android.intent.category.LAUNCHER", "1")
Start-Sleep -Seconds 2

$size = Get-DeviceSize $adb
$w = $size.w
$h = $size.h
Write-Host "Device size: ${w}x${h}"

# 1) Welcome -> Enter council
SaveScreen $adb "$OutPrefix-welcome"
if (-not (WaitAndTapText $adb "平行自我" 25)) {
  TapRatio $adb $w $h 0.50 0.54
}
Start-Sleep -Milliseconds 1400

# 2) Focus input and send a deterministic topic
if (-not (WaitAndTapText $adb "说出你的想法" 20)) {
  TapRatio $adb $w $h 0.53 0.93
}
Start-Sleep -Milliseconds 400
InputAsciiText $adb "stomach_pain_should_i_keep_working_or_rest"
Start-Sleep -Milliseconds 300
Invoke-Adb $adb @("shell", "input", "keyevent", "66")

# wait debate replies
Start-Sleep -Seconds 6
SaveScreen $adb "$OutPrefix-council"

# 3) Open projection
if (-not (WaitAndTapText $adb "推演" 15)) {
  TapRatio $adb $w $h 0.50 0.82
}
Start-Sleep -Milliseconds 1200
SaveScreen $adb "$OutPrefix-projection-open"

# 4) Tap "生成推演" (top-right area)
if (-not (WaitAndTapText $adb "生成推演" 15)) {
  TapRatio $adb $w $h 0.86 0.09
}
Start-Sleep -Seconds 8
SaveScreen $adb "$OutPrefix-projection-generated"

# 5) Dump and assert no placeholder topic in projection UI
$projectionXml = Dump-UiXml $adb "$OutPrefix-projection-generated"
$projectionRaw = Get-Content -Raw $projectionXml
$placeholderA = -join @([char]0x8BF7,[char]0x636E,[char]0x5168,[char]0x6587,[char]0x5F52,[char]0x7EB3,[char]0x6838,[char]0x5FC3,[char]0x51B3,[char]0x7B56)
$placeholderB = -join @([char]0x8BAE,[char]0x4F1A,[char]0x5B8C,[char]0x6574,[char]0x5BF9,[char]0x8BDD)
$hasPlaceholder = $projectionRaw.Contains($placeholderA) -or $projectionRaw.Contains($placeholderB)
$looksLikeLocalTemplate = $projectionRaw.Contains("grounded-")
Write-Host "CHECK_PLACEHOLDER=$hasPlaceholder"
Write-Host "CHECK_LOCAL_TEMPLATE_WORDS=$looksLikeLocalTemplate"
if ($hasPlaceholder -or $looksLikeLocalTemplate) {
  throw "Projection UI check failed: placeholder/local-template words detected."
}

Write-Host "Projection E2E flow finished." -ForegroundColor Cyan
