const http = require('http');

async function runQRVerificationTest() {
  console.log('\n========== QR VERIFICATION SMOKE TEST ==========\n');

  return new Promise((resolve) => {
    // Step 1: Generate QR Code
    console.log('Step 1: Generate QR Code Session\n');
    
    const postData = JSON.stringify({ deviceInfo: 'Verification Test Device' });
    
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
            const qrData = json.data.qrCodeData;
            
            console.log('✓ PASS - QR Session Created');
            console.log(`  • Session ID: ${sessionId}`);
            console.log(`  • QR Data: ${qrData}`);
            console.log(`  • Initial Status: ${json.data.status || 'PENDING'}`);
            console.log(`  • Expires: ${new Date(json.data.expiresAt).toLocaleString()}\n`);

            // Step 2: Check Initial Status
            console.log('Step 2: Verify Initial Status (PENDING)\n');
            
            setTimeout(() => {
              const statusOptions = {
                hostname: 'localhost',
                port: 3000,
                path: `/api/v1/auth/qr-session/status/${sessionId}`,
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
                    
                    if (statusRes.statusCode === 200 && statusJson.data.status === 'PENDING') {
                      console.log('✓ PASS - Initial Status Correct');
                      console.log(`  • Status: ${statusJson.data.status}`);
                      console.log(`  • Session ID: ${statusJson.data.id}\n`);

                      // Step 3: Simulate QR Scan
                      console.log('Step 3: Simulate QR Code Scan\n');
                      
                      const scanData = JSON.stringify({ 
                        qrSessionId: sessionId,
                        userId: 'test-user-id'
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
                              console.log('✓ PASS - QR Scan Successful');
                              console.log(`  • Status Code: ${scanRes.statusCode}`);
                              console.log(`  • New Status: ${scanJson.data?.status || 'SCANNED'}`);
                              console.log(`  • Message: ${scanJson.message}\n`);

                              // Step 4: Verify Updated Status
                              console.log('Step 4: Verify Status Changed to SCANNED\n');
                              
                              setTimeout(() => {
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
                                        const finalStatus = verifyJson.data.status;
                                        const isScanned = finalStatus === 'SCANNED' || finalStatus === 'COMPLETED';
                                        
                                        if (isScanned) {
                                          console.log('✓ PASS - Status Updated Successfully');
                                          console.log(`  • Current Status: ${finalStatus}`);
                                          console.log(`  • Device Info: ${verifyJson.data.deviceInfo || 'N/A'}\n`);
                                          
                                          console.log('========== ALL VERIFICATION TESTS PASSED ==========\n');
                                          console.log('QR Verification Flow: FUNCTIONAL ✓');
                                          console.log('• Session Creation: ✓');
                                          console.log('• Initial Status Check: ✓');
                                          console.log('• QR Code Scanning: ✓');
                                          console.log('• Status Update: ✓');
                                          console.log('• Database Persistence: ✓\n');
                                        } else {
                                          console.log('✗ FAIL - Status not updated correctly');
                                          console.log(`  Expected: SCANNED or COMPLETED`);
                                          console.log(`  Actual: ${finalStatus}\n`);
                                        }
                                      } else {
                                        console.log('✗ FAIL - Status verification failed');
                                        console.log(`  Status Code: ${verifyRes.statusCode}\n`);
                                      }
                                      resolve();
                                    } catch (e) {
                                      console.log('✗ FAIL - Could not parse verification response:', e.message);
                                      resolve();
                                    }
                                  });
                                });

                                verifyReq.on('error', (e) => {
                                  console.log('✗ FAIL - Verification request error:', e.message);
                                  resolve();
                                });

                                verifyReq.end();
                              }, 1000);

                            } else {
                              console.log('✗ FAIL - QR Scan Failed');
                              console.log(`  Status Code: ${scanRes.statusCode}`);
                              console.log(`  Response: ${scanResponseData}\n`);
                              resolve();
                            }
                          } catch (e) {
                            console.log('✗ FAIL - Could not parse scan response:', e.message);
                            console.log(`  Raw response: ${scanResponseData}`);
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
                    } else {
                      console.log('✗ FAIL - Initial status check failed');
                      console.log(`  Expected: PENDING`);
                      console.log(`  Actual: ${statusJson.data?.status || 'unknown'}\n`);
                      resolve();
                    }
                  } catch (e) {
                    console.log('✗ FAIL - Could not parse initial status response:', e.message);
                    resolve();
                  }
                });
              });

              statusReq.on('error', (e) => {
                console.log('✗ FAIL - Initial status request error:', e.message);
                resolve();
              });

              statusReq.end();
            }, 500);
          } else {
            console.log('✗ FAIL - QR generation failed');
            console.log(`  Status Code: ${res.statusCode}`);
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
setTimeout(runQRVerificationTest, 2000);
