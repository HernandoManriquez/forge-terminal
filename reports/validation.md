# Validación de Forge Terminal 0.1.0

Fecha: 2026-10-01. Compilador: Go 1.27.1. Plataforma de construcción: Linux x64.

## Artefactos

| Binario | Bytes | Tamaño |
|---|---:|---:|
| `forge-linux-x64` | 7,763,520 | 7.40 MiB |
| `forge-windows-x64.exe` | 8,252,928 | 7.87 MiB |

Linux: ELF x86-64, bibliotecas GTK 3 / WebKitGTK 4.1 del sistema. Sin RPATH ni
rutas del entorno de construcción incorporadas como rutas de búsqueda.
Windows: PE32+ x86-64, subsistema GUI, icono, manifiesto y versión incorporados.
Sus importaciones DLL estáticas son bibliotecas de Windows; WebView2 se carga
como motor instalado en el equipo.

## Resultado

- **PASS:** 8 pruebas Go de autenticación, origen, configuración, completado,
  exportación, directorios y PTY real. Incluyen detector de carreras.
- **PASS:** integración PTY con Unicode, cambio a 101 × 31, más de 180 KB de salida
  y liberación de la sesión tras cerrar el socket.
- **PASS:** análisis estático con `go vet`.
- **PASS:** 5 pruebas JavaScript del modelo de paneles y la entrada.
- **PASS:** 13 recorridos E2E en Chromium sobre un backend Linux y PTY real.
- **PASS:** compilaciones de producción Linux y Windows, y compilación del test
  de ConPTY Windows. El test Windows fue compilado, **no ejecutado**.
- El arranque del ejecutable Linux con `--serve` se registra por separado en
  `release-smoke.json`; esta comprobación no abre una ventana nativa.

Evidencia: `quality-gate.json`, `e2e.json`, logs del gate y capturas. Las capturas
muestran comandos ejecutados realmente en un proyecto temporal de prueba.

## Pendiente y límites de las medidas

La **ventana nativa de Linux no se pudo probar**: Xvfb no pudo abrir sus sockets
en el entorno de ejecución. Se verificó la interfaz en Chromium, no en una
ventana WebKitGTK. **Windows tampoco pudo ejecutarse** al no haber host Windows.
No se afirma validación nativa en Fedora, Ubuntu gráfico o Windows.

No se midió RAM total ni CPU de las aplicaciones nativas. El indicador de la
interfaz informa el heap Go, excluyendo WebView, shell y programas. Un binario
pequeño no implica RAM total equivalente. No se entregan cifras de rendimiento
nativo estimadas como si fueran mediciones.

## SHA-256 de los ejecutables

- `f82b09968bd18230d69ba3bcd5a872275b4fdbaf53008e6ac07e40df2d58e59c`  `forge-linux-x64`
- `d4c8bd3893633d521e61448f0edcc494e43adba5d2322ab1a34c01ce7ad76b0f`  `forge-windows-x64.exe`
