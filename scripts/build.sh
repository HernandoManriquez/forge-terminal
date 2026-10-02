#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then npm ci; fi
npm run build:ui
mkdir -p build
go build -buildvcs=false -trimpath -ldflags='-s -w' -o build/forge-linux-x64 ./src/cmd/forge
printf '%s\n' 'Listo: build/forge-linux-x64'
