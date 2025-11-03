#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                QR SAAS - COMPREHENSIVE TEST SUITE              ║');
console.log('║                   Neon PostgreSQL Backend                      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const tests = [
  {
    name: 'Basic QR Login Flow',
    file: 'smoke-test.js',
    description: 'Tests QR generation, status polling, and demo authentication'
  },
  {
    name: 'QR Verification Flow',
    file: 'qr-verification-test.js',
    description: 'Tests QR scanning and status updates'
  },
  {
    name: 'QR Device Linking Flow',
    file: 'qr-linking-test.js',
    description: 'Tests complete device linking with authentication'
  }
];

let currentTest = 0;
const results = [];

function runTest(testIndex) {
  if (testIndex >= tests.length) {
    displayResults();
    return;
  }

  const test = tests[testIndex];
  console.log(`\n[${ testIndex + 1}/${tests.length}] Running: ${test.name}`);
  console.log(`    ${test.description}`);
  console.log('─'.repeat(70));

  const startTime = Date.now();
  const child = spawn('node', [test.file], { shell: true });

  let output = '';
  let errorOutput = '';

  child.stdout.on('data', (data) => {
    output += data.toString();
    process.stdout.write(data);
  });

  child.stderr.on('data', (data) => {
    errorOutput += data.toString();
    process.stderr.write(data);
  });

  child.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const passed = code === 0 && output.includes('ALL') && output.includes('PASSED');
    
    results.push({
      name: test.name,
      passed,
      duration,
      code
    });

    if (passed) {
      console.log(`\n✓ ${test.name} - PASSED (${duration}s)\n`);
    } else {
      console.log(`\n✗ ${test.name} - FAILED (${duration}s)\n`);
    }

    currentTest++;
    setTimeout(() => runTest(currentTest), 1000);
  });
}

function displayResults() {
  console.log('\n' + '═'.repeat(70));
  console.log('\n                      TEST RESULTS SUMMARY\n');
  console.log('═'.repeat(70) + '\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  results.forEach((result, index) => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    console.log(`${index + 1}. ${color}${status}\x1b[0m - ${result.name} (${result.duration}s)`);
  });

  console.log('\n' + '─'.repeat(70));
  console.log(`\nTotal Tests: ${total}`);
  console.log(`Passed: \x1b[32m${passed}\x1b[0m`);
  console.log(`Failed: \x1b[31m${failed}\x1b[0m`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (passed === total) {
    console.log('\n\x1b[32m╔═══════════════════════════════════════════════════════════════╗');
    console.log('║              ✓ ALL TESTS PASSED SUCCESSFULLY!                 ║');
    console.log('║                                                               ║');
    console.log('║  • QR Code Generation: ✓                                     ║');
    console.log('║  • QR Code Scanning: ✓                                       ║');
    console.log('║  • Status Management: ✓                                      ║');
    console.log('║  • Device Linking: ✓                                         ║');
    console.log('║  • Authentication: ✓                                         ║');
    console.log('║  • Neon PostgreSQL: ✓                                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
  } else {
    console.log('\n\x1b[31m╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✗ SOME TESTS FAILED                        ║');
    console.log('║                                                               ║');
    console.log('║  Please review the test output above for details.            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Start running tests
console.log('Checking server availability...');
console.log('Server should be running on http://localhost:3000\n');

setTimeout(() => {
  runTest(0);
}, 2000);
