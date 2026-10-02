#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
forge_binary=./forge
if [[ ! -f "$forge_binary" ]]; then printf '%s\n' 'Ejecuta este script desde el paquete Linux, junto al binario forge.' >&2; exit 1; fi
forge_data="${XDG_DATA_HOME:-$HOME/.local/share}"
mkdir -p "$HOME/.local/bin" "$forge_data/applications" "$forge_data/icons/hicolor/256x256/apps"
install -m755 "$forge_binary" "$HOME/.local/bin/forge"
install -m644 forge.png "$forge_data/icons/hicolor/256x256/apps/forge-terminal.png"
python3 - "$HOME/.local/bin/forge" "$forge_data/applications/forge-terminal.desktop" <<'PY'
import pathlib, sys
binary=sys.argv[1].replace('\\','\\\\').replace('"','\\"').replace('`','\\`').replace('$','\\$').replace('%','%%')
pathlib.Path(sys.argv[2]).write_text('[Desktop Entry]\nType=Application\nName=Forge Terminal\nComment=Terminal con paneles y espacios de trabajo\nExec="'+binary+'"\nIcon=forge-terminal\nTerminal=false\nCategories=System;TerminalEmulator;\nStartupWMClass=forge\n')
PY
printf '%s\n' 'Instalado. Abre Forge Terminal desde el menú de aplicaciones.'
