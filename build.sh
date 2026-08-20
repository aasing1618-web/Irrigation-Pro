#!/usr/bin/env bash
set -e

echo "=== Building Backend ==="
cd backend
npm install
npm run build
cd ..

echo "=== Building App ==="
cd app
npm install
npm run build
cd ..

echo "=== Building Admin ==="
cd admin
npm install
npm run build
cd ..

echo "=== Build Complete ==="
