param(
  [string]$ApiBaseUrl = "https://api.wdzsyyh.cloud"
)

$ErrorActionPreference = "Stop"
$script:HasFailure = $false

function Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Report-Success([string]$msg) {
  Write-Host "[OK] $msg" -ForegroundColor Green
}

function Report-Failure([string]$msg) {
  $script:HasFailure = $true
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

function Ensure-NoTailSlash([string]$url) {
  if ($url.EndsWith("/")) {
    return $url.TrimEnd("/")
  }
  return $url
}

function Check-Health([string]$baseUrl) {
  Step "Check GET /api/health"
  $healthUrl = "$baseUrl/api/health"
  try {
    $resp = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec 20
    Report-Success "GET /api/health status=$($resp.StatusCode)"
    Write-Host "Body: $($resp.Content)"
  } catch {
    Report-Failure "GET /api/health failed: $($_.Exception.Message)"
  }
}

function Check-CorsPreflight([string]$baseUrl) {
  Step "Check OPTIONS /api/chat (CORS preflight)"
  $url = "$baseUrl/api/chat"
  $headers = @{
    Origin = "https://appassets.androidplatform.net"
    "Access-Control-Request-Method" = "POST"
    "Access-Control-Request-Headers" = "content-type,authorization"
  }
  try {
    $resp = Invoke-WebRequest -Uri $url -Method OPTIONS -Headers $headers -TimeoutSec 20
    $allowOrigin = $resp.Headers["Access-Control-Allow-Origin"]
    $allowMethods = $resp.Headers["Access-Control-Allow-Methods"]
    $allowHeaders = $resp.Headers["Access-Control-Allow-Headers"]
    if ($allowOrigin -eq "https://appassets.androidplatform.net") {
      Report-Success "OPTIONS /api/chat status=$($resp.StatusCode), allow-origin ok"
    } else {
      Report-Failure "OPTIONS /api/chat returned unexpected allow-origin: $allowOrigin"
    }
    Write-Host "Access-Control-Allow-Methods: $allowMethods"
    Write-Host "Access-Control-Allow-Headers: $allowHeaders"
  } catch {
    Report-Failure "OPTIONS /api/chat failed: $($_.Exception.Message)"
  }
}

function Check-Chat([string]$baseUrl) {
  Step "Check POST /api/chat"
  $url = "$baseUrl/api/chat"
  $payload = @{
    messages = @(
      @{
        role = "user"
        content = "Please confirm API availability in one sentence."
      }
    )
    stream = $false
  } | ConvertTo-Json -Depth 6

  $headers = @{
    Origin = "https://appassets.androidplatform.net"
    "Content-Type" = "application/json"
  }

  try {
    $resp = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $payload -TimeoutSec 45
    Report-Success "POST /api/chat status=$($resp.StatusCode)"
    Write-Host "Body(first 280 chars): $($resp.Content.Substring(0, [Math]::Min(280, $resp.Content.Length)))"
  } catch {
    Report-Failure "POST /api/chat failed: $($_.Exception.Message)"
  }
}

$normalized = Ensure-NoTailSlash $ApiBaseUrl
Write-Host "Using API base: $normalized" -ForegroundColor Yellow
Check-Health $normalized
Check-CorsPreflight $normalized
Check-Chat $normalized

Step "Done"
if ($script:HasFailure) {
  Write-Host "Some checks failed. Fix endpoint reachability/CORS before rebuilding APK." -ForegroundColor Yellow
  exit 1
}
Write-Host "All checks passed. If phone still fails, rebuild APK and reinstall." -ForegroundColor Green
