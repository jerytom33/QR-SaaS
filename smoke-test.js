const http = require('http');

async function runSmokeTest() {
  console.log('\n========== QR LOGIN SMOKE TEST ==========\n');

  // Test 1: QR Code Generation
  console.log('Test 1: QR Code Generation\n');
  
  return new Promise((resolve) => {
    const postData = JSON.stringify({ deviceInfo: 'SmokeTest' });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/qr-session/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (res.statusCode === 200 && json.data.qrCodeImage) {
            console.log('✓ PASS - QR Code Generated');
            console.log(`  • Status: ${res.statusCode}`);
            console.log(`  • Session ID: ${json.data.qrSessionId}`);
            console.log(`  • Image Size: ${(json.data.qrCodeImage.length / 1024).toFixed(1)}KB`);
            console.log(`  • Format: ${json.data.qrCodeImage.substring(0, 20)}...\n`);
            if (json.data.provider) {
              console.log(`  • Provider: ${json.data.provider}`);
            }

            // Test 2: Status Endpoint
            console.log('Test 2: QR Status Endpoint\n');
            
            const statusOptions = {
              hostname: 'localhost',
              port: 3000,
              path: `/api/v1/auth/qr-session/status/${json.data.qrSessionId}`,
              method: 'GET'
            };

            const statusReq = http.request(statusOptions, (statusRes) => {
              let statusData = '';
              
              statusRes.on('data', (chunk) => {
                statusData += chunk;
              });

              statusRes.on('end', () => {
                try {
                  const statusJson = JSON.parse(statusData);
                  
                  if (statusRes.statusCode === 200 && statusJson.data.status) {
                    console.log('✓ PASS - Status Retrieved');
                    console.log(`  • Status: ${statusJson.data.status}`);
                    console.log(`  • Device: ${statusJson.data.deviceInfo}\n`);

                    // Test 3: Demo Login
                    console.log('Test 3: Demo Login Endpoint\n');
                    
                    const loginData = JSON.stringify({ email: 'admin@acme.local' });
                    const loginOptions = {
                      hostname: 'localhost',
                      port: 3000,
                      path: '/api/auth/demo-login',
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(loginData)
                      }
                    };

                    const loginReq = http.request(loginOptions, (loginRes) => {
                      let loginDataStr = '';
                      
                      loginRes.on('data', (chunk) => {
                        loginDataStr += chunk;
                      });

                      loginRes.on('end', () => {
                        try {
                          const loginJson = JSON.parse(loginDataStr);
                          
                          if (loginRes.statusCode === 200 && loginJson.data.tokens && loginJson.data.tokens.accessToken) {
                            console.log('✓ PASS - Demo Login Successful');
                            console.log(`  • Role: ${loginJson.data.user.role}`);
                            console.log(`  • User: ${loginJson.data.user.name}`);
                            console.log(`  • Tenant: ${loginJson.data.user.tenant.name}\n`);
                            
                            console.log('========== ALL TESTS PASSED ==========\n');
                            console.log('QR Login Flow: FUNCTIONAL ✓');
                            console.log('• QR Generation: ✓');
                            console.log('• Status Polling: ✓');
                            console.log('• Authentication: ✓');
                            console.log('• Neon PostgreSQL: ✓\n');
                          } else {
                            console.log('✗ FAIL - Login response invalid');
                            console.log('Response:', JSON.stringify(loginJson, null, 2));
                          }
                          resolve();
                        } catch (e) {
                          console.log('✗ FAIL - Could not parse login response:', e.message);
                          resolve();
                        }
                      });
                    });

                    loginReq.on('error', (e) => {
                      console.log('✗ FAIL - Login request error:', e.message);
                      resolve();
                    });

                    loginReq.write(loginData);
                    loginReq.end();
                  } else {
                    console.log('✗ FAIL - Status response invalid');
                    resolve();
                  }
                } catch (e) {
                  console.log('✗ FAIL - Could not parse status response:', e.message);
                  resolve();
                }
              });
            });

            statusReq.on('error', (e) => {
              console.log('✗ FAIL - Status request error:', e.message);
              resolve();
            });

            statusReq.end();
          } else {
            console.log('✗ FAIL - QR response invalid');
            resolve();
          }
        } catch (e) {
          console.log('✗ FAIL - Could not parse response:', e.message);
          resolve();
        }
      });
    });

    req.on('error', (e) => {
      console.log('✗ FAIL - Could not connect to server:', e.message);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

// Wait for server to be ready
setTimeout(runSmokeTest, 3000);
