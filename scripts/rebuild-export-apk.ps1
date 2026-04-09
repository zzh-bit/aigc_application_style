param(
  [string]$WebRoot = "D:\yyh35\android_project\aigc_application\aigc_application_style",
  [string]$AndroidShellRoot = "D:\yyh35\android_project\ps2shell",
  [switch]$InstallToDevice,
  [switch]$SimulateToDevice
)

$ErrorActionPreference = "Stop"

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

function Get-ApplicationId([string]$androidShellRoot) {
  $gradleKts = Join-Path $androidShellRoot "app\build.gradle.kts"
  if (Test-Path $gradleKts) {
    $m = Select-String -Path $gradleKts -Pattern 'applicationId\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($m -and $m.Matches.Count -gt 0) { return $m.Matches[0].Groups[1].Value }
  }
  $gradle = Join-Path $androidShellRoot "app\build.gradle"
  if (Test-Path $gradle) {
    $m = Select-String -Path $gradle -Pattern 'applicationId\s+"([^"]+)"' | Select-Object -First 1
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

Step "Install npm dependencies"
Run-InDir $WebRoot "npm install"

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

Step "Clean and rebuild APK (full rebuild)"
Run-ExeInDir $AndroidShellRoot $gradleBat @("clean", "assembleDebug")

if (-not (Test-Path $apkPath)) {
  throw "APK not found after build: $apkPath"
}

Step "Export APK to stable output folder"
New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
Copy-Item -Path $apkPath -Destination $exportApk -Force

# 默认执行“模拟到设备”链路；也支持显式 -InstallToDevice
if ($SimulateToDevice -or $InstallToDevice) {
  Step "Prepare emulator/device and install APK"
  $sdkDir = Get-SdkDirFromLocalProperties $localProperties
  if (-not $sdkDir) { $sdkDir = $env:ANDROID_SDK_ROOT }
  if (-not $sdkDir) { $sdkDir = $env:ANDROID_HOME }
  $adbPath = Resolve-AdbPath $sdkDir
  if (-not $adbPath) { throw "adb not found. Check sdk.dir in $localProperties or ANDROID_SDK_ROOT." }

  $devicesOut = & $adbPath devices
  $online = @($devicesOut | Select-String "device$" | Where-Object { $_ -notmatch "List of devices attached" })
  if ($online.Count -eq 0) {
    $emulatorPath = Resolve-EmulatorPath $sdkDir
    if (-not $emulatorPath) {
      throw "No online device and emulator.exe not found. Install Android emulator package in SDK Manager."
    }
    $avdList = & $emulatorPath -list-avds
    if (-not $avdList -or $avdList.Count -eq 0) {
      throw "No AVD found. Create one in Android Studio Device Manager first."
    }
    $avd = $avdList[0].ToString().Trim()
    Step "Start emulator: $avd"
    Start-Process -FilePath $emulatorPath -ArgumentList @("-avd", $avd, "-no-snapshot-load")
    & $adbPath start-server | Out-Null
    if (-not (Wait-ForDevice -adbExe $adbPath -timeoutSec 300)) {
      throw "Emulator not ready within timeout."
    }
  }

  # 强制横屏并安装启动
  & $adbPath shell settings put system accelerometer_rotation 0 | Out-Null
  & $adbPath shell settings put system user_rotation 1 | Out-Null
  & $adbPath install -r $apkPath
  if ($LASTEXITCODE -ne 0) { throw "adb install failed." }
  & $adbPath shell monkey -p $applicationId -c android.intent.category.LAUNCHER 1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "App launch failed for package: $applicationId" }
}

Step "Done"
Write-Host "Build output APK: $apkPath" -ForegroundColor Green
Write-Host "Exported APK:     $exportApk" -ForegroundColor Green
if ($SimulateToDevice -or $InstallToDevice) {
  Write-Host "Device simulation: installed and launched ($applicationId)" -ForegroundColor Green
}

