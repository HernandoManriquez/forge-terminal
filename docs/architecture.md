# Arquitectura

## Flujo de una sesión

1. El ejecutable abre un puerto aleatorio en `127.0.0.1`.
2. La ventana recibe una URL con clave de 256 bits. Se canjea por cookie de sesión
   HttpOnly con nombre por puerto y se redirige a una URL limpia, con Referrer-Policy no-referrer.
3. La interfaz abre un WebSocket autenticado para cada panel activado.
4. El servidor detecta un perfil permitido y crea PTY o ConPTY con tamaño y cwd.
5. La salida viaja en frames binarios. xterm interpreta el stream y confirma bytes
   después de escribirlos. La entrada viaja como JSON y conserva control de shell.
6. Al cerrar el socket se libera el cupo y se cierra PTY/shell. ConPTY continúa
   drenándose durante el cierre para evitar bloquear ClosePseudoConsole.

## Límites de recursos

Una vista web para todos los paneles de terminal; editor en proceso y ventana propios. Ocho shells simultáneos como máximo en UI y backend. Tres paneles visibles.
Las pestañas restauradas no crean shell ni xterm hasta mostrarse.
Frames de 16 KiB; ventana de 64 KiB y hasta un frame adicional en tránsito, más
cuatro frames de cola. Scrollback finito, sin persistencia automática de salida.
Comandos de PATH indexados una vez; completado con debounce y máximo 30 resultados.
Lectura del explorador limitada a 1.001 entradas y 200 elementos presentados.
Resumen Git con contexto de 1,2 s. Detalle bajo demanda con contexto de 4 s
y salida limitada a 256 KiB por comando, con indicador de truncado. No ejecuta
diffs externos, textconv, fetch ni cambios de rama. Usa pathspec literal y
validación contra el estado actual para el archivo seleccionado.

## Persistencia

`settings.json` se escribe por archivo temporal y rename bajo mutex, con
permisos privados donde el sistema los soporte. Se serializa únicamente estado
de configuración v2: pestañas, árbol visible, tamaños, perfiles, cwd, favoritos y
preferencias. Migra árboles v1 a pestañas. En cada inicio agrega una sesión
nueva con el cwd capturado por el backend y reinicia la vista en un panel.
Los IDs efímeros del servidor no se restauran. Abrir un workspace nuevo crea
procesos nuevos; nunca reproduce los comandos guardados.

## Fronteras

No se recibe una cadena libre para elegir un ejecutable vía HTTP: solo IDs de
shells detectados en PATH. El usuario conserva la capacidad completa del shell.
El endpoint de completado no utiliza `sh -c`, `Invoke-Expression` ni equivalentes.
Los nombres de archivo se escapan según shell antes de ofrecer su inserción.
La interfaz usa textContent o escape HTML para rutas, títulos y datos de procesos.

La clave local no protege frente a otros procesos ejecutados bajo la misma
cuenta que puedan leer la memoria o las cookies del usuario. No se pretende
crear un límite de seguridad entre aplicaciones de una misma sesión de usuario.

## Editor simple

`--editor RUTA` sirve `editor.html` sin crear terminales. La instancia principal
lanza el mismo ejecutable con argumentos separados, sin shell, hasta cuatro
editores simultáneos. Cada proceso tiene puerto y cookie propios; los nombres de
cookie incluyen el puerto porque HTTP no aísla cookies del mismo host por puerto.
En `--serve`, la misma API devuelve una URL para abrir una ventana del navegador.

Lectura limitada a 2 MiB de texto UTF-8 regular. Se normaliza LF en el textarea y
se conservan BOM y formato LF/CRLF al escribir. La revisión SHA-256 incluye ruta
resuelta y bytes originales. Guardar vuelve a comprobarla, prepara un temporal
en el directorio destino, sincroniza, revalida y reemplaza el archivo; conserva
el enlace simbólico y los permisos básicos. Es control optimista, sin bloqueo
frente a escrituras de otros programas ni garantía de atomicidad en todos los SO.
Guardar como usa creación exclusiva para no sobrescribir un destino existente.

GTK `delete-event` y Windows `WM_CLOSE` consultan el diálogo de cambios sin guardar
antes de terminar la ventana. La terminación del proceso por el SO queda fuera
de esa protección. El navegador utiliza además `beforeunload`.

## Geometría y seguimiento de salida

FitAddon mide una superficie interna sin padding, dentro del margen de cada panel.
ResizeObserver agrupa ajustes en animation frames. Una fila completa siempre cabe
dentro de esa superficie; queda margen inferior fuera de la medida del terminal.

Cada panel conserva si el usuario sigue el final o lee el historial. Los eventos
de entrada actualizan ese estado; el crecimiento de la salida no se interpreta
como acción de scroll. Se sincroniza la posición física con la línea de xterm
para evitar la carrera entre wheel, salida y el siguiente ajuste. Durante cambios
de geometría se ignoran clamps de scroll del navegador. Si solo cambia la altura,
se restaura la línea superior del historial. Tras renderizar cada frame de salida,
se baja al final únicamente si ese panel continúa en modo de seguimiento.

## Fuentes primarias

- [Go bindings de webview](https://github.com/webview/webview_go).
- [Motor webview y dependencias](https://github.com/webview/webview).
- [PTY de Linux](https://github.com/creack/pty).
- [ConPTY para Go](https://github.com/UserExistsError/conpty).
- [Control de flujo en xterm.js](https://xtermjs.org/docs/guides/flowcontrol/).
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

Los enlaces describen las tecnologías utilizadas; la evidencia específica de
Forge está en las pruebas y reportes incluidos.
