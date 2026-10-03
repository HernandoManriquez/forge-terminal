# Forge Terminal

Una terminal de escritorio para Windows y Linux, con paneles ajustables,
autocompletado y espacios de trabajo. **MVP 0.3.0 · x64 · MIT**

![Forge Terminal](reports/forge-terminal.png)

## Empezar con los ejecutables

No necesitas instalar Go, Node.js ni npm para usar los binarios.

### Windows

1. Descomprime el paquete `forge-terminal-0.3.0-windows-x64.zip`.
2. Abre `forge.exe`.
3. Selecciona tu shell desde **Nueva terminal**: PowerShell 7, Windows PowerShell,
   CMD o WSL, según lo instalado en tu equipo.

Requisitos: Windows 10 1809 o posterior / Windows 11, x64, y
[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
Si falta ese componente, instala su versión Evergreen. El ejecutable no está
firmado digitalmente; su editor aparecerá como desconocido.

El paquete contiene un `.exe` real, compilado para Windows. La ejecución nativa
en Windows no se pudo validar durante esta entrega.

### Linux

Descomprime `forge-terminal-0.3.0-linux-x64.zip` e instala el motor gráfico del
sistema si todavía no lo tienes:

```bash
# Fedora Workstation / escritorio en Fedora
sudo dnf install gtk3 webkit2gtk4.1

# Ubuntu 24.04 / Debian con WebKitGTK 4.1
sudo apt install libwebkit2gtk-4.1-0
```

Desde la carpeta descomprimida:

```bash
chmod +x forge
./forge
```

Para agregarlo al menú de aplicaciones de tu usuario:

```bash
bash install-linux.sh
```

El instalador opcional requiere Python 3, copia el binario a `~/.local/bin/forge`
y registra el icono y el acceso de escritorio. No instala paquetes ni usa sudo.

El ejecutable Linux se enlaza dinámicamente con GTK 3 y WebKitGTK 4.1. La base de
compilación es Ubuntu 24.04 x64. Fedora 44 es un objetivo compatible con esos
componentes, pendiente de prueba de escritorio en esa distribución.

**Fedora Server sin escritorio:** la ventana nativa necesita una sesión gráfica.
Puedes ejecutar `./forge --serve` para usar la misma interfaz desde un navegador
en ese equipo. El programa imprime una URL local temporal de acceso. El servicio
solo escucha en `127.0.0.1`; no queda publicado en la red.

## Qué puedes hacer

| Función | Uso |
|---|---|
| Terminal real | Ejecuta tus programas, SSH, editores de consola y herramientas habituales. Usa PTY en Linux y ConPTY en Windows. |
| Pestañas y paneles | Nueva terminal abre una pestaña activa; las anteriores siguen en segundo plano. Botones **1 / 2 / 3** para elegir cuántas terminales ver, con orientación en columnas o filas y separadores ajustables. Máximo ocho shells en ejecución entre todos los espacios. |
| Espacios | Agrupa carpetas y shells por proyecto. Doble clic en el nombre para renombrar. Se guarda la distribución. |
| Barra de comandos | Escribe abajo y usa Tab para elegir una sugerencia. **Insertar** envía texto; **Ejecutar** también envía Enter al panel activo. |
| Autocompletado | Comandos de PATH, carpetas, archivos, favoritos y argumentos de Git, Docker, Podman, systemctl, npm y Go. |
| Tab del shell | Dentro de la terminal se conserva el completado nativo de Bash, Zsh, Fish o PowerShell. |
| Favoritos | Guarda comandos propios y selecciónalos para revisarlos en la barra de comandos. Nunca se ejecutan al seleccionarlos. |
| Explorador | Un clic selecciona el archivo. Clic derecho ofrece **Editar**, **Copiar ruta**, **Insertar ruta en comandos** y abrir una terminal en esa carpeta. **Ocultos** muestra archivos y carpetas que empiezan por punto. |
| Editor simple | **Editar** abre otra ventana con texto plano, explorador, Nuevo, Abrir, Guardar, Guardar como y Cerrar. También se abre con doble clic o Enter sobre un archivo. |
| Salida y scroll | Filas completas con margen inferior. Sigue la última línea; al subir al historial se pausa y al volver al final se reanuda. |
| Contexto Git | Pulsa la rama para ver archivos modificados, nuevos, renombrados o eliminados, diferencias preparadas y sin preparar y ramas locales/remotas conocidas. Incluye **Actualizar**; el visor es de solo lectura. |
| Paleta | Encuentra acciones, preferencias y favoritos con Ctrl+K. |
| Búsqueda | Busca en las líneas que retiene cada terminal. |
| Enfoque | Oculta paneles laterales para dar espacio al terminal. |
| Exportar salida | Guarda el buffer retenido en un archivo de texto y muestra su ruta. |
| Personalización | Temas Obsidiana, Medianoche y Papel; fuente de 11 a 22 px; paneles y scrollback configurables. |

Las sugerencias son locales y no requieren IA ni conexión a Internet. No se
ejecutan comandos para calcular completados. Los snippets dependen del shell
seleccionado: puedes editar o reemplazar los favoritos de ejemplo.

La barra de comandos envía texto a **la sesión activa**: úsalo cuando estés en el prompt
del shell y la línea de entrada esté vacía. En una aplicación interactiva, usa su
entrada normal. El pegado de varias líneas pide revisar el contenido.

## Editor y archivos ocultos

Pulsa **Ocultos** junto al título del explorador para mostrar `.gitignore`, `.ai`
y otros nombres con punto inicial. La preferencia se conserva. Seleccionar un
archivo ya no escribe su ruta en la barra de comandos: esa acción se pide
explícitamente en el menú contextual.

Clic derecho sobre un archivo → **Editar** abre una ventana independiente.
Puedes navegar por carpetas, abrir otro archivo o crear uno nuevo, guardar con
`Ctrl+S`, guardar con otro nombre con `Ctrl+Shift+S`, abrir con `Ctrl+O` y cerrar
con `Ctrl+W` o el botón **Cerrar**. También se protege el cierre de la ventana
nativa: si hay cambios, ofrece **Guardar y continuar**, **Descartar** o **Cancelar**.
El editor hereda el tema, la fuente y la preferencia de ocultos de Forge.

El editor admite texto UTF-8 de hasta 2 MiB, conserva BOM y saltos LF o CRLF.
Rechaza binarios, UTF-16 y saltos mezclados para evitar conversiones silenciosas.
Si el archivo cambia en disco desde que lo abriste, conserva tus ediciones y
avisa: puedes recuperarlas con **Guardar como** o recargar la versión del disco.
**Guardar como** crea un archivo nuevo y no sobrescribe otro existente.
No incluye resaltado, depuración ni herramientas de IDE.

También puedes abrirlo directamente:

```bash
./forge --editor /ruta/al/archivo.txt
```

```powershell
.\forge.exe --editor 'D:\Proyecto\.gitignore'
```

En modo `--serve`, **Editar** abre una ventana del navegador. Permite ventanas
emergentes para la dirección local si el navegador las bloquea. La terminal
permanece en su ventana y los editores nativos abiertos sobreviven a su cierre.

## Atajos

| Atajo | Acción |
|---|---|
| `Ctrl+K` | Paleta de comandos |
| `Ctrl+Espacio` | Enfocar la barra de comandos |
| `Ctrl+Shift+T` | Nueva terminal |
| `Ctrl+Shift+D` | Añadir una vista en columnas (hasta 3) |
| `Ctrl+Shift+E` | Añadir una vista en filas (hasta 3) |
| `Alt+1` … `Alt+8` | Abrir una de las primeras ocho pestañas del espacio |
| `Ctrl+Shift+G` | Buscar en la salida |
| `Ctrl+Shift+F` | Alternar modo enfoque |
| `Ctrl+Shift+S` | Guardar espacio |
| `Ctrl+Shift+W` | Cerrar panel, con confirmación |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar selección / pegar |
| `Enter` en la barra de comandos | Ejecutar texto |
| `Shift+Enter` en la barra de comandos | Insertar sin enviar Enter |
| `Tab` en la barra de comandos | Aceptar sugerencia |

Si el acceso al portapapeles está restringido por el motor del sistema, `Ctrl+V`
conserva el pegado normal del terminal. `Ctrl+C` sigue siendo interrupción del
programa y `Ctrl+R` conserva la búsqueda de historial del shell.

## Sesiones y configuración

Las preferencias se guardan en:

- Linux: `$XDG_CONFIG_HOME/forge-terminal/settings.json`, normalmente
  `~/.config/forge-terminal/settings.json`.
- Windows: `%AppData%\forge-terminal\settings.json`.
- Exportaciones: subcarpeta `exports` dentro de esa misma carpeta.

Puedes indicar otra carpeta con `--config-dir RUTA`. El motor web también puede
crear su propio directorio de caché, en particular `forge.exe.WebView2` en Windows.

Al iniciar Forge se abre **una terminal nueva en el directorio de trabajo del
proceso que lo lanzó**, con vista de un solo panel. No se usa la carpeta del
binario ni la carpeta guardada del último panel para esa sesión nueva.

Las pestañas guardadas conservan nombre, carpeta y perfil y quedan **suspendidas
en segundo plano**: no crean shells ni instancias de xterm hasta seleccionarlas
o mostrarlas con los botones 2/3. La configuración 0.1 se migra automáticamente;
se preservan incluso las ocho pestañas anteriores y se añade la de lanzamiento.
**Los procesos anteriores y su salida no sobreviven al cierre.** La salida
no se graba automáticamente. El historial de la barra de comandos está deshabilitado por
defecto; si lo habilitas, conserva hasta 100 entradas locales sin cifrado. No
registra las teclas de la terminal ni lee el historial privado del shell.

El directorio activo sigue al shell mediante `/proc` en Linux y OSC 7 en
PowerShell. PowerShell añade ese anuncio conservando el prompt del perfil, sin
editar sus archivos. En CMD el contexto conserva la carpeta inicial. En WSL,
los archivos del explorador son del host Windows y el completado de rutas Linux
se usa mediante Tab dentro de WSL.


### Iniciar en la carpeta de un proyecto

```powershell
Set-Location 'D:\Proyectos\mi-proyecto'
& 'C:\Herramientas\Forge\forge.exe'
```

```bash
cd ~/Development/projects/mi-proyecto
~/.local/bin/forge
```

Al usar un acceso directo, su opción **Iniciar en** determina la carpeta inicial.
Las nuevas pestañas creadas dentro de Forge toman la carpeta de la terminal
activa, editable antes de abrirlas. Los scripts de inicio del propio shell
pueden cambiar su directorio.

### Elegir terminales paralelas

1. Abre pestañas con **Nueva terminal**.
2. Pulsa **2** o **3** para mostrar terminales en paralelo. Se reutilizan las
   pestañas existentes; solo se crean adicionales si faltan.
3. Pulsa un panel para activarlo. Al seleccionar una pestaña oculta, sustituye
   al panel activo y mantiene los demás visibles.
4. Pulsa **1** para dejar solo la activa. Las demás siguen en segundo plano.
5. La **×** de cada pestaña permite cerrarla sin activarla. Las suspendidas se
   eliminan sin arrancar ningún proceso; cerrar un shell en ejecución pide confirmar.

El límite de ocho se aplica a shells en ejecución, no a las pestañas suspendidas.
Si alcanzas el límite, cierra una sesión y pulsa reiniciar en la pestaña pendiente.

### Visor de Git

- La tarjeta muestra el repositorio de la terminal activa. Los cambios se
  consultan desde su raíz, aunque el shell esté en una subcarpeta.
- El estado incluye archivos sin seguimiento; las carpetas nuevas se agrupan
  como las muestra `git status` y no tienen vista previa de archivo.
- Las diferencias separan índice (**Preparado**) y copia de trabajo (**Sin preparar**).
- Los archivos nuevos de texto tienen vista previa; los binarios y enlaces se indican.
- Las ramas remotas son referencias conocidas localmente; no se ejecuta `fetch`
  ni se cambia de rama al pulsarlas.
- Vista previa limitada a 256 KiB por sección y consulta con tiempo máximo de 4 s.
  Se indica si el resultado quedó truncado. Requiere Git instalado en PATH.

## Tamaño y recursos

- Binarios de aproximadamente **8 MB**, con HTML, CSS, JavaScript e iconos
  incluidos. Consulta los tamaños exactos en `reports/validation.md`.
- Utiliza la vista web del sistema; no incorpora Electron ni otro navegador
  completo en el paquete.
- Una vista web para los terminales; hasta ocho shells en ejecución, tres visibles.
- Los editores se abren bajo demanda en procesos independientes, hasta cuatro
  por instancia de Forge; no cargan xterm ni arrancan shells.
- Las pestañas guardadas sin abrir no tienen proceso ni buffer de terminal.
- Las terminales iniciadas continúan ejecutándose al quedar en segundo plano.
- Scrollback predeterminado: 3.000 líneas por terminal iniciada.
- Control de flujo: limita datos pendientes entre PTY y renderizado.
- Sin animaciones permanentes ni parpadeo del cursor. Métricas espaciadas cada
  cinco segundos; actualización suspendida cuando el documento está oculto.

La cifra **Memoria Go** del panel mide únicamente el heap del backend. **No es la
RAM total:** hay que sumar WebView, shell y programas ejecutados. La RAM total de
las ventanas nativas no se midió en este entorno. El tamaño pequeño del binario
no garantiza un consumo equivalente al de una terminal renderizada sin WebView.

## Compilar desde el código fuente

Requisitos comunes: Go 1.26 o superior, Node.js 20 o superior y npm. Las
dependencias de JavaScript tienen versiones fijadas en `package-lock.json`;
las de Go están en `go.mod` / `go.sum`.

### Linux

```bash
# Fedora: dependencias para compilar
sudo dnf install gcc gcc-c++ pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel

# Ubuntu: dependencias para compilar
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev

cd ~/Development/projects/forge-terminal
npm ci
bash scripts/build.sh
./build/forge-linux-x64
```

### Windows

Instala Go, Node.js y [MSYS2](https://www.msys2.org/). En la consola **MSYS2
MINGW64** instala `mingw-w64-x86_64-gcc`. Agrega `C:\msys64\mingw64\bin` a PATH
y abre una nueva consola PowerShell:

```powershell
cd C:\Development\projects\forge-terminal
npm.cmd ci
& .\scripts\build-windows.ps1
.\build\forge.exe
```

También puedes compilar el `.exe` desde Linux con MinGW-w64:

```bash
sudo apt install gcc-mingw-w64-x86-64 g++-mingw-w64-x86-64
bash scripts/build-cross-windows.sh
```

El recurso Windows compilado está incluido en el código. Si cambias el icono o
el manifiesto, regenera `src/cmd/forge/icon_windows_amd64.syso`:

```bash
cd assets
x86_64-w64-mingw32-windres forge.rc -O coff -o ../src/cmd/forge/icon_windows_amd64.syso
```

### Desarrollo de la interfaz

```bash
npm run build:ui
go run -tags headless ./src/cmd/forge --serve
```

Abre la URL temporal que imprime el programa. El modo headless conserva PTY,
autocompletado y todas las funciones; solo cambia la forma de abrir la ventana.
No hay un shell simulado en la vista de desarrollo.

## Verificar

```bash
npm ci
npx playwright install chromium
python3 scripts/quality_gate.py
```

El gate ejecuta pruebas Go con detector de carreras, `go vet`, pruebas de pestañas, migración y árbol
de paneles, bundle de producción y E2E sobre un PTY Linux real. Genera reportes
en `reports/`. Las E2E Linux incluyen comando real, Unicode, completado, paneles,
resize, búsqueda, favoritos, paleta, temas, pegado, exportación, restauración,
cierre y reinicio.

**Estado de esta entrega:** núcleo e interfaz probados en Linux; 17 recorridos
E2E de terminal, 12 del editor y 4 de geometría/scroll con PTY real. El editor
nativo WebKitGTK se verifica bajo Xvfb: edición, aviso de cambios sin guardar,
cancelación del cierre, guardado y cierre limpio. Windows se compila, pero no se
ejecuta en esta entrega. Quedan pendientes las pruebas en escritorios reales
Windows/Fedora/Ubuntu. Consulta `reports/validation.md` para la evidencia.

## Arquitectura y estructura

```text
src/cmd/forge/          Entrada, ventana nativa y variantes por plataforma
src/internal/terminal/ PTY Linux y ConPTY Windows
src/internal/server/   API local, autenticación, WebSocket y completado
src/ui/app/            Interfaz, estilos y modelo de paneles
src/ui/dist/           Recursos compilados e incorporados al binario
tests/                 Pruebas de modelo y E2E
scripts/               Compilación, instalación y quality gate
.ai/                   Reglas, planificación y memoria del proyecto
specs/                 Alcance y criterios de aceptación
docs/                  Arquitectura y referencias
reports/               Evidencia de validación y capturas
third_party/           WebView conservado con tres parches documentados
```

El servicio solo escucha en loopback, con clave aleatoria por ejecución, cookie
HttpOnly/SameSite Strict, comprobación de Host/Origin y CSP. El shell tiene los
permisos del usuario que abre Forge. No es un sandbox para ejecutar software no
confiable. La aplicación no descarga contenido remoto ni envía telemetría propia.

## Límites del MVP

No incluye firma de código, instaladores MSI/DEB/RPM, reconexión a procesos tras
cerrar, multiplexación remota, editor de perfiles con argumentos, plugins, gestor
de contraseñas ni transferencia SFTP. Puedes usar `ssh`, `scp`, `tmux` u otras
herramientas instaladas desde el terminal. Ejecutables entregados solo para x64.

Licencia MIT. Las licencias y avisos de terceros se conservan en `THIRD_PARTY_NOTICES.txt`
y `third_party/`.
