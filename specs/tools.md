# Herramientas 0.4 — alcance implementado

- Registro central compartido por teclado, paleta, botones y editor. Atajos
  modificables, búsqueda, quitar/restaurar y conflictos Reemplazar/Cancelar por contexto.
- Paleta fuzzy dinámica con categorías, combinaciones, teclado y acciones deshabilitadas.
- HTTP real: método, URL, parámetros/headers activables, auth, cuerpo, respuesta
  Body/Headers/Raw, JSON, cURL por shell, guardados/duplicados e historial sin credenciales.
- Inspector real Linux/Windows: TCP/UDP/PID, CPU/memoria, filtros, orden, páginas,
  detalles, copiar, comandos nativos, CWD, navegador explícito, URL al API Tester
  sin envío y terminación confirmada con identidad comprobada.
- JSON/YAML/XML: validar/formatear/minificar, conversiones sin pérdida silenciosa,
  errores, copiar, abrir/guardar como y selección JSON del terminal. Contenido volátil.
- Snippets: parámetros con defaults, vista previa, copiar/insertar/ejecutar,
  CRUD/duplicar, categorías/favoritos, atajos e importar/exportar JSON. Valores volátiles.
- Conserva 0.3: pestañas suspendidas/cwd de lanzamiento, 1–3 paneles, Git, editor y scroll.

Project Task Runner fue reemplazado explícitamente por el inspector y no se incluye.
El respaldo preview.1 incluye 0.3 + atajos/paleta/API y se conserva por separado.
Los límites y diferencias de plataforma están en README; la evidencia está en reports.
No se ejecutan comandos al seleccionar, restaurar ni importar configuraciones.
