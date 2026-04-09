param(
  [string]$WebRoot = "D:\yyh35\android_project\aigc_application\aigc_application_style",
  [string]$AndroidShellRoot = "D:\yyh35\android_project\ps2shell",
  [switch]$SkipNpmInstall,
  [switch]$SkipAdbInstall,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Run-InDir([string]$dir, [string]$cmd) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] ($dir) $cmd" -ForegroundColor Yellow
    return
  }
  Push-Location $dir
  try {
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed (${LASTEXITCODE}): $cmd"
    }
  } finally {
    Pop-Location
  }
}

function Run-ExeInDir([string]$dir, [string]$exe, [string[]]$arguments) {
  if ($DryRun) {
    $joined = if ($null -ne $arguments -and $arguments.Length -gt 0) { $arguments -join " " } else { "" }
    Write-Host "[DRY-RUN] ($dir) `"$exe`" $joined" -ForegroundColor Yellow
    return
  }
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
  # local.properties uses escaped backslashes, e.g. D\:\\yyh35\\sdk
  $normalized = $raw -replace "\\\\", "\" -replace "\\:", ":"
  return $normalized
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

function Wait-ForDevice([string]$adbExe, [int]$timeoutSec = 240) {
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

if (-not (Test-Path $WebRoot)) {
  throw "WebRoot not found: $WebRoot"
}
if (-not (Test-Path $AndroidShellRoot)) {
  throw "AndroidShellRoot not found: $AndroidShellRoot"
}

$outDir = Join-Path $WebRoot "out"
$assetsDir = Join-Path $AndroidShellRoot "app\src\main\assets\web"
$gradleBat = Join-Path $AndroidShellRoot "gradlew.bat"
$apkPath = Join-Path $AndroidShellRoot "app\build\outputs\apk\debug\app-debug.apk"
$localProperties = Join-Path $AndroidShellRoot "local.properties"
$applicationId = Get-ApplicationId $AndroidShellRoot

if (-not (Test-Path $localProperties) -and -not $DryRun) {
  throw "Missing local.properties: $localProperties`nOpen Android Studio once and set SDK path first."
}

if (-not (Test-Path $gradleBat) -and -not $DryRun) {
  throw "Missing gradlew.bat: $gradleBat"
}

$sdkDir = Get-SdkDirFromLocalProperties $localProperties
if (-not $sdkDir) { $sdkDir = $env:ANDROID_SDK_ROOT }
if (-not $sdkDir) { $sdkDir = $env:ANDROID_HOME }
$adbPath = Resolve-AdbPath $sdkDir
$emulatorPath = Resolve-EmulatorPath $sdkDir

Step "Web dependencies"
if ($SkipNpmInstall) {
  Write-Host "Skip npm install by option." -ForegroundColor DarkYellow
} else {
  Run-InDir $WebRoot "npm install"
}

Step "Build static export for Android"
Run-InDir $WebRoot "npm run build:android"

if (-not (Test-Path $outDir) -and -not $DryRun) {
  throw "Missing out directory after build: $outDir"
}

Step "Sync out/* to Android assets/web"
if ($DryRun) {
  Write-Host "[DRY-RUN] Remove-Item `"$assetsDir\*`" -Recurse -Force -ErrorAction SilentlyContinue" -ForegroundColor Yellow
  Write-Host "[DRY-RUN] New-Item -ItemType Directory -Path `"$assetsDir`" -Force | Out-Null" -ForegroundColor Yellow
  Write-Host "[DRY-RUN] Copy-Item -Path `"$outDir\*`" -Destination `"$assetsDir`" -Recurse -Force" -ForegroundColor Yellow
  Write-Host "[DRY-RUN] if exists `"$assetsDir\_next`" => rename to `"$assetsDir\next`"" -ForegroundColor Yellow
} else {
  Remove-Item "$assetsDir\*" -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
  Copy-Item -Path "$outDir\*" -Destination $assetsDir -Recurse -Force
  $underscoreNext = Join-Path $assetsDir "_next"
  $plainNext = Join-Path $assetsDir "next"
  if (Test-Path $underscoreNext) {
    if (Test-Path $plainNext) { Remove-Item $plainNext -Recurse -Force }
    Rename-Item -Path $underscoreNext -NewName "next"
  }
}

Step "Assemble debug APK"
Run-ExeInDir $AndroidShellRoot $gradleBat @("assembleDebug")
if (-not $DryRun -and -not (Test-Path $apkPath)) {
  throw "APK not found: $apkPath"
}

if ($SkipAdbInstall) {
  Step "Skip adb install by option"
} else {
  Step "Ensure emulator/device online"
  if ($DryRun) {
    Write-Host "[DRY-RUN] Resolve sdk.dir from `"$localProperties`"" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] adb path: $adbPath" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] emulator path: $emulatorPath" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] adb devices" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] if no device then emulator.exe -list-avds; start first AVD" -ForegroundColor Yellow
  } else {
    if (-not $adbPath) {
      throw "adb not found. Check sdk.dir in $localProperties or ANDROID_SDK_ROOT."
    }
    $devicesOut = & $adbPath devices
    $online = @($devicesOut | Select-String "device$" | Where-Object { $_ -notmatch "List of devices attached" })
    if ($online.Count -eq 0) {
      if (-not $emulatorPath) {
        throw "No online device and emulator.exe not found. Please install Android emulator package in SDK Manager."
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
  }

  Step "Install APK to connected device/emulator"
  if ($DryRun) {
    Write-Host "[DRY-RUN] adb shell settings put system accelerometer_rotation 0" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] adb shell settings put system user_rotation 1" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] adb install -r `"$apkPath`"" -ForegroundColor Yellow
    Write-Host "[DRY-RUN] adb shell monkey -p $applicationId -c android.intent.category.LAUNCHER 1" -ForegroundColor Yellow
  } else {
    # 统一强制横屏，避免模拟器处于竖屏导致页面侧向显示
    & $adbPath shell settings put system accelerometer_rotation 0 | Out-Null
    & $adbPath shell settings put system user_rotation 1 | Out-Null
    & $adbPath install -r $apkPath
    if ($LASTEXITCODE -ne 0) { throw "adb install failed." }
    & $adbPath shell monkey -p $applicationId -c android.intent.category.LAUNCHER 1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "App launch failed for package: $applicationId" }
  }
}

Step "Done"
Write-Host "Android Studio flow completed." -ForegroundColor Green
Write-Host "APK path: $apkPath"

