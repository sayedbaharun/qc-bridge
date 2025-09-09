#!/bin/bash

# Deploy Enhanced QC Bridge
echo "🚀 Deploying Enhanced QC Bridge v2.1"

# Backup current version
if [ -f "index.mjs" ]; then
    echo "📦 Backing up current version..."
    cp index.mjs index-backup-$(date +%Y%m%d-%H%M%S).mjs
fi

# Replace main file with enhanced version
echo "🔄 Updating main bridge file..."
cp enhanced-index.mjs index.mjs

# Update package.json if needed
if [ ! -f "package.json" ]; then
    echo "📋 Creating package.json..."
    cat > package.json << EOF
{
  "name": "qc-bridge-enhanced",
  "version": "2.1.0",
  "description": "Enhanced Quick Capture Bridge with observability",
  "type": "module",
  "main": "index.mjs",
  "scripts": {
    "start": "node index.mjs",
    "dev": "node index.mjs --verbose",
    "once": "node index.mjs --once --verbose",
    "dry-run": "node index.mjs --once --dry-run --verbose",
    "server": "node index.mjs --server"
  },
  "dependencies": {
    "@notionhq/client": "^2.2.15",
    "@supabase/supabase-js": "^2.39.7",
    "dotenv": "^16.3.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✅ Enhanced QC Bridge deployed successfully!"
echo ""
echo "🎯 New Features:"
echo "   - Structured JSON logging"
echo "   - Comprehensive metrics collection"
echo "   - Slack alerts for errors/warnings"
echo "   - Health check endpoint (/health)"
echo "   - Performance metrics endpoint (/metrics)"
echo "   - Enhanced error handling and retries"
echo "   - Memory usage tracking"
echo "   - Operation tracing"
echo ""
echo "📋 Usage:"
echo "   npm start          - Run continuously"
echo "   npm run once       - Single sync run"
echo "   npm run dry-run    - Test run (no changes)"
echo "   npm run server     - Health check server only"
echo ""
echo "🌐 Endpoints (when running):"
echo "   http://localhost:3000/health   - Health status"
echo "   http://localhost:3000/metrics  - Performance metrics"
echo ""
echo "⚙️  Environment variables to add:"
echo "   SLACK_WEBHOOK_URL              - For alert notifications"
echo "   PORT                           - Health check server port (default: 3000)"
echo ""
echo "🚀 Ready to start!"