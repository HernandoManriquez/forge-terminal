# Cambios

## 0.4.0

- Completa las seis herramientas: registro/atajos, paleta, HTTP, inspector, datos y snippets.
- Inspector real de puertos TCP/UDP y procesos en Linux/Windows con filtros,
  ordenación, paginación, detalles, CWD, copia y actualización manual.
- Terminación confirmada con identidad del proceso; pidfd/SIGTERM en Linux y
  handle retenido/TerminateProcess en Windows, con protección de procesos críticos.
- Enlace explícito desde un puerto hacia navegador o API Tester sin envío automático.
- JSON/YAML/XML: validar, formatear, minificar, conversiones con límites explícitos,
  diagnóstico de errores, copiar, abrir archivos y guardar como sin sobrescritura.
- Selección JSON real desde xterm hacia herramientas de datos.
- Snippets con parámetros/defaults, vista previa, ejecución explícita, favoritos,
  CRUD, atajos compartidos e importación/exportación portable.
- Conserva las mejoras de pestañas, cwd, Git, archivos ocultos, editor y scroll.
- El respaldo 0.4.0-preview.1 anterior al inspector se conserva independientemente.

## 0.4.0-preview.1 — respaldo previo al inspector

- Registro de acciones compartido por teclado, paleta, botones y editor.
- Atajos configurables con búsqueda, conflictos Reemplazar/Cancelar y persistencia.
- Paleta fuzzy con categorías, teclado, disponibilidad contextual y favoritos.
- Ctrl+F en terminal y editor; paleta Ctrl+Shift+P, API Tester Ctrl+Alt+C.
- HTTP real, auth, parámetros, headers, cuerpo, respuesta y cURL por shell.
- Plantillas e historial limitados; valores sensibles y respuestas solo en memoria.
- El foco al abrir modales respeta el campo seleccionado; Escape devuelve control.
- Inspector, herramientas de datos y snippets parametrizados aún pendientes.

## 0.3.0

- Seleccionar archivos ya no inserta rutas. Menú contextual con Editar, Copiar
  ruta, Insertar ruta en comandos y Abrir terminal aquí.
- Editor de texto en ventana independiente con navegación, crear, abrir,
  guardar, guardar como, recargar y cerrar; protege cambios sin guardar.
- Texto UTF-8 de hasta 2 MiB; preserva BOM y LF/CRLF, detecta conflictos externos
  y evita sobrescribir archivos desde Guardar como.
- Botón Ocultos visible en el explorador; conserva la preferencia.
- Compositor renombrado a Barra de comandos, con acciones explícitas.
- Terminal medida dentro de una superficie sin padding: última fila completa
  también al cambiar fuente, dividir paneles o usar escala de pantalla fraccional.
- Seguimiento del final con salida continua; pausa al leer el historial,
  conserva su línea al cambiar altura y reanuda al volver al final.
- Cookies de autenticación independientes por puerto para varias ventanas.
- 16 pruebas Go, 7 de modelo y 33 recorridos E2E de terminal/editor/scroll.
- Compilaciones Linux/Windows x64; editor nativo Linux verificado bajo Xvfb.
  Ejecución nativa Windows pendiente.

## 0.2.0

- Nueva terminal crea una pestaña activa y conserva las anteriores en segundo plano.
- Botones 1/2/3 para mostrar hasta tres terminales; orientación en filas/columnas
  y separadores ajustables. Las pestañas ocultas sustituyen al panel activo.
- Cierre individual desde la pestaña sin activarla.
- Cada lanzamiento abre un shell en el directorio desde el que se ejecutó Forge.
- Restaura las pestañas guardadas sin iniciar shells hasta seleccionarlas.
  Migra automáticamente la configuración 0.1 y conserva todas sus pestañas.
- La tarjeta Git abre archivos modificados, diferencias preparadas/sin preparar,
  vista previa de archivos nuevos y ramas locales/remotas conocidas.
- Consultas Git de solo lectura, con timeout, límites explícitos, nombres con
  espacios, renombrados, binarios y HEAD separado.
- 11 pruebas Go, 7 de modelo y 17 recorridos de interfaz con PTY Linux real.
- Binarios Windows/Linux x64; validación de ventanas nativas pendiente.

Para actualizar: cierra Forge, descomprime el paquete nuevo y reemplaza el binario
anterior. Las preferencias y pestañas están en la carpeta de configuración del
usuario, separada del ejecutable. No borres esa carpeta.

## 0.1.0

Primera versión del MVP con terminal real, autocompletado, espacios,
explorador, favoritos, búsqueda, exportación y tres temas.
