#!/usr/bin/env bash
set -e

# Script to generate mobile assets and initialize Capacitor

echo "=== ProofEat Mobile Setup ==="

cd "$(dirname "$0")/.."

# Install dependencies
echo "Installing npm dependencies..."
cd frontend
npm install --silent

# Build web assets
echo "Building web assets..."
npm run build

# Check if Capacitor is initialized
if [ ! -f "capacitor.config.ts" ]; then
    echo "Initializing Capacitor..."
    npx cap init proofeat cloud.proofeat.proofeat --silent
fi

# Add platforms if not present
if [ ! -d "android" ]; then
    echo "Adding Android platform..."
    npx cap add android --silent
fi

if [ ! -d "ios" ]; then
    echo "Adding iOS platform..."
    npx cap add ios --silent
fi

# Sync native projects
echo "Syncing native projects..."
npx cap sync

echo ""
echo "✓ Mobile setup complete!"
echo ""
echo "To build for Android:"
echo "  cd frontend && npx cap open android"
echo "  In Android Studio: Build > Generate Signed Bundle/APK"
echo ""
echo "To build for iOS:"
echo "  cd frontend && npx cap open ios"
echo "  In Xcode: Product > Archive"
echo ""
echo "For Docker deployment:"
echo "  docker-compose -f ../docker-compose.prod.yml up -d"