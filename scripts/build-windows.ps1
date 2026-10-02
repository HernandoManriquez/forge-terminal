$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
& npm.cmd run build:ui
if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
$env:CGO_ENABLED = '1'
if (-not $env:CC) { $env:CC = 'gcc' }
if (-not $env:CXX) { $env:CXX = 'g++' }
New-Item -ItemType Directory -Force build | Out-Null
& go build -buildvcs=false -trimpath '-ldflags=-s -w -H windowsgui' -o build/forge.exe ./src/cmd/forge
if ($LASTEXITCODE -ne 0) { throw 'Go build failed; check Go and MSYS2 GCC/G++ in PATH' }
Write-Host 'Listo: build/forge.exe'
