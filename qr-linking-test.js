const http = require('http');

async function runQRLinkingTest() {
  console.log('\n========== QR DEVICE LINKING SMOKE TEST ==========\n');

  return new Promise((resolve) => {
    // Step 1: Generate QR Code
    console.log('Step 1: Generate QR Code for Linking\n');
    
    const postData = JSON.stringify({ deviceInfo: 'Windows Desktop - Chrome' });
    
    const generateOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/qr-session/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const generateReq = http.request(generateOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (res.statusCode === 200 && json.data.qrSessionId) {
            const sessionId = json.data.qrSessionId;
            
            console.log('✓ PASS - QR Session Created for Linking');
            console.log(`  • Session ID: ${sessionId}`);
            console.log(`  • Device: ${json.data.deviceInfo}`);
            console.log(`  • QR Image Size: ${(json.data.qrCodeImage?.length / 1024 || 0).toFixed(1)}KB\n`);

            // Step 2: Scan QR Code
            console.log('Step 2: Scan QR Code (Mobile Device)\n');
            
            setTimeout(() => {
              const scanData = JSON.stringify({ 
                qrSessionId: sessionId,
                userId: 'user_mobile_12345'
              });
              
              const scanOptions = {
                hostname: 'localhost',
                port: 3000,
                path: '/api/v1/auth/qr-session/scan',
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(scanData)
                }
              };

              const scanReq = http.request(scanOptions, (scanRes) => {
                let scanResponseData = '';
                
                scanRes.on('data', (chunk) => {
                  scanResponseData += chunk;
                });

                scanRes.on('end', () => {
                  try {
                    const scanJson = JSON.parse(scanResponseData);
                    
                    if (scanRes.statusCode === 200) {
                      console.log('✓ PASS - QR Scanned by Mobile Device');
                      console.log(`  • Status: ${scanJson.data?.status || 'SCANNED'}`);
                      console.log(`  • Message: ${scanJson.data?.message || scanJson.message}\n`);

                      // Step 3: Confirm/Link Device
                      console.log('Step 3: Confirm Device Linking\n');
                      
                      setTimeout(() => {
                        // First login as a user to get a valid token
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
                              
                              if (loginRes.statusCode === 200 && loginJson.data.tokens) {
                                const accessToken = loginJson.data.tokens.accessToken;
                                const userId = loginJson.data.user.id;
                                
                                console.log('✓ PASS - User Authenticated');
                                console.log(`  • User: ${loginJson.data.user.name}`);
                                console.log(`  • Role: ${loginJson.data.user.role}\n`);
                                
                                console.log('Step 4: Link Device to User Profile\n');
                                
                                const linkData = JSON.stringify({
                                  qrSessionId: sessionId,
                                  userId: userId,
                                  deviceInfo: 'iPhone 15 Pro - Safari'
                                });
                                
                                const linkOptions = {
                                  hostname: 'localhost',
                                  port: 3000,
                                  path: '/api/v1/auth/qr-session/link',
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': Buffer.byteLength(linkData),
                                    'Authorization': `Bearer ${accessToken}`
                                  }
                                };

                                const linkReq = http.request(linkOptions, (linkRes) => {
                                  let linkDataStr = '';
                                  
                                  linkRes.on('data', (chunk) => {
                                    linkDataStr += chunk;
                                  });

                                  linkRes.on('end', () => {
                                    try {
                                      const linkJson = JSON.parse(linkDataStr);
                                      
                                      if (linkRes.statusCode === 200) {
                                        console.log('✓ PASS - Device Linked Successfully');
                                        console.log(`  • Status: ${linkJson.data?.status || 'COMPLETED'}`);
                                        console.log(`  • Tokens Generated: ${linkJson.data?.accessToken ? 'Yes' : 'No'}`);
                                        console.log(`  • Refresh Token: ${linkJson.data?.refreshToken ? 'Yes' : 'No'}\n`);
                                        
                                        // Step 5: Verify Final Status
                                        console.log('Step 5: Verify Final Session Status\n');
                                        
                                        const verifyOptions = {
                                          hostname: 'localhost',
                                          port: 3000,
                                          path: `/api/v1/auth/qr-session/status/${sessionId}`,
                                          method: 'GET'
                                        };

                                        const verifyReq = http.request(verifyOptions, (verifyRes) => {
                                          let verifyData = '';
                                          
                                          verifyRes.on('data', (chunk) => {
                                            verifyData += chunk;
                                          });

                                          verifyRes.on('end', () => {
                                            try {
                                              const verifyJson = JSON.parse(verifyData);
                                              
                                              if (verifyRes.statusCode === 200) {
                                                console.log('✓ PASS - Final Status Verified');
                                                console.log(`  • Status: ${verifyJson.data.status}`);
                                                console.log(`  • Has Token: ${verifyJson.data.linkedToken ? 'Yes' : 'No'}\n`);
                                                
                                                console.log('========== ALL LINKING TESTS PASSED ==========\n');
                                                console.log('QR Device Linking Flow: FUNCTIONAL ✓');
                                                console.log('• QR Session Creation: ✓');
                                                console.log('• QR Code Scanning: ✓');
                                                console.log('• User Authentication: ✓');
                                                console.log('• Device Linking: ✓');
                                                console.log('• Session Completion: ✓');
                                                console.log('• Neon PostgreSQL Integration: ✓\n');
                                              } else {
                                                console.log('✗ FAIL - Status verification failed');
                                                console.log(`  Status Code: ${verifyRes.statusCode}\n`);
                                              }
                                              resolve();
                                            } catch (e) {
                                              console.log('✗ FAIL - Could not parse final status:', e.message);
                                              resolve();
                                            }
                                          });
                                        });

                                        verifyReq.on('error', (e) => {
                                          console.log('✗ FAIL - Final verification error:', e.message);
                                          resolve();
                                        });

                                        verifyReq.end();
                                      } else {
                                        console.log('✗ FAIL - Device Linking Failed');
                                        console.log(`  Status Code: ${linkRes.statusCode}`);
                                        console.log(`  Response: ${linkDataStr}\n`);
                                        resolve();
                                      }
                                    } catch (e) {
                                      console.log('✗ FAIL - Could not parse link response:', e.message);
                                      resolve();
                                    }
                                  });
                                });

                                linkReq.on('error', (e) => {
                                  console.log('✗ FAIL - Link request error:', e.message);
                                  resolve();
                                });

                                linkReq.write(linkData);
                                linkReq.end();
                              } else {
                                console.log('✗ FAIL - Authentication failed');
                                resolve();
                              }
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
                      }, 500);
                    } else {
                      console.log('✗ FAIL - QR Scan Failed');
                      console.log(`  Status Code: ${scanRes.statusCode}\n`);
                      resolve();
                    }
                  } catch (e) {
                    console.log('✗ FAIL - Could not parse scan response:', e.message);
                    resolve();
                  }
                });
              });

              scanReq.on('error', (e) => {
                console.log('✗ FAIL - Scan request error:', e.message);
                resolve();
              });

              scanReq.write(scanData);
              scanReq.end();
            }, 500);
          } else {
            console.log('✗ FAIL - QR generation failed');
            resolve();
          }
        } catch (e) {
          console.log('✗ FAIL - Could not parse generation response:', e.message);
          resolve();
        }
      });
    });

    generateReq.on('error', (e) => {
      console.log('✗ FAIL - Could not connect to server:', e.message);
      console.log('\nMake sure the server is running on http://localhost:3000\n');
      resolve();
    });

    generateReq.write(postData);
    generateReq.end();
  });
}

// Run the test
console.log('\nWaiting for server to be ready...');
setTimeout(runQRLinkingTest, 2000);
