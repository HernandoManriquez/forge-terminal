# Cambios

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
