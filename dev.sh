#!/bin/bash
# Simple development script for Windows users
echo "Building project..."
npm run build
echo "Serving on http://localhost:5001"
npx serve -l 5001 build