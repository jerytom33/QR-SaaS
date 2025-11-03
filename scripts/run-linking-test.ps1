param(
  [int]$Port = 3000,
  [int]$TimeoutSeconds = 90
)

Write-Host "[run-linking-test] Ensuring port $Port is free..." -ForegroundColor Yellow
try {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
      try { Stop-Process -Id $pid -Force -ErrorAction Stop; Write-Host "  Stopped PID $($pid)" }
      catch { Write-Warning "  Could not stop PID $($pid): $($_.Exception.Message)" }
    }
  }
} catch {}

Write-Host "[run-linking-test] Starting dev server in background job..." -ForegroundColor Yellow
$projectRoot = (Resolve-Path "$PSScriptRoot\..\").Path
$job = Start-Job -ScriptBlock {
  param($wd)
  Set-Location $wd
  npm run dev:custom
} -ArgumentList $projectRoot | Select-Object -ExpandProperty Id
Start-Sleep -Seconds 2

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/" -TimeoutSec 5 -ErrorAction Stop
    if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 800
}

if (-not $ready) {
  Write-Host "[run-linking-test] Server did not become ready in time." -ForegroundColor Red
  Receive-Job -Id $job -Keep | Out-Host
  exit 1
}

Write-Host "[run-linking-test] Server is ready. Prewarming routes..." -ForegroundColor Yellow
try {
  # Prewarm the homepage first
  Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/" -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
} catch {}
Start-Sleep -Seconds 1

try {
  # Prewarm generate route with valid JSON to trigger compilation
  $warmGen = '{"deviceInfo":"Test Device"}'
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://localhost:$Port/api/v1/auth/qr-session/generate" -ContentType 'application/json' -Body $warmGen -TimeoutSec 20 -ErrorAction SilentlyContinue | Out-Null
} catch {}
Start-Sleep -Seconds 2

try {
  # Prewarm scan route to trigger compilation
  $warmScan = '{"qrSessionId":"00000000-0000-0000-0000-000000000000"}'
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://localhost:$Port/api/v1/auth/qr-session/scan" -ContentType 'application/json' -Body $warmScan -TimeoutSec 20 -ErrorAction SilentlyContinue | Out-Null
} catch {}
Start-Sleep -Seconds 3

Write-Host "[run-linking-test] Running qr-linking-test.js ..." -ForegroundColor Green
node .\qr-linking-test.js
$exitCode = $LASTEXITCODE

Write-Host "[run-linking-test] Stopping background server..." -ForegroundColor Yellow
try { Stop-Job -Id $job -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Job -Id $job -Force -ErrorAction SilentlyContinue } catch {}

exit $exitCode
