# WebRoot：仓库根；AndroidShellRoot：android/ps2-shell；DeviceSerial：adb 序列号
# UsbDebugBackend / InstallToDevice / SimulateToDevice：安装与启动（SimulateToDevice 多设备时优先 emulator-*，便于 Android Studio 模拟器）
# RunNpmInstall：显式传入时才执行 npm install（默认不装，假定依赖已就绪）；SkipGradleClean：跳过 gradlew clean
param(
  [string]$WebRoot = "",
  [string]$AndroidShellRoot = "",
  [string]$DeviceSerial = "",
  [switch]$UsbDebugBackend,
  [switch]$InstallToDevice,
  [switch]$SimulateToDevice,
  [switch]$RunNpmInstall,
  [switch]$SkipGradleClean
)

$ErrorActionPreference = "Stop"

$doInstall = $SimulateToDevice -or $InstallToDevice -or $UsbDebugBackend

if (-not $WebRoot -or $WebRoot.Trim().Length -eq 0) {
  $WebRoot = Split-Path -Parent $PSScriptRoot
}
if (-not $AndroidShellRoot -or $AndroidShellRoot.Trim().Length -eq 0) {
  $AndroidShellRoot = Join-Path $WebRoot "android\ps2-shell"
}

$envLocal = Join-Path $WebRoot ".env.local"
if (Test-Path $envLocal) {
  $localText = Get-Content $envLocal -Raw -ErrorAction SilentlyContinue
  if ($localText -match 'NEXT_PUBLIC_API_BASE_URL\s*=\s*https?://(127\.0\.0\.1|localhost|10\.0\.2\.2)') {
    Write-Host ""
    Write-Host "FATAL: .env.local sets NEXT_PUBLIC_API_BASE_URL to localhost / emulator-only host." -ForegroundColor Red
    Write-Host "       next build prefers .env.local over .env.production; real phones cannot reach that URL." -ForegroundColor Red
    Write-Host "       Remove it or use your public server URL in .env.production only." -ForegroundColor Red
    throw "Invalid NEXT_PUBLIC_API_BASE_URL in .env.local (blocks real device APK)."
  }
}

$envExample = Join-Path $WebRoot ".env.production.example"
$envProd = Join-Path $WebRoot ".env.production"
if (-not (Test-Path $envProd)) {
  if (Test-Path $envExample) {
    Write-Host ""
    Write-Host "WARN: .env.production missing; copied from .env.production.example." -ForegroundColor Yellow
    Write-Host "      Edit .env.production NEXT_PUBLIC_API_BASE_URL (no 10.0.2.2 on real devices)." -ForegroundColor Yellow
    Copy-Item -Path $envExample -Destination $envProd -Force
  } else {
    throw "Missing .env.production and .env.production.example under: $WebRoot"
  }
}

function Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Run-InDir([string]$dir, [string]$cmd) {
  Push-Location $dir
  try {
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "Command failed (${LASTEXITCODE}): $cmd" }
  } finally {
    Pop-Location
  }
}

