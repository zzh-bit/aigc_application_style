param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,

  [string]$AppId = "",

  [string]$Model = "Doubao-Seed-2.0-pro",

  [string]$Prompt = "Please confirm you are available and return your model name in one sentence."
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppId)) {
  if ($ApiKey.Contains(".")) {
    $AppId = $ApiKey.Split(".")[0]
  } elseif ($ApiKey.Contains(":")) {
    $AppId = $ApiKey.Split(":")[0]
  }
}

function Write-Ok($msg) {
  Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Fail($msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

function Invoke-VivoChat([string]$queryKeyName) {
  $requestId = [guid]::NewGuid().ToString()
  $baseUrl = "https://api-ai.vivo.com.cn/v1/chat/completions"
  $uri = "{0}?{1}={2}" -f $baseUrl, $queryKeyName, $requestId

  $headers = @{
    "Content-Type"  = "application/json; charset=utf-8"
    "Authorization" = "Bearer $ApiKey"
  }
  if (-not [string]::IsNullOrWhiteSpace($AppId)) {
    $headers["app_id"] = $AppId
  }

  $body = @{
    model       = $Model
    stream      = $false
    temperature = 0.3
    max_tokens  = 512
    messages    = @(
      @{
        role    = "system"
        content = "You are a concise assistant."
      },
      @{
        role    = "user"
        content = $Prompt
      }
    )
  } | ConvertTo-Json -Depth 8

  try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -TimeoutSec 60
    return @{
      ok = $true
      requestId = $requestId
      queryKey = $queryKeyName
      response = $resp
      error = $null
    }
  } catch {
    $detail = $null
    if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $detail = $reader.ReadToEnd()
    }
    return @{
      ok = $false
      requestId = $requestId
      queryKey = $queryKeyName
      response = $null
      error = "$($_.Exception.Message)`n$detail"
    }
  }
}

Write-Host "== Vivo Provider Probe =="
Write-Host "Model: $Model"
if (-not [string]::IsNullOrWhiteSpace($AppId)) {
  Write-Host "AppId: $AppId"
}

# Try request_id first, then requestId
$r1 = Invoke-VivoChat -queryKeyName "request_id"
if (-not $r1.ok) {
  Write-Host "[WARN] request_id failed, retry with requestId..." -ForegroundColor Yellow
  $r2 = Invoke-VivoChat -queryKeyName "requestId"
  if (-not $r2.ok) {
    Write-Fail "Provider request failed with both request_id and requestId."
    Write-Host ""
    Write-Host "--- request_id error ---"
    Write-Host $r1.error
    Write-Host ""
    Write-Host "--- requestId error ---"
    Write-Host $r2.error
    if ($r1.error -like "*missing required app_id*" -or $r2.error -like "*missing required app_id*") {
      Write-Host ""
      Write-Host "Hint: Vivo requires app_id header for this key."
      Write-Host "Retry with: -AppId ""<your_app_id>"""
    }
    exit 1
  }
  $result = $r2
} else {
  $result = $r1
}

$resp = $result.response
$content = $null
$respModel = $null
$usage = $null

if ($resp -and $resp.choices -and $resp.choices.Count -gt 0) {
  $content = $resp.choices[0].message.content
  $respModel = $resp.model
  $usage = $resp.usage
}

if ([string]::IsNullOrWhiteSpace($content)) {
  Write-Fail "Provider returned empty content."
  Write-Host "Raw response:"
  $resp | ConvertTo-Json -Depth 10
  exit 1
}

Write-Ok "Vivo provider reachable"
Write-Host "Request query key: $($result.queryKey)"
Write-Host "Request id: $($result.requestId)"
Write-Host "Response model: $respModel"
Write-Host ""
Write-Host "Assistant reply:"
Write-Host $content

if ($usage) {
  Write-Host ""
  Write-Host "Token usage:"
  Write-Host "  prompt_tokens: $($usage.prompt_tokens)"
  Write-Host "  completion_tokens: $($usage.completion_tokens)"
  Write-Host "  total_tokens: $($usage.total_tokens)"
}

exit 0
