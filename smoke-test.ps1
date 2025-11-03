Write-Host "=== QR LOGIN SMOKE TEST ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "[Setup] Waiting for server to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test 1: QR Code Generation
Write-Host "[Test 1] QR Code Generation Endpoint" -ForegroundColor Cyan
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/auth/qr-session/generate" -Method POST -ContentType "application/json" -Body '{"deviceInfo":"Test Device"}' -ErrorAction Stop
  
  if ($response.StatusCode -eq 200) {
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.qrCodeImage -match "^data:image/png") {
      Write-Host "  PASS" -ForegroundColor Green
      Write-Host "    Status: 200" -ForegroundColor Green
      $imgSize = [math]::Round($data.data.qrCodeImage.length/1024, 1)
      Write-Host "    Image: $imgSize KB" -ForegroundColor Green
      Write-Host "    Session: $($data.data.qrSessionId)" -ForegroundColor Green
      $sessionId = $data.data.qrSessionId
    } else {
      Write-Host "  FAIL - Invalid format" -ForegroundColor Red
    }
  }
} catch {
  Write-Host "  FAIL - $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: QR Status Check
if ($sessionId) {
  Write-Host "[Test 2] QR Status Polling" -ForegroundColor Cyan
  try {
    $url = "http://localhost:3000/api/v1/auth/qr-session/status/$sessionId"
    $response = Invoke-WebRequest -Uri $url -ErrorAction Stop
    
    if ($response.StatusCode -eq 200) {
      $data = $response.Content | ConvertFrom-Json
      Write-Host "  PASS" -ForegroundColor Green
      Write-Host "    Status: $($data.data.status)" -ForegroundColor Green
      Write-Host "    Device: $($data.data.deviceInfo)" -ForegroundColor Green
    }
  } catch {
    Write-Host "  FAIL - $_" -ForegroundColor Red
  }
}

Write-Host ""

# Test 3: Demo Login
Write-Host "[Test 3] Demo Login Endpoint" -ForegroundColor Cyan
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/demo-login" -Method POST -ContentType "application/json" -Body '{"email":"admin@example.com"}' -ErrorAction Stop
  
  if ($response.StatusCode -eq 200) {
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.accessToken) {
      Write-Host "  PASS" -ForegroundColor Green
      Write-Host "    Token obtained" -ForegroundColor Green
      Write-Host "    Role: $($data.data.role)" -ForegroundColor Green
    }
  }
} catch {
  Write-Host "  FAIL - $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETE ===" -ForegroundColor Cyan
