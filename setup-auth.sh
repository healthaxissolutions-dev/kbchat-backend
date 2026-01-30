#!/bin/bash

# OAuth Auth Module - Quick Start Setup Script
# This script helps you set up the OAuth auth module

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  OAuth Auth Module - Quick Start Setup                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 2: Build TypeScript
echo "🔨 Step 2: Building TypeScript..."
npm run build
echo "✅ TypeScript compiled"
echo ""

# Step 3: Generate JWT secret
echo "🔐 Step 3: Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)
echo "Generated JWT_SECRET: $JWT_SECRET"
echo ""

# Step 4: Show environment variables needed
echo "📝 Step 4: Environment variables to add to .env"
echo ""
echo "AZURE_AD_CLIENT_ID=your-client-id-from-azure-portal"
echo "AZURE_AD_CLIENT_SECRET=your-client-secret-from-azure-portal"
echo "AZURE_AD_TENANT_ID=your-tenant-id-from-azure-portal"
echo "OAUTH_REDIRECT_URI=http://localhost:5001/api/auth/callback"
echo "JWT_SECRET=$JWT_SECRET"
echo "JWT_EXPIRES_IN=1h"
echo "JWT_REFRESH_EXPIRES_IN=7d"
echo "BACKEND_URL=http://localhost:5001"
echo "FRONTEND_URL=http://localhost:3000"
echo ""

# Step 5: Show next steps
echo "📋 Next steps:"
echo ""
echo "1. Update your .env file with the values above"
echo "   - Go to Azure Portal > App registrations"
echo "   - Create new app registration"
echo "   - Copy Client ID and create Client Secret"
echo "   - Add redirect URI: http://localhost:5001/api/auth/callback"
echo ""
echo "2. Update server.js to import auth routes:"
echo "   import cookieParser from 'cookie-parser';"
echo "   import authRoutes from './dist/auth/routes.js';"
echo "   app.use(cookieParser());"
echo "   app.use('/api/auth', authRoutes);"
echo ""
echo "3. Protect existing routes:"
echo "   import { authenticate } from './dist/auth/middleware/authenticate.js';"
echo "   app.post('/api/chat', authenticate, chatHandler);"
echo ""
echo "4. Start the server:"
echo "   npm run start"
echo ""
echo "5. Test the auth flow:"
echo "   curl http://localhost:5001/api/test-backend"
echo "   curl http://localhost:5001/api/auth/me (should fail without JWT)"
echo ""

echo "📚 Documentation:"
echo "   - Complete guide: src/auth/README.md"
echo "   - Examples: src/auth/examples.routes.ts"
echo "   - Integration: INTEGRATION_GUIDE.md"
echo "   - Summary: AUTH_IMPLEMENTATION.md"
echo ""

echo "✨ Setup complete! Read the documentation to continue."
echo ""
