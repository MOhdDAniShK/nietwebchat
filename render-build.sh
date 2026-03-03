#!/usr/bin/env bash
set -e

echo "==> Installing client dependencies (including dev)..."
cd client
npm install --include=dev

echo "==> Building client..."
npx vite build

echo "==> Installing server dependencies..."
cd ../server
npm install --production

echo "==> Build complete!"
