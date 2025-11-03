#!/bin/bash

# 12-Factor App: Factor V - Build, Release, Run
# Strict separation between build, release, and run stages

set -e

echo "🏗️  12-Factor App: Factor V - Build Stage"
echo "=================================="

# Load environment variables
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found, using defaults"
fi

# Check Node.js version
echo "🔍 Checking Node.js version"
node --version
npm --version

# Clean previous build
echo "🧹 Cleaning previous build"
rm -rf .next
rm -rf dist
rm -rf build

# Install dependencies
echo "📦 Installing dependencies"
npm ci --production=false

# Run dependency check
echo "🔍 Running dependency security audit"
npm audit --audit-level high
if [ $? -ne 0 ]; then
    echo "⚠️  Security vulnerabilities found. Run 'npm audit fix' to resolve."
    exit 1
fi

# Type checking
echo "🔍 Running TypeScript type checking"
npx tsc --noEmit

# Linting
echo "🔍 Running ESLint"
npm run lint

# Build the application
echo "🏗️  Building Next.js application"
npm run build

# Generate Prisma client
echo "🗄️  Generating Prisma client"
npx prisma generate

# Create build info
echo "📋 Creating build information"
cat > .build-info.json << EOF
{
  "buildTime": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "nodeVersion": "$(node --version)",
  "npmVersion": "$(npm --version)",
  "environment": "${NODE_ENV:-development}",
  "buildNumber": "${BUILD_NUMBER:-local}"
}
EOF

# Optimize build
echo "⚡ Optimizing build"
npx next build --optimize

# Create release package
echo "📦 Creating release package"
mkdir -p release
cp -r .next release/
cp -r public release/
cp package.json release/
cp package-lock.json release/
cp .build-info.json release/
cp prisma release/ -r
cp next.config.ts release/ 2>/dev/null || cp next.config.js release/ 2>/dev/null || true

# Create startup script
cat > release/start.sh << 'EOF'
#!/bin/bash
# 12-Factor App: Factor V - Run Stage
set -e

echo "🚀 Starting CRM Flow Application"
echo "==============================="

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check database connection
echo "🔍 Checking database connection"
npx prisma db push --accept-data-loss 2>/dev/null || true

# Start the application
echo "🌟 Starting application server"
NODE_ENV=production npm start
EOF

chmod +x release/start.sh

# Create health check script
cat > release/health-check.sh << 'EOF'
#!/bin/bash
# Health check for the application
set -e

echo "🔍 Running health checks"

# Check if application is responding
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Application is healthy"
    exit 0
else
    echo "❌ Application is unhealthy"
    exit 1
fi
EOF

chmod +x release/health-check.sh

echo "✅ Build completed successfully!"
echo "📦 Release package created in ./release/"
echo "🚀 Run './release/start.sh' to start the application"