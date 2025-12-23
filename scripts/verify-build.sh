#!/bin/bash

# ARES Dashboard - Build Verification Script
# This script validates that the build is ready for deployment

set -e

echo "🔍 ARES Dashboard - Build Verification"
echo "======================================"
echo ""

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "   Current: $NODE_VERSION"
REQUIRED_MAJOR=20
CURRENT_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$CURRENT_MAJOR" -ne "$REQUIRED_MAJOR" ]; then
    echo "   ⚠️  WARNING: Expected Node.js v$REQUIRED_MAJOR.x, found v$CURRENT_MAJOR"
    echo "   Consider using nvm to switch: nvm use $REQUIRED_MAJOR"
else
    echo "   ✅ Node.js version is correct"
fi
echo ""

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist
echo "   ✅ Cleaned"
echo ""

# Run build
echo "🔨 Building application..."
npm run build
echo "   ✅ Build completed"
echo ""

# Verify dist folder exists
echo "📁 Verifying build output..."
if [ ! -d "dist" ]; then
    echo "   ❌ ERROR: dist folder not found!"
    exit 1
fi
echo "   ✅ dist folder exists"

# Check for index.html
if [ ! -f "dist/index.html" ]; then
    echo "   ❌ ERROR: dist/index.html not found!"
    exit 1
fi
echo "   ✅ index.html exists"

# Check for assets folder
if [ ! -d "dist/assets" ]; then
    echo "   ❌ ERROR: dist/assets folder not found!"
    exit 1
fi
echo "   ✅ assets folder exists"

# Count JavaScript files
JS_COUNT=$(find dist/assets -name "*.js" | wc -l)
if [ "$JS_COUNT" -eq 0 ]; then
    echo "   ❌ ERROR: No JavaScript files found in assets!"
    exit 1
fi
echo "   ✅ Found $JS_COUNT JavaScript file(s)"

# Check asset paths in index.html
echo ""
echo "🔗 Validating asset paths..."
if grep -q 'src="/assets/' dist/index.html; then
    echo "   ✅ Assets use absolute paths (correct for SPA)"
else
    echo "   ⚠️  WARNING: Assets may not use absolute paths"
fi

# Check for common issues
echo ""
echo "🔍 Checking for common issues..."
if grep -q 'PLACEHOLDER' .env.local 2>/dev/null; then
    echo "   ⚠️  WARNING: .env.local contains placeholder values"
    echo "      This is OK for local dev, but ensure production uses real env vars"
fi

# Display build size
echo ""
echo "📊 Build statistics:"
DIST_SIZE=$(du -sh dist | cut -f1)
echo "   Total size: $DIST_SIZE"
echo "   Files:"
ls -lh dist/assets/*.js 2>/dev/null | awk '{print "     "$9" - "$5}'

echo ""
echo "✅ Build verification complete!"
echo ""
echo "🚀 Ready to deploy to Vercel!"
echo "   Run: vercel --prod"
echo ""
