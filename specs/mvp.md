# Forge Terminal 0.3 — alcance

Aplicación de escritorio ejecutable para Windows x64 y Linux x64.

## Criterios funcionales

1. Shell interactivo real: Bash/Zsh/Fish/Sh en Linux; PowerShell 7, Windows
   PowerShell, CMD y WSL disponibles en Windows.
2. PTY/ConPTY, ANSI, UTF-8, Ctrl+C, Tab y redimensionamiento.
3. Pestañas independientes de la vista: 1 panel por defecto, botones 1/2/3,
   filas o columnas y separadores ajustables. Hasta ocho shells en ejecución.
   Las sesiones iniciadas siguen funcionando en segundo plano.
4. Barra de comandos con completado de comandos en PATH, rutas, argumentos conocidos,
   favoritos y, opcionalmente, historial. Elegir una sugerencia no la ejecuta.
5. Explorador, favoritos, memoria del backend y visor Git al pulsar la rama:
   cambios preparados/sin preparar/nuevos, diferencias por archivo y ramas
   locales/remotas conocidas. Solo lectura, salida acotada, sin acceso a remotos.
6. Paleta de comandos, búsqueda en salida, enfoque, exportación local.
7. Tres temas, fuente configurable y scrollback limitado de 500 a 10.000 líneas.
8. Persistencia de configuración, pestañas, cwd y perfiles. Al iniciar siempre
   hay una sesión nueva en el cwd del proceso lanzador. Las guardadas, incluidas
   las ocho de v1, se restauran suspendidas. Cada una inicia un shell al abrirse;
   nunca reejecuta comandos ni afirma recuperar procesos anteriores.
9. Confirmación de pegado con saltos de línea y de cierre/reinicio de panel.
10. Interfaz y recursos incorporados al ejecutable; sin CDN, nube ni telemetría propia.

11. Explorador con selección sin inserción automática, menú contextual accesible
    y botón persistente para mostrar archivos/carpetas ocultos.
12. Editor simple en ventana independiente: navegación, nuevo, abrir, guardar,
    guardar como, recargar y cerrar. Texto UTF-8 <=2 MiB; BOM y LF/CRLF conservados.
13. Cambios sin guardar protegidos en navegación y cierre, incluido cierre nativo.
    Revisión optimista de contenido ante cambios externos; Guardar como no pisa
    archivos existentes. Sin IDE, resaltado ni ejecución desde el editor.
14. Última fila completa; seguimiento del final mientras se recibe salida,
    pausa al subir al historial, conservación de línea al cambiar altura y
    reanudación al volver al final. Verificar fuentes y DPR fraccional.

## Límites

- Ventana gráfica dependiente de WebKitGTK o WebView2 del sistema.
- Sesiones SSH se ejecutan usando el comando `ssh` del shell; no hay gestor de
  credenciales, sincronización de sesiones, SFTP ni conexiones automáticas.
- Completado especializado para Git, Docker, Podman, systemctl, npm y Go; no es
  un motor de análisis completo de todos los lenguajes de shell.
- Directorio actual por `/proc` en Linux y OSC 7 en PowerShell. CMD conserva la
  carpeta inicial en contexto; WSL conserva completado nativo dentro del shell.
- No terminal móvil, plugins externos, IA en nube ni multiplexer remoto persistente.

## Aceptación

Quality gate reproducible con pruebas unitarias, integración PTY, control de
origen/autenticación y E2E. Entregar binarios y código fuente; documentar
separadamente compilación, pruebas reales y plataformas pendientes de validación.
