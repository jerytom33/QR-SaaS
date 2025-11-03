// Test script to verify API endpoints
const BASE_URL = 'http://localhost:3000';

async function testDemoLogin() {
  console.log('\n=== Testing Demo Login API ===\n');

  try {
    // Test 1: Get demo accounts
    console.log('📋 Test 1: Fetching demo accounts...');
    const getResponse = await fetch(`${BASE_URL}/api/auth/demo-login`);
    const accounts = await getResponse.json();

    if (getResponse.ok) {
      console.log('✅ Successfully fetched demo accounts:');
      console.log(`   Found ${accounts.accounts.length} accounts`);
      accounts.accounts.forEach(acc => {
        console.log(`   - ${acc.name} (${acc.email}) - Role: ${acc.role} - Tenant: ${acc.tenant.name}`);
      });
    } else {
      console.log('❌ Failed to fetch accounts:', accounts.error);
    }

    // Test 2: Login with superadmin
    console.log('\n📝 Test 2: Testing super admin login...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@demo.com' })
    });
    const loginData = await loginResponse.json();

    if (loginResponse.ok) {
      console.log('✅ Super admin login successful!');
      console.log(`   User: ${loginData.user.name}`);
      console.log(`   Email: ${loginData.user.email}`);
      console.log(`   Role: ${loginData.user.role}`);
      console.log(`   Tenant: ${loginData.user.tenant.name}`);
      console.log(`   Access Token Length: ${loginData.tokens.accessToken.length}`);
      console.log(`   Refresh Token Length: ${loginData.tokens.refreshToken.length}`);
    } else {
      console.log('❌ Super admin login failed:', loginData.error);
    }

    // Test 3: Login with tenant admin
    console.log('\n📝 Test 3: Testing tenant admin login...');
    const adminLoginResponse = await fetch(`${BASE_URL}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.com' })
    });
    const adminLoginData = await adminLoginResponse.json();

    if (adminLoginResponse.ok) {
      console.log('✅ Tenant admin login successful!');
      console.log(`   User: ${adminLoginData.user.name}`);
      console.log(`   Role: ${adminLoginData.user.role}`);
    } else {
      console.log('❌ Tenant admin login failed:', adminLoginData.error);
    }

    // Test 4: Login with invalid email
    console.log('\n📝 Test 4: Testing invalid email...');
    const invalidResponse = await fetch(`${BASE_URL}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid@example.com' })
    });
    const invalidData = await invalidResponse.json();

    if (!invalidResponse.ok) {
      console.log('✅ Correctly rejected invalid email:', invalidData.error);
    } else {
      console.log('❌ Should have rejected invalid email');
    }

    console.log('\n=== All tests completed ===\n');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    console.error('Make sure the server is running on http://localhost:3000');
  }
}

testDemoLogin();
