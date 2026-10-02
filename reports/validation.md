# Validación de Forge Terminal 0.2.0

Fecha: 2026-10-02. Compilador: Go 1.27.1. Plataforma de construcción: Linux x64.

## Artefactos

| Binario | Bytes | Tamaño |
|---|---:|---:|
| `forge-linux-x64` | 7,800,384 | 7.44 MiB |
| `forge-windows-x64.exe` | 8,296,448 | 7.91 MiB |

Linux: ELF x86-64 enlazado con GTK 3 / WebKitGTK 4.1, sin RPATH ni RUNPATH.
Windows: PE32+ x86-64, subsistema GUI, icono y recurso de versión 0.2.0.
Importaciones DLL estáticas de Windows; usa WebView2 instalado en el equipo.

## Resultado

- **PASS:** 11 pruebas Go con detector de carreras: autenticación y origen,
  configuración, completado, exportación, directorios, cwd de lanzamiento,
  PTY real y visor Git.
- **PASS:** PTY con Unicode, resize a 101 × 31, más de 180 KB de salida y cierre.
- **PASS:** Git con archivos preparados/sin preparar, nuevos, nombres con espacios
  y Unicode, pathspec literal, renombrados, eliminados, binarios, truncado,
  repositorio sin commits, HEAD separado y árbol limpio.
- **PASS:** análisis estático `go vet` y 7 pruebas de modelo JavaScript.
- **PASS:** 17 recorridos E2E en Chromium con backend Linux y PTY real.
  Incluyen migración de ocho pestañas v1 más una sesión nueva, cwd correcto,
  pestañas suspendidas, salida/proceso en segundo plano, vistas 1/2/3,
  separadores, preferencias, búsqueda, favoritos, exportación, pegado,
  visor Git, reinicio, cierre y cambio de espacio.
- **PASS:** compilaciones de producción Linux/Windows y compilación de las
  pruebas Windows de ConPTY y servidor. Las pruebas Windows **no se ejecutaron**.
- **PASS:** arranque del binario Linux `--serve`, bootstrap autenticado, recursos
  embebidos 0.2.0 y directorio de lanzamiento con espacios.

Evidencia: `quality-gate.json`, `e2e.json`, `release-smoke.json`, logs y capturas.
Las capturas utilizan comandos reales en repositorios temporales de prueba.
La prueba de cambios rápidos de geometría usa un prompt corto para evitar que
Readline borre líneas refluidas al redibujar un prompt largo. No se modifica el
stream PTY; la prueba de segundo plano conserva el prompt habitual.

## Límites

No se validaron ventanas nativas WebKitGTK ni WebView2 en esta entrega.
La interfaz se probó en Chromium y el ejecutable Linux en modo local `--serve`.
Windows fue compilado de forma cruzada, sin host Windows para ejecutarlo.
Pendiente: smoke tests en Windows y escritorios Linux reales (Fedora/Ubuntu).

No se midió RAM total ni CPU nativa. El indicador de memoria mide únicamente
el heap Go; excluye WebView, shells y programas ejecutados. Las pestañas
restauradas sin abrir no inician un shell ni un buffer de xterm.

## SHA-256

- `851baaf08f9ad7adea53b23d521c15f29a0ef3dfe9a3ba7893accceb5f554260`  `forge-linux-x64`
- `6237dd6aa2b69955887bbd27036116346d6d10ce93b0d4219b5fb77d564f1bb3`  `forge-windows-x64.exe`
