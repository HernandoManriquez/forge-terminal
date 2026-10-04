# Validación de Forge Terminal 0.4.0

Fecha: 2026-10-03. Compilador: Go 1.27.1. Construcción: Linux x64.
Incluye las seis herramientas y conserva las mejoras de terminal, Git y editor.
El respaldo independiente 0.4.0-preview.1 anterior al inspector se conserva.

| Binario | Bytes | Tamaño |
|---|---:|---:|
| `forge-linux-x64` | 8,943,264 | 8.53 MiB |
| `forge-windows-x64.exe` | 9,405,440 | 8.97 MiB |

## Resultado

- Gate **PASS**, 13 etapas. Go con detector de carreras, go vet, pruebas JS,
  bundle local de producción, build headless y recorridos E2E completos.
- **22 pruebas Go Linux**: auth/Host/Origin, persistencia, filesystem, PTY real,
  Git, editor, HTTP y procesos/puertos. Cobertura servidor: 66,2 % del ámbito
  interno instrumentado; ConPTY no se ejecuta en Linux.
- **24 pruebas JS**: 7 modelo, 4 acciones/atajos, 5 HTTP/cURL, 2 inspector,
  3 JSON/YAML y 3 snippets.
- **51 recorridos E2E PASS**: 17 terminal, 12 editor, 4 filas/scroll,
  3 acciones/atajos, 4 API Tester, 3 inspector, 4 datos y 4 snippets.
- Terminal: pestañas restauradas suspendidas, nueva sesión en cwd de lanzamiento,
  1/2/3 vistas, sesiones en segundo plano, UTF-8, resize, autocompletado y cierre.
- Geometría: última fila completa, fuentes/alturas/divisiones y DPR 1,25; sigue
  salida, pausa al leer historial y conserva la línea al cambiar altura.
- Editor: archivos reales, BOM/CRLF, guardar como sin sobrescritura, conflictos,
  dotfiles, navegación y protección de cambios sin guardar.
- HTTP: POST/query/JSON/Bearer/Unicode reales, headers/raw, cURL real en PTY,
  plantillas sin secretos, repetición explícita y cancelación.
- Inspector: puerto TCP/UDP asociado al PID real, URL al API Tester sin envío,
  filtros/preferencias y terminación confirmada solo de un proceso hijo de prueba.
- Datos: JSON/YAML/XML, precisión numérica, contenido mixto/xml:space,
  errores sin perder el resultado, archivos reales y selección real de xterm.
- Snippets: parámetros/defaults, vista previa, ejecución explícita en PTY,
  favoritos/CRUD/duplicar, atajos persistentes e importación sin autoejecución.
- Binario Linux nativo: --serve con cwd con espacios, UI embebida, versión 0.4,
  editor independiente y autenticación simultánea. Ver release-smoke.json.
- Editor WebKitGTK bajo Xvfb: cierre con cambios, Cancelar, Ctrl+S con bytes
  exactos y cierre limpio. Ver native-editor-smoke.json y captura.
- Linux: ELF x64 dinámico con GTK3/WebKitGTK4.1, sin RPATH/RUNPATH.
- Windows: PE32+ GUI x64, recurso de versión 0.4.0, DLL de sistema. Binario y
  pruebas servidor/ConPTY compilados. **No se ejecutaron en Windows.**

## Límites de validación y funcionamiento

Windows, PowerShell/CMD/ConPTY y su inspector requieren smoke de ejecución nativa.
Los comandos cURL de Windows se validaron por generación/decodificación, no por
su ejecución. La prueba gráfica Linux usa Xvfb, no un escritorio físico;
Fedora/Ubuntu de escritorio siguen pendientes. No se midió RAM total del conjunto.

Inspector: actualización manual, límites de 5.000 procesos/10.000 puertos y
consulta con contexto de 8 s. Datos pueden faltar por permisos. CPU necesita
una segunda muestra. Linux requiere kernel 5.3+ para pidfd y envía SIGTERM;
Windows finaliza inmediatamente con TerminateProcess y rechaza procesos críticos
identificados o cuya clasificación no puede comprobarse. La confirmación no
elimina los efectos de terminar un programa; la interfaz los explica.

HTTP: TLS estándar, 30 s, cuerpo 256 KiB, respuesta 2 MiB, sin redirects ni
cookies automáticas. Nombre/ruta URL y plantillas de snippets son texto local;
no deben contener secretos. Valores HTTP/parametrizados y respuestas son volátiles.
La ejecución explícita puede quedar en el historial propio del shell.

Datos: máximo 512 KiB/128 niveles. Conversiones rechazan estructuras o números
que perderían significado; el mapeo XML y sus restricciones están en README.
Guardar como exige un archivo nuevo. Snippets: máximo 100 y 8.192 caracteres.
Sin firma digital, instaladores nativos ni validación en otras arquitecturas.

## SHA-256 de los binarios

- `ae7d9a4b1a7828528fb4c400adf6263431acba3e2ea7fed0e91b2ca50db04d7b` — `forge-linux-x64`
- `c3840d847018256bb61c9b7bac9fa006177f59d5f22667479c159a0da7f17ebe` — `forge-windows-x64.exe`
