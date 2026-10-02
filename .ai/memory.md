# Decisiones y continuidad

## Arquitectura

Go 1.26+ y webview/webview_go; interfaz JavaScript sin framework con xterm.js.
Motor del sistema: WebKitGTK 4.1 en Linux, WebView2 en Windows.
PTY Linux con creack/pty; Windows con UserExistsError/conpty.

El proceso escucha solo en 127.0.0.1 con puerto efímero. Una clave aleatoria de
256 bits autoriza la ventana; cookie HttpOnly/SameSite Strict, Host y Origin
exactos, WebSocket autenticado y CSP. No API accesible a la LAN por defecto.

Flujo: frames de hasta 16 KiB, ventana de 64 KiB sin confirmar más una cola
acotada de cuatro frames. El cliente confirma bytes tras renderizar en xterm.
Al cerrar, se drena ConPTY mientras termina para evitar bloquear su cierre.

La configuración no incluye credenciales ni captura teclas. Historial del
compositor deshabilitado por defecto. La exportación es un acto explícito y puede
contener datos de la terminal. Los favoritos y la configuración son texto local.

## Parches locales de WebView

Ver `third_party/README.md`: WebKitGTK 4.1, mayúsculas de eventtoken.h para
cross-compilation y retorno nil cuando no puede crearse una ventana.

## Validación

Pruebas Linux del motor y pruebas E2E con Chromium y PTY real. Los binarios Linux
y Windows x64 se compilan; una compilación no equivale a probar la ventana nativa.
El entorno de creación bloquea los sockets de Xvfb y no tiene Windows.
Pendiente: smoke tests de escritorio Windows, Fedora y Ubuntu con sesión gráfica.

## Completado

Favoritos preceden a sugerencias genéricas. El test de argumentos usa `git br`
para comprobar `git branch` sin colisionar con el favorito `git status --short`.
La prueba separada de favoritos comprueba que seleccionarlos no ejecuta comandos.

## Posibles siguientes entregas

Integración shell completa para reconocer prompt/comando en ejecución, perfiles
editables con argumentos/env, ventanas separadas, conexiones SSH guardables,
firma de código Windows y empaquetado DEB/RPM/AppImage validado en matrices reales.