function Run-ExeInDir([string]$dir, [string]$exe, [string[]]$arguments) {
  Push-Location $dir
  try {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed (${LASTEXITCODE}): `"$exe`" $($arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
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

function Resolve-InstallDeviceSerial([string[]]$onlineSerials, [string]$explicitSerial, [switch]$PreferEmulator) {
  if ($onlineSerials.Count -eq 0) { return $null }
  $e = if ($null -eq $explicitSerial) { "" } else { $explicitSerial.Trim() }
  if ($e.Length -gt 0) {
    if ($onlineSerials -notcontains $e) {
      throw "Device serial not online: $e. Online: $($onlineSerials -join ', ')"
    }
    return $e
  }
  if ($onlineSerials.Count -eq 1) { return $onlineSerials[0] }
  # -SimulateToDevice：与 Android Studio 模拟器联调时，必须优先 emulator-*，避免装到 USB 真机
  if ($PreferEmulator) {
    $emu = @($onlineSerials | Where-Object { $_ -match "^emulator-" })
    if ($emu.Count -ge 1) {
      Write-Host "NOTE: Multiple devices online; installing to Android emulator: $($emu[0])" -ForegroundColor Yellow
      return $emu[0]
    }
    Write-Host "WARN: Emulator preferred but no emulator-* serial; using first online: $($onlineSerials[0])" -ForegroundColor Yellow
    return $onlineSerials[0]
  }
  $physical = @($onlineSerials | Where-Object { $_ -notmatch "^emulator-" })
  if ($physical.Count -ge 1) {
    Write-Host "NOTE: Multiple devices online; installing to physical USB: $($physical[0])" -ForegroundColor Yellow
    return $physical[0]
  }
  Write-Host "NOTE: Multiple devices online; using first serial: $($onlineSerials[0])" -ForegroundColor Yellow
  return $onlineSerials[0]
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

if (-not (Test-Path $WebRoot)) { throw "WebRoot not found: $WebRoot" }
if (-not (Test-Path $AndroidShellRoot)) { throw "AndroidShellRoot not found: $AndroidShellRoot" }

$gradleBat = Join-Path $AndroidShellRoot "gradlew.bat"
$apkPath = Join-Path $AndroidShellRoot "app\build\outputs\apk\debug\app-debug.apk"
$outDir = Join-Path $WebRoot "out"
$assetsDir = Join-Path $AndroidShellRoot "app\src\main\assets\web"
$exportDir = Join-Path $WebRoot "apk-exports"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportApk = Join-Path $exportDir "ps2-app-debug-$timestamp.apk"
$localProperties = Join-Path $AndroidShellRoot "local.properties"
$applicationId = Get-ApplicationId $AndroidShellRoot

if (-not (Test-Path $gradleBat)) {
  throw "Missing gradlew.bat: $gradleBat"
}

$usbEnvLocalPath = Join-Path $WebRoot ".env.production.local"
$createdUsbEnvLocal = $false
if ($UsbDebugBackend) {
  if (Test-Path -LiteralPath $usbEnvLocalPath) {
    throw "USB debug build: backup/remove .env.production.local first, then retry -UsbDebugBackend."
  }
  Set-Content -LiteralPath $usbEnvLocalPath -Value "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000`r`n" -Encoding UTF8
  $createdUsbEnvLocal = $true
}

try {
  if ($RunNpmInstall) {
    Step "Install npm dependencies"
    Run-InDir $WebRoot "npm install"
  }

  Step "Rebuild web static export (Android profile)"
  Run-InDir $WebRoot "npm run build:android"

  Step "Sync static out/ to Android assets (current shell project)"
  if (-not (Test-Path $outDir)) {
    throw "Missing out directory after build: $outDir"
  }
  Remove-Item "$assetsDir\*" -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
  Copy-Item -Path "$outDir\*" -Destination $assetsDir -Recurse -Force
  $nextUnderscore = Join-Path $assetsDir "_next"
  $nextPlain = Join-Path $assetsDir "next"
  if (Test-Path $nextUnderscore) {
    if (Test-Path $nextPlain) { Remove-Item $nextPlain -Recurse -Force }
    Rename-Item -Path $nextUnderscore -NewName "next"
  }

  if ($SkipGradleClean) {
    Step "Build APK (assembleDebug, no clean)"
    Run-ExeInDir $AndroidShellRoot $gradleBat @("assembleDebug")
  } else {
    Step "Clean and rebuild APK (full rebuild)"
    Run-ExeInDir $AndroidShellRoot $gradleBat @("clean", "assembleDebug")
  }

  if (-not (Test-Path $apkPath)) {
    throw "APK not found after build: $apkPath"
  }

  Step "Export APK to stable output folder"
  New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
  Copy-Item -Path $apkPath -Destination $exportApk -Force

  if ($doInstall) {
    Step "Prepare emulator/device and install APK"
    $sdkDir = Get-SdkDirFromLocalProperties $localProperties
    if (-not $sdkDir) { $sdkDir = $env:ANDROID_SDK_ROOT }
    if (-not $sdkDir) { $sdkDir = $env:ANDROID_HOME }
    $adbPath = Resolve-AdbPath $sdkDir
    if (-not $adbPath) { throw "adb not found. Check sdk.dir in $localProperties or ANDROID_SDK_ROOT." }

    $serials = Get-OnlineAdbSerials $adbPath
    if ($serials.Count -eq 0 -and $SimulateToDevice) {
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
    $targetSerial = Resolve-InstallDeviceSerial $serials $DeviceSerial -PreferEmulator:$SimulateToDevice
    if (-not $targetSerial) { throw "No online device available for installation." }

    Write-Host "Installing APK to $targetSerial..."
    Run-ExeInDir $WebRoot $adbPath @("-s", $targetSerial, "install", "-r", $apkPath)

    Write-Host "Launching $applicationId on $targetSerial..."
    Run-ExeInDir $WebRoot $adbPath @("-s", $targetSerial, "shell", "monkey", "-p", $applicationId, "-c", "android.intent.category.LAUNCHER", "1")
  }
} catch {
  if ($createdUsbEnvLocal -and (Test-Path -LiteralPath $usbEnvLocalPath)) {
    Remove-Item -LiteralPath $usbEnvLocalPath -Force -ErrorAction SilentlyContinue
  }
  throw $_
}

if ($createdUsbEnvLocal -and (Test-Path -LiteralPath $usbEnvLocalPath)) {
  Remove-Item -LiteralPath $usbEnvLocalPath -Force -ErrorAction SilentlyContinue
}

Write-Host "==> Done. APK exported to: $exportApk" -ForegroundColor Green

