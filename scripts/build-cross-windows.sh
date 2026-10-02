#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then npm ci; fi
npm run build:ui
mkdir -p build
export CGO_ENABLED=1 GOOS=windows GOARCH=amd64
export CC="${CC:-x86_64-w64-mingw32-gcc-posix}"
export CXX="${CXX:-x86_64-w64-mingw32-g++-posix}"
go build -buildvcs=false -trimpath -ldflags='-s -w -H windowsgui' -o build/forge-windows-x64.exe ./src/cmd/forge
printf '%s\n' 'Listo: build/forge-windows-x64.exe'
