# Forge Terminal 0.2 — alcance

Aplicación de escritorio ejecutable para Windows x64 y Linux x64.

## Criterios funcionales

1. Shell interactivo real: Bash/Zsh/Fish/Sh en Linux; PowerShell 7, Windows
   PowerShell, CMD y WSL disponibles en Windows.
2. PTY/ConPTY, ANSI, UTF-8, Ctrl+C, Tab y redimensionamiento.
3. Pestañas independientes de la vista: 1 panel por defecto, botones 1/2/3,
   filas o columnas y separadores ajustables. Hasta ocho shells en ejecución.
   Las sesiones iniciadas siguen funcionando en segundo plano.
4. Compositor con completado de comandos en PATH, rutas, argumentos conocidos,
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
