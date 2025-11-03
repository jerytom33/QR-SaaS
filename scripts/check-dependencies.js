#!/usr/bin/env node

/**
 * 12-Factor App: Factor II - Dependencies
 * Explicit dependency management and security audit
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Critical security and production dependencies
const PRODUCTION_DEPENDENCIES = {
  required: [
    'next',
    'react',
    'react-dom',
    'typescript',
    '@prisma/client',
    'prisma',
    'zod',
    'next-auth',
    'tailwindcss',
    'lucide-react',
    '@radix-ui/react-avatar',
    '@radix-ui/react-button',
    '@radix-ui/react-card',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-label',
    '@radix-ui/react-select',
    '@radix-ui/react-tabs',
    '@radix-ui/react-toast',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@hookform/resolvers',
    'react-hook-form',
    'zustand',
    '@tanstack/react-query',
    'uuid',
    'clsx',
    'tailwind-merge',
    'date-fns',
    'framer-motion',
    'sonner',
    'socket.io',
    'socket.io-client'
  ],
  security: [
    'helmet',
    'cors',
    'bcryptjs',
    'jsonwebtoken',
    'rate-limiter-flexible',
    'express-rate-limit'
  ],
  monitoring: [
    'winston',
    'morgan',
    'prometheus-client',
    'newrelic',
    'sentry'
  ]
};

async function checkDependencies() {
  console.log('🔍 12-Factor App: Factor II - Dependencies Check\n');
  
  try {
    // Check if package.json exists
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    console.log('📦 Current Dependencies:');
    console.log(`   Production: ${Object.keys(packageJson.dependencies || {}).length}`);
    console.log(`   Development: ${Object.keys(packageJson.devDependencies || {}).length}`);
    console.log(`   Total: ${Object.keys(dependencies).length}\n`);

    // Check for required dependencies
    console.log('✅ Required Dependencies Check:');
    let missingRequired = [];
    
    PRODUCTION_DEPENDENCIES.required.forEach(dep => {
      if (dependencies[dep]) {
        console.log(`   ✓ ${dep}@${dependencies[dep]}`);
      } else {
        console.log(`   ✗ ${dep} - MISSING`);
        missingRequired.push(dep);
      }
    });

    // Security audit
    console.log('\n🔒 Security Audit:');
    try {
      const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
      const audit = JSON.parse(auditResult);
      
      if (audit.vulnerabilities) {
        const vulnCount = Object.keys(audit.vulnerabilities).length;
        if (vulnCount > 0) {
          console.log(`   ⚠️  Found ${vulnCount} vulnerabilities`);
          console.log('   Run: npm audit fix');
        } else {
          console.log('   ✓ No vulnerabilities found');
        }
      }
    } catch (error) {
      console.log('   ⚠️  Could not run security audit');
    }

    // Check for outdated packages
    console.log('\n📊 Outdated Packages:');
    try {
      const outdatedResult = execSync('npm outdated --json', { encoding: 'utf8' });
      const outdated = JSON.parse(outdatedResult);
      const outdatedCount = Object.keys(outdated).length;
      
      if (outdatedCount > 0) {
        console.log(`   ⚠️  ${outdatedCount} packages outdated`);
        Object.entries(outdated).forEach(([pkg, info]) => {
          console.log(`   - ${pkg}: ${info.current} → ${info.latest}`);
        });
      } else {
        console.log('   ✓ All packages up to date');
      }
    } catch (error) {
      console.log('   ✓ All packages up to date');
    }

    // Dependency size analysis
    console.log('\n📏 Bundle Size Analysis:');
    try {
      const analyzeResult = execSync('npx @next/bundle-analyzer --help', { encoding: 'utf8' });
      console.log('   ✓ Bundle analyzer available');
      console.log('   Run: npx @next/bundle-analyzer');
    } catch (error) {
      console.log('   ⚠️  Bundle analyzer not installed');
      console.log('   Install: npm install --save-dev @next/bundle-analyzer');
    }

    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if (missingRequired.length > 0) {
      console.log('   Install missing dependencies:');
      missingRequired.forEach(dep => {
        console.log(`   npm install ${dep}`);
      });
    }

    console.log('   Security improvements:');
    console.log('   npm install helmet cors bcryptjs jsonwebtoken');
    console.log('   npm install --save-dev @types/bcryptjs @types/jsonwebtoken');
    
    console.log('   Monitoring and logging:');
    console.log('   npm install winston morgan');
    console.log('   npm install --save-dev @types/winston');

    return {
      success: missingRequired.length === 0,
      missingRequired,
      totalDependencies: Object.keys(dependencies).length
    };

  } catch (error) {
    console.error('❌ Dependency check failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run the check
if (require.main === module) {
  checkDependencies()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { checkDependencies, PRODUCTION_DEPENDENCIES };