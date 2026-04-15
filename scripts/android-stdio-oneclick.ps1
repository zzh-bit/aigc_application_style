param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Run-Checked([string]$cmd, [string]$workdir) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] ($workdir) $cmd" -ForegroundColor Yellow
    return
  }
  Push-Location $workdir
  try {
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $cmd"
    }
  } finally {
    Pop-Location
  }
}

function Run-ExeChecked([string]$exe, [string[]]$arguments, [string]$workdir) {
  if ($DryRun) {
    $joined = if ($null -ne $arguments -and $arguments.Length -gt 0) { $arguments -join " " } else { "" }
    Write-Host "[DRY-RUN] ($workdir) `"$exe`" $joined" -ForegroundColor Yellow
    return
  }
  Push-Location $workdir
  try {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: `"$exe`" $($arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Resolve-SdkRoot {
  # 1) local.properties beside workspace shell
  $workspaceLocal = Join-Path $root "android\ps2-shell\local.properties"
  if (Test-Path $workspaceLocal) {
    $line = (Get-Content $workspaceLocal | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1)
    if ($line) {
      $raw = $line.Substring("sdk.dir=".Length).Trim()
      $normalized = $raw -replace "\\\\", "\" -replace "\\:", ":"
      if (Test-Path $normalized) { return $normalized }
    }
  }
  # 2) local.properties beside legacy shell path used by rebuild script
  $legacyLocal = "D:\yyh35\android_project\ps2shell\local.properties"
  if (Test-Path $legacyLocal) {
    $line = (Get-Content $legacyLocal | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1)
    if ($line) {
      $raw = $line.Substring("sdk.dir=".Length).Trim()
      $normalized = $raw -replace "\\\\", "\" -replace "\\:", ":"
      if (Test-Path $normalized) { return $normalized }
    }
  }
  # 3) common explicit SDK location in this project docs
  $docHint = "D:\yyh35\sdk"
  if (Test-Path $docHint) { return $docHint }
  if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) { return $env:ANDROID_SDK_ROOT }
  if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { return $env:ANDROID_HOME }
  $fallback = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $fallback) { return $fallback }
  return $null
}

function Resolve-EmulatorExe([string]$sdkRoot) {
  $p = Join-Path $sdkRoot "emulator\emulator.exe"
  if (Test-Path $p) { return $p }
  return $null
}

function Resolve-AdbExe([string]$sdkRoot) {
  $p = Join-Path $sdkRoot "platform-tools\adb.exe"
  if (Test-Path $p) { return $p }
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Resolve-GradlewBat([string]$androidShellDir) {
  $p = Join-Path $androidShellDir "gradlew.bat"
  if (Test-Path $p) { return $p }
  return $null
}

function Wait-ForDevice([string]$adbExe, [int]$timeoutSec = 180) {
  $start = Get-Date
  while ($true) {
    $out = & $adbExe devices
    $online = @($out | Select-String "device$" | Where-Object { $_ -notmatch "List of devices attached" })
    if ($online.Count -gt 0) { return $true }
    if (((Get-Date) - $start).TotalSeconds -gt $timeoutSec) { return $false }
    Start-Sleep -Seconds 2
  }
}

$root = Split-Path -Parent $PSScriptRoot
$androidShellDir = Join-Path $root "android\ps2-shell"
$localProperties = Join-Path $androidShellDir "local.properties"

if (-not (Test-Path $androidShellDir)) {
  throw "Android shell not found: $androidShellDir"
}

$sdkRoot = Resolve-SdkRoot
if (-not $sdkRoot) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] Android SDK not found; skip runtime tool checks." -ForegroundColor Yellow
    $sdkRoot = "<SDK_ROOT>"
  } else {
    throw "Android SDK not found. Set ANDROID_SDK_ROOT or install Android SDK first."
  }
}

$adbExe = Resolve-AdbExe $sdkRoot
if (-not $adbExe) {
  if ($DryRun) {
    $adbExe = "adb"
    Write-Host "[DRY-RUN] adb not found; using placeholder command." -ForegroundColor Yellow
  } else {
    throw "adb not found. Install platform-tools in Android SDK."
  }
}

$emulatorExe = Resolve-EmulatorExe $sdkRoot
$gradlewBat = Resolve-GradlewBat $androidShellDir
if (-not $gradlewBat) {
  if ($DryRun) {
    $gradlewBat = Join-Path $androidShellDir "gradlew.bat"
    Write-Host "[DRY-RUN] gradlew.bat missing; using placeholder path." -ForegroundColor Yellow
  } else {
    throw "gradlew.bat not found in $androidShellDir. Open project once in Android Studio to generate wrapper."
  }
}

if (-not (Test-Path $localProperties)) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] create local.properties with sdk.dir=$sdkRoot" -ForegroundColor Yellow
  } else {
    $gradlePath = $sdkRoot -replace "\\", "/"
    Set-Content -Path $localProperties -Value "sdk.dir=$gradlePath" -Encoding ASCII
  }
}

Step "Build web export for Android"
Run-Checked "npm run build:android" $root

Step "Sync out/ to Android assets"
Run-Checked "npm run sync:android" $root

Step "Ensure emulator/device is online"
$needsBoot = $false
if (-not $DryRun) {
  $deviceList = & $adbExe devices
  $online = @($deviceList | Select-String "device$" | Where-Object { $_ -notmatch "List of devices attached" })
  if ($online.Count -eq 0) { $needsBoot = $true }
}

if ($DryRun -or $needsBoot) {
  if (-not $emulatorExe) {
    if ($DryRun) {
      $emulatorExe = "emulator.exe"
      Write-Host "[DRY-RUN] emulator.exe missing; using placeholder command." -ForegroundColor Yellow
    } else {
      throw "No running device and emulator.exe missing. Start an emulator manually in Android Studio."
    }
  }
  $avd = ""
  if ($DryRun) {
    $avd = "DRY_RUN_AVD"
  } else {
    $avdList = & $emulatorExe -list-avds
    if (-not $avdList -or $avdList.Count -eq 0) {
      throw "No AVD found. Create one in Android Studio Device Manager first."
    }
    $avd = $avdList[0].ToString().Trim()
  }
  Step "Start emulator: $avd"
  if ($DryRun) {
    Write-Host "[DRY-RUN] `"$emulatorExe`" -avd `"$avd`" -no-snapshot-load" -ForegroundColor Yellow
  } else {
    Start-Process -FilePath $emulatorExe -ArgumentList @("-avd", $avd, "-no-snapshot-load")
    & $adbExe start-server | Out-Null
    if (-not (Wait-ForDevice -adbExe $adbExe -timeoutSec 240)) {
      throw "Emulator did not become online within timeout."
    }
  }
}

Step "Assemble debug APK"
Run-ExeChecked $gradlewBat @("assembleDebug") $androidShellDir

$apkPath = Join-Path $androidShellDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkPath) -and -not $DryRun) {
  throw "APK not found: $apkPath"
}

Step "Install APK to emulator/device"
if ($DryRun) {
  Write-Host "[DRY-RUN] `"$adbExe`" install -r `"$apkPath`"" -ForegroundColor Yellow
  Write-Host "[DRY-RUN] `"$adbExe`" shell am start -n com.ps2.shell/.MainActivity" -ForegroundColor Yellow
} else {
  & $adbExe install -r $apkPath
  if ($LASTEXITCODE -ne 0) { throw "adb install failed." }
  & $adbExe shell am start -n "com.ps2.shell/.MainActivity" | Out-Null
}

Step "Done"
Write-Host "One-click Android stdio simulation flow completed." -ForegroundColor Green

