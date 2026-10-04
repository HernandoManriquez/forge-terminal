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

## Acciones, herramientas y HTTP (0.4)

`actions/registry.js` es la única resolución de atajos y acciones; `catalog.js`
comparte descriptores entre terminal y editor. `command-palette/` consulta el
registro en cada apertura. `shortcuts/` gestiona persistencia y conflictos por
contexto. Los favoritos se registran dinámicamente con sus IDs persistentes.
`tools/shared.js` reutiliza el modal y ofrece un store de actualizaciones parciales.

`tools.json` se escribe de forma atómica con mutex, límite 1 MiB y permisos 0600
cuando el sistema los soporta. `api_tester.go` valida el HTTP y elimina valores
sensibles de los guardados también en el backend. No se guardan respuestas,
auth ni valores de variables. Nombre y ruta URL pertenecen a la plantilla;
no deben contener secretos. HTTP: 30 s, cuatro solicitudes, cuerpo 256 KiB,
respuesta 2 MiB, TLS estándar y sin seguimiento automático de redirects.
La cancelación cierra la solicitud de Go mediante su contexto. El panel aborta
al cerrarse. La ejecución cURL reutiliza el PTY y la confirmación de multilínea,
sin registrar el comando en el historial de Forge.

Archivos principales: `src/ui/app/{actions,shortcuts,command-palette,api-tester,tools}/`,
`main.js`, `editor.js`, `src/internal/server/{tools_state,api_tester}.go`.

## Inspector de sistema

`inspector.go` consulta gopsutil/v4 4.26.9. Usa APIs del sistema, no analiza salida
localizada de comandos de shell. El backend fija /proc, /sys y /etc reales en el
contexto Linux y consulta manualmente con timeout y exclusión entre snapshots.
Limita procesos/puertos y calcula CPU por delta; la UI pagina 75 filas y persiste
solo filtros/orden. Campos inaccesibles son opcionales. El detalle consulta CWD,
argumentos y una identidad de creación para verificar cualquier terminación.

Linux retiene pidfd y compara starttime antes de enviar SIGTERM. Windows retiene
un handle con permisos mínimos, compara FILETIME y consulta IsProcessCritical
antes de TerminateProcess. El servidor exige confirmación y protege Forge/PID1.
Una carrera de reutilización de PID no cambia el objeto al que apunta el handle.
Navegador: URL HTTP/HTTPS validada y xdg-open/ShellExecute con argumentos separados.
El API Tester recibe una URL inicial sin enviar automáticamente. Sin refresco periódico.

## Datos y snippets

`data-tools/` analiza JSON sin convertir sus tokens numéricos al formatear. YAML2
2.9.1 aporta el AST y localización de errores; se limitan aliases, profundidad y
conversiones. XML usa DOMParser del motor, rechaza DTD/entidades y mantiene texto
mixto y xml:space al formatear. La conversión XML tiene un mapeo documentado con
rechazo explícito cuando no es representable. Archivos usan las APIs del editor;
Guardar como exige creación exclusiva. Ningún contenido se persiste en tools.json.

`snippets/` migra favoritos y registra acciones snippet.ID que abren preparación.
Los parámetros se sustituyen literalmente, no se evalúan; el límite de comando
coincide con el PTY. Solo Ejecutar llama al mecanismo existente de envío, incluida
la revisión multilínea. Copiar/insertar/seleccionar/importar nunca envían Enter.
JSON portable incluye plantillas, no valores efímeros ni asignaciones de atajos.
El estado se escribe por patches bajo el mutex compartido con las otras herramientas.

Archivos añadidos: `src/internal/server/inspector{,_linux,_windows}.go`,
`src/ui/app/{port-process-inspector,data-tools,snippets}/` y sus pruebas Go/JS/E2E.

