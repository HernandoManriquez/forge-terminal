#!/usr/bin/env python3
"""Package the already validated native binaries and source for release."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', default=str(root.parent / 'deliverables'))
args = parser.parse_args()
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
version = json.loads((root / 'package.json').read_text())['version']
reports = ['validation.md', 'quality-gate.json', 'e2e.json', 'release-smoke.json',
           'editor-e2e.json', 'scroll-e2e.json', 'native-editor-smoke.json',
           'actions-e2e.json', 'api-e2e.json', 'forge-api.png',
           'inspector-e2e.json', 'data-e2e.json', 'snippets-e2e.json',
           'forge-inspector.png', 'forge-data.png', 'forge-snippets.png',
           'forge-terminal.png', 'forge-paper.png', 'forge-git.png',
           'forge-editor.png', 'forge-explorer-menu.png', 'forge-terminal-scroll.png',
           'native-editor-unsaved.png', 'coverage.out']
reports += [f'gate-{i}.log' for i in range(1, len(json.loads((root / 'quality_gate.json').read_text())['checks']) + 1)]
common = ['README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']
common += ['reports/' + name for name in reports]
for check in ['quality-gate.json', 'release-smoke.json', 'native-editor-smoke.json']:
    if json.loads((root / 'reports' / check).read_text())['status'] != 'PASS':
        raise SystemExit('Required release check did not pass: ' + check)
archives = []
for platform, binary, target in [('windows', 'forge-windows-x64.exe', 'forge.exe'),
                                  ('linux', 'forge-linux-x64', 'forge')]:
    archive = out / f'forge-terminal-{version}-{platform}-x64.zip'
    files = {name: root / name for name in common}
    files[target] = root / 'build' / binary
    if platform == 'linux':
        files['install-linux.sh'] = root / 'scripts/install-linux.sh'
        files['forge.png'] = root / 'assets/forge.png'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, source in files.items():
            z.write(source, name)
        z.writestr('LEEME.txt', f'Forge Terminal {version}\n\n'
                   'Cierra la versión anterior, extrae este ZIP completo y abre '
                   + target + '.\nLee README.md para requisitos y uso.\n\n'
                   'Una terminal nueva en la carpeta de lanzamiento.\n'
                   'Pestañas guardadas suspendidas; botones 1 / 2 / 3 para las vistas.\n'
                   'Pulsa la rama Git para ver cambios, diferencias y otras ramas.\n\n'
                   'Clic selecciona archivos; clic derecho > Editar abre otra ventana.\n'
                   'Botón Ocultos para .gitignore, .ai y otros nombres con punto.\n'
                   'Barra de comandos: prepara texto; Insertar o Ejecutar lo envían.\n'
                   'Última fila completa; scroll sigue la salida y pausa al subir.\n\n'
                   'Ctrl+Shift+P: paleta; preferencias: atajos configurables.\n'
                   'Ctrl+Alt+C: API; Ctrl+Alt+P: puertos/procesos.\n'
                   'Ctrl+Alt+J: JSON/YAML/XML; Ctrl+Alt+S: snippets.\n'
                   'Las plantillas se revisan antes de Ejecutar; no se ejecutan al abrir.\n\n'
                   'Editor nativo Linux probado bajo Xvfb. Windows compilado,\n'
                   'pendiente de ejecución nativa. Detalles en reports/validation.md.\n')
        z.writestr('SHA256SUMS.txt', ''.join(hashlib.sha256(source.read_bytes()).hexdigest() + '  ' + name + '\n' for name, source in files.items()))
    archives.append(archive)
archive = out / f'forge-terminal-{version}-source.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(root.rglob('*')):
        rel = p.relative_to(root)
        if not p.is_file() or any(part in {'node_modules', 'build', '.git', '__pycache__', 'releases'} for part in rel.parts):
            continue
        if rel.parts[0] == 'reports' and p.name not in reports:
            continue
        z.write(p, 'forge-terminal/' + rel.as_posix())
archives.append(archive)
for archive in archives:
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise SystemExit('Corrupted archive: ' + str(archive))
    print(archive.name, archive.stat().st_size, hashlib.sha256(archive.read_bytes()).hexdigest())
