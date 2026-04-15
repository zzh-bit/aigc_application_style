param(
  [string]$WebRoot = "",
  [string]$AndroidShellRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $WebRoot -or $WebRoot.Trim().Length -eq 0) {
  $WebRoot = Split-Path -Parent $PSScriptRoot
}
if (-not $AndroidShellRoot -or $AndroidShellRoot.Trim().Length -eq 0) {
  $AndroidShellRoot = Join-Path $WebRoot "android\ps2-shell"
}

function Get-SdkDirFromLocalProperties([string]$localPropertiesPath) {
  if (-not (Test-Path $localPropertiesPath)) { return $null }
  $line = (Get-Content $localPropertiesPath | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1)
  if (-not $line) { return $null }
  $raw = $line.Substring("sdk.dir=".Length).Trim()
  return ($raw -replace "\\\\", "\" -replace "\\:", ":")
}

function Resolve-AdbPath([string]$sdkDir) {
  if ($sdkDir) {
    $candidate = Join-Path $sdkDir "platform-tools\adb.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Resolve-EmulatorPath([string]$sdkDir) {
  if (-not $sdkDir) { return $null }
  $candidate = Join-Path $sdkDir "emulator\emulator.exe"
  if (Test-Path $candidate) { return $candidate }
  return $null
}

function Get-OnlineAdbSerials([string]$adbExe) {
  $lines = & $adbExe devices
  $serials = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    if ($line -match "^(\S+)\s+device\s*$") {
      $serials.Add($Matches[1]) | Out-Null
    }
  }
  return $serials.ToArray()
}

function Wait-ForDevice([string]$adbExe, [int]$timeoutSec = 300) {
  $start = Get-Date
  while ($true) {
    $list = & $adbExe devices
    $online = @($list | Select-String "device$" | Where-Object { $_ -notmatch "List of devices attached" })
    if ($online.Count -gt 0) { return $true }
    if (((Get-Date) - $start).TotalSeconds -ge $timeoutSec) { return $false }
    Start-Sleep -Seconds 2
  }
}

function Get-ApplicationId([string]$androidShellRoot) {
  $gradleKts = Join-Path $androidShellRoot "app\build.gradle.kts"
  if (Test-Path $gradleKts) {
    $m = Select-String -Path $gradleKts -Pattern 'applicationId\s*=\s*"(\S+)"' | Select-Object -First 1
    if ($m -and $m.Matches.Count -gt 0) { return $m.Matches[0].Groups[1].Value }
  }
  $gradle = Join-Path $androidShellRoot "app\build.gradle"
  if (Test-Path $gradle) {
    $m = Select-String -Path $gradle -Pattern 'applicationId\s+"(\S+)"' | Select-Object -First 1
    if ($m -and $m.Matches.Count -gt 0) { return $m.Matches[0].Groups[1].Value }
  }
  return "com.example.ps2shell"
}

$localProperties = Join-Path $AndroidShellRoot "local.properties"
$sdkDir = Get-SdkDirFromLocalProperties $localProperties
if (-not $sdkDir) { $sdkDir = $env:ANDROID_SDK_ROOT }
if (-not $sdkDir) { $sdkDir = $env:ANDROID_HOME }

$adbPath = Resolve-AdbPath $sdkDir
if (-not $adbPath) { throw "adb not found. Check sdk.dir in $localProperties or ANDROID_SDK_ROOT." }

Write-Host "==> Starting Android Simulator Process" -ForegroundColor Cyan

$serials = Get-OnlineAdbSerials $adbPath
if ($serials.Count -eq 0) {
  $emulatorPath = Resolve-EmulatorPath $sdkDir
  if (-not $emulatorPath) {
    throw "No online device and emulator.exe not found. Install Android emulator package in SDK Manager."
  }
  $avdList = & $emulatorPath -list-avds
  if (-not $avdList -or $avdList.Count -eq 0) {
    throw "No AVDs found. Create an Android Virtual Device in Android Studio first."
  }
  $avd = $avdList[0]
  Write-Host "Starting emulator: $avd"
  Start-Process -NoNewWindow -FilePath $emulatorPath -ArgumentList "@$avd"
  Write-Host "Waiting for device to come online (max 5 mins)..."
  if (-not (Wait-ForDevice $adbPath)) { throw "Device failed to come online." }
}

$serials = Get-OnlineAdbSerials $adbPath
$emu = @($serials | Where-Object { $_ -match "^emulator-" })
$targetSerial = if ($emu.Count -ge 1) { $emu[0] } else { $serials[0] }

$apkDir = Join-Path $AndroidShellRoot "app\build\outputs\apk\debug"
$apkPath = Join-Path $apkDir "app-debug.apk"
if (-not (Test-Path $apkPath)) {
  Write-Host "WARN: APK not found at $apkPath. Make sure to run 'npm run rebuild:export:apk' first." -ForegroundColor Yellow
  return
}

Write-Host "Installing APK to device $targetSerial..."
& $adbPath -s $targetSerial install -r $apkPath

$applicationId = Get-ApplicationId $AndroidShellRoot
Write-Host "Launching app: $applicationId"
& $adbPath -s $targetSerial shell monkey -p $applicationId -c android.intent.category.LAUNCHER 1

Write-Host "==> Simulation started successfully on $targetSerial" -ForegroundColor Green
