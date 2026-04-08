$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $projectRoot "out"

if (-not (Test-Path $outDir)) {
  throw "Missing out/ directory. Run 'npm run build:android' first."
}

# You can override this in shell:
# $env:UNIAPP_SHELL_DIR = "D:\yyh35\android_project\ps2_uniapp_shell"
$uniappShellDir = $env:UNIAPP_SHELL_DIR
if ([string]::IsNullOrWhiteSpace($uniappShellDir)) {
  $uniappShellDir = Join-Path $projectRoot "uniapp-shell"
}

$targetDir = Join-Path $uniappShellDir "hybrid\html\web"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

Write-Host "Syncing out/* -> $targetDir"
Remove-Item (Join-Path $targetDir "*") -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $outDir "*") -Destination $targetDir -Recurse -Force

$srcIndex = Join-Path $outDir "index.html"
$dstIndex = Join-Path $targetDir "index.html"
if (-not (Test-Path $dstIndex)) {
  throw "Sync failed: index.html not found in target directory."
}

$srcHash = (Get-FileHash $srcIndex -Algorithm SHA256).Hash
$dstHash = (Get-FileHash $dstIndex -Algorithm SHA256).Hash
if ($srcHash -ne $dstHash) {
  throw "Sync failed: out/index.html hash differs from target index.html."
}

Write-Host "sync-out-to-uniapp: OK"
Write-Host "UNIAPP_SHELL_DIR=$uniappShellDir"
Write-Host "TARGET=$targetDir"
