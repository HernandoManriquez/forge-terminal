# Validación de Forge Terminal 0.3.0

Fecha: 2026-10-02. Compilador: Go 1.27.1. Plataforma de construcción: Linux x64.
Quality gate completado: `2026-10-02T22:18:29.761341+00:00`.

## Artefactos

| Binario | Bytes | Tamaño |
|---|---:|---:|
| `forge-linux-x64` | 7,882,496 | 7.52 MiB |
| `forge-windows-x64.exe` | 8,378,880 | 7.99 MiB |

Linux: ELF x86-64 enlazado con GTK 3 / WebKitGTK 4.1, sin RPATH ni RUNPATH.
Windows: PE32+ x86-64, subsistema GUI, icono y recurso de versión 0.3.0.
Importaciones de DLL del sistema, incluido COMCTL32 para proteger el cierre del
editor; usa WebView2 instalado en el equipo.

## Resultado

- **PASS:** 16 pruebas Go con detector de carreras. Autenticación y origen,
  configuración, completado, exportación, carpetas, cwd inicial, PTY real, Git
  y editor. Cobertura combinada de `src/internal/...`: 69,2 %.
- **PASS:** PTY con Unicode, resize a 101 × 31, más de 180 KB de salida y cierre.
- **PASS:** Git con estados preparados/sin preparar, nuevos, nombres con espacios
  y Unicode, pathspec literal, renombrados, eliminados, binarios, truncado,
  repositorio sin commits, HEAD separado y árbol limpio.
- **PASS:** editor backend con BOM, LF/CRLF, archivo vacío, conflictos de contenido,
  enlaces simbólicos, creación exclusiva, rechazo de binarios/UTF-16/límites,
  endpoints autenticados y dos procesos usando un mismo almacén de cookies.
- **PASS:** análisis estático `go vet` y 7 pruebas de modelo JavaScript.
- **PASS:** 17 recorridos E2E de terminal en Chromium con PTY Linux real:
  migración, cwd, sesiones suspendidas/en segundo plano, vistas 1/2/3,
  separadores, preferencias, búsqueda, favoritos, exportación, pegado,
  Git, reinicio, cierre y cambio de espacio.
- **PASS:** 12 recorridos E2E del editor: selección sin inserción, ocultos,
  ventana independiente, preferencias heredadas, bytes BOM/CRLF, navegación,
  guardar/descartar/cancelar, conflictos externos, Save As sin sobreescritura,
  carpetas, binarios y documento nuevo. Sin excepciones de interfaz.
- **PASS:** 4 recorridos E2E de geometría y scroll con DPR 1,25, fuentes de
  12/14/18/22 px, varias alturas y paneles. La última fila cabe completa con
  margen inferior; la salida sigue el final, el historial conserva su primera
  línea al cambiar altura y el seguimiento se reanuda al volver al final.
- **PASS:** compilaciones de producción Linux/Windows y compilación de las
  pruebas Windows de servidor y ConPTY. Las pruebas Windows **no se ejecutaron**.
- **PASS:** binario Linux `--serve`, versión 0.3.0, recursos embebidos, cwd con
  espacios, archivo oculto en editor independiente y cookies simultáneas.
- **PASS:** ventana nativa WebKitGTK bajo Xvfb. Edición real mediante teclado;
  solicitud WM_DELETE_WINDOW con cambios pendientes muestra el diálogo y
  conserva el proceso; Escape cancela, Ctrl+S escribe los bytes esperados y
  cerrar sin cambios termina correctamente. Captura revisada visualmente.

Evidencia: `quality-gate.json`, `e2e.json`, `editor-e2e.json`, `scroll-e2e.json`,
`native-editor-smoke.json`, `release-smoke.json`, ocho logs y capturas.
Las capturas y los datos proceden exclusivamente de proyectos temporales de prueba.

## Diagnóstico del scroll

FitAddon contaba padding dentro de la altura disponible. Ahora mide una superficie
interior sin padding. Además, durante salida continua el viewport podía actualizar
scrollTop antes de que xterm actualizara su línea interna. Se sincroniza la línea
con la posición física tras entrada del usuario; los eventos generados por salida
no cambian el estado de seguimiento. La prueba espera la alineación de la rueda a
filas completas y comprueba tanto píxeles como el texto de la primera fila, sin
ampliar la tolerancia de la prueba. Se conserva el stream PTY sin filtrarlo.

Readline puede redibujar un prompt largo tras SIGWINCH; el escenario de retención
usa un prompt corto. Se prueba por separado la fila completa con un prompt largo.

## Límites

Windows fue compilado de forma cruzada, sin host Windows para ejecutarlo.
La GUI Linux se comprobó bajo Xvfb con renderizado por software, no en un escritorio
físico. La excepción de sandbox de WebKit necesaria para ejecutar la prueba como
root pertenece al entorno de prueba; Forge no la configura. Los enlaces temporales
a dependencias extraídas se eliminaron al terminar. Pendientes: escritorios reales
Windows/Fedora/Ubuntu, escalado del sistema Windows y consumo de RAM/CPU nativa.

El indicador de memoria mide únicamente heap Go; excluye WebView, shells y programas.
El guardado del editor detecta conflictos de forma optimista, sin bloqueo frente
a otros programas ni garantía de atomicidad universal del reemplazo de archivos.

## SHA-256

- `b73f94572bf472420d8e7811936bd692b12da972b07432486fb751dce9aa489f`  `forge-linux-x64`
- `40ef64799f4f996875b4fe14d5fd23efead5fec9ec5b390557667d0d6007ed9e`  `forge-windows-x64.exe`
