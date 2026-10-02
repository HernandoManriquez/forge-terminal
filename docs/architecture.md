# Arquitectura

## Flujo de una sesión

1. El ejecutable abre un puerto aleatorio en `127.0.0.1`.
2. La ventana recibe una URL con clave de 256 bits. Se canjea por cookie de sesión
   HttpOnly y se redirige a una URL limpia, con Referrer-Policy no-referrer.
3. La interfaz abre un WebSocket autenticado para cada panel activado.
4. El servidor detecta un perfil permitido y crea PTY o ConPTY con tamaño y cwd.
5. La salida viaja en frames binarios. xterm interpreta el stream y confirma bytes
   después de escribirlos. La entrada viaja como JSON y conserva control de shell.
6. Al cerrar el socket se libera el cupo y se cierra PTY/shell. ConPTY continúa
   drenándose durante el cierre para evitar bloquear ClosePseudoConsole.

## Límites de recursos

Una vista web para todos los paneles. Ocho sesiones como máximo en UI y backend.
Frames de 16 KiB; ventana de 64 KiB y hasta un frame adicional en tránsito, más
cuatro frames de cola. Scrollback finito, sin persistencia automática de salida.
Comandos de PATH indexados una vez; completado con debounce y máximo 30 resultados.
Lectura del explorador limitada a 1.001 entradas y 200 elementos presentados.
Consultas Git con contexto de 1,2 s y salida limitada a 64 KiB.

## Persistencia

`settings.json` se escribe por archivo temporal y rename bajo mutex, con
permisos privados donde el sistema los soporte. Se serializa únicamente estado
de configuración: árbol, tamaños, perfiles, cwd, favoritos y preferencias.
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

## Fuentes primarias

- [Go bindings de webview](https://github.com/webview/webview_go).
- [Motor webview y dependencias](https://github.com/webview/webview).
- [PTY de Linux](https://github.com/creack/pty).
- [ConPTY para Go](https://github.com/UserExistsError/conpty).
- [Control de flujo en xterm.js](https://xtermjs.org/docs/guides/flowcontrol/).
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

Los enlaces describen las tecnologías utilizadas; la evidencia específica de
Forge está en las pruebas y reportes incluidos.
