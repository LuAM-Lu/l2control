# Orquesta de modelos

> **Montada el 2026-09-16.** Claude Code es **la maestra** (con el plan Pro de quien la usa):
> planifica, prepara contratos y dominio, escribe el encargo, revisa y hace commit. **La obrera
> Gemini programa** lo encargado en una copia aislada del proyecto. Las reglas de qué se delega y qué no están en
> [CLAUDE.md](../CLAUDE.md#orquesta-de-modelos-opcional). Es **opcional y personal**: se configura por
> persona y no cambia nada para quien no la tenga.

## Arrancar una sesión nueva en modo orquesta

1. **Reabrir VS Code** después de cualquier `setx`, para que Claude Code vea `L2_OBRERA_SIN_ENTRENAMIENTO`.
2. Abrir Claude Code en la carpeta del proyecto y empezar con algo como:

   > Trabajamos en orquesta (docs/ORQUESTA.md): tú eres la maestra y Gemini programa. Lee
   > docs/PENDIENTES.md y el final de docs/BITACORA.md. Lo siguiente es el encargo
   > docs/encargos/tarifas-editor.md: revisa que su preparación esté hecha y lánzalo.

3. La maestra comprueba antes de lanzar: `git status` limpio, `git worktree list` sin copias viejas y
   `pnpm verify` en verde. Si la obrera se niega por el candado, reabrir VS Code.
4. Para probar en el navegador hace falta `pnpm dev` (el servidor no sobrevive a la sesión que lo lanzó).

## Las dos vías, y cuál está activa

| Vía | Cómo paga Gemini | Estado |
|---|---|---|
| **A · CLI de Antigravity** (`scripts/obrera.mjs`) | Con la suscripción **Google AI Pro**, sin clave de API | **Activa** desde el 2026-09-16: programa en una copia aislada |
| **B · PAL MCP** | Con una **clave de API** de Gemini (y DeepSeek después) | Instalada, **sin registrar**: no arranca sin clave |

La vía A existe porque quien la usa tiene Google AI Pro y no clave de API. La B da más herramientas
(consenso entre modelos, revisión antes del commit) y es la que permitirá sumar DeepSeek.

## Por qué así y no con otra herramienta

Se compararon las alternativas el 2026-09-16 (Roo Code, Cline, Kilo Code, OpenCode, OpenHands, Aider,
Antigravity y Cursor). Decidieron cuatro hechos:

- **La suscripción Claude Pro solo vale dentro de Claude Code.** Desde febrero de 2026 los términos de
  Anthropic prohíben usar la sesión de Free, Pro o Max en herramientas de terceros, y desde el 4 de abril
  está bloqueado. En Cline, Kilo u OpenCode la maestra se pagaría por API.
- **Roo Code cerró** el 15 de mayo de 2026.
- **La CLI de Gemini dejó de atender cuentas Pro** el 18 de junio de 2026; su sucesora es la CLI de
  Antigravity (`agy`).
- **Antigravity no acepta claves propias ni DeepSeek**, y Cursor cobra la maestra con sus créditos.

## Vía A · la obrera por la CLI de Antigravity

### Instalar (Windows)

```powershell
irm https://antigravity.google/cli/install.ps1 | iex    # verifica SHA-512; queda en %LOCALAPPDATA%\agy\bin
agy                                                     # una vez, para iniciar sesión con la cuenta de Google
```

### Qué puede y qué no puede hacer

La obrera trabaja en una **copia aislada**: un `git worktree` hermano del proyecto
(`<proyecto>-obrera`, rama `obrera/<tarea>`), con sus propias dependencias. El proyecto de verdad no se
toca nunca.

| | Puede | No puede |
|---|---|---|
| Leer | el proyecto y la copia | `.env*`, `.git`, `~/.ssh`, `~/.claude`, `~/.claude.json` |
| Escribir | **`apps/` de la copia** | el proyecto; `packages/` de la copia (contratos, dominio, ui) |
| Ejecutar | `pnpm typecheck`, `pnpm test`, `pnpm arch`, `pnpm verify` | `git`, borrar, cualquier otro comando, internet |

En modo sin interfaz, `agy` **deniega sin preguntar** todo lo que no esté permitido. La prioridad es
**deny > ask > allow**. Permisos en `%USERPROFILE%\.gemini\antigravity-cli\settings.json`
(ajustar las rutas a la carpeta de cada persona):

```json
{
  "permissions": {
    "allow": [
      "read_file(C:/Users/W11/Desktop/L2Control/)",
      "read_file(C:/Users/W11/Desktop/L2Control-obrera/)",
      "write_file(C:/Users/W11/Desktop/L2Control-obrera/apps/)",
      "command(regex:^pnpm (typecheck|test|arch|verify)$)",
      "command(regex:^pnpm --filter [@a-z0-9/_.-]+ (typecheck|test)$)",
      "unsandboxed(regex:^pnpm (typecheck|test|arch|verify)$)",
      "unsandboxed(regex:^pnpm --filter [@a-z0-9/_.-]+ (typecheck|test)$)"
    ],
    "deny": [
      "write_file(C:/Users/W11/Desktop/L2Control/)",
      "write_file(C:/Users/W11/Desktop/L2Control-obrera/.git)",
      "write_file(C:/Users/W11/Desktop/L2Control-obrera/packages/contracts/)",
      "write_file(C:/Users/W11/Desktop/L2Control-obrera/packages/domain/)",
      "write_file(C:/Users/W11/Desktop/L2Control-obrera/apps/web/src/demo/modo.ts)",
      "read_file(C:/Users/W11/Desktop/L2Control/.env)",
      "read_file(C:/Users/W11/Desktop/L2Control/.env.local)",
      "read_file(C:/Users/W11/Desktop/L2Control/apps/web/.env)",
      "read_file(C:/Users/W11/Desktop/L2Control/apps/web/.env.local)",
      "read_file(C:/Users/W11/Desktop/L2Control-obrera/.env)",
      "read_file(C:/Users/W11/Desktop/L2Control-obrera/apps/web/.env.local)",
      "read_file(C:/Users/W11/Desktop/L2Control/.git/)",
      "read_file(C:/Users/W11/.ssh/)",
      "read_file(C:/Users/W11/.claude/)",
      "read_file(C:/Users/W11/.claude.json)",
      "command(git)",
      "execute_url(*)"
    ]
  }
}
```

*Comprobado el 2026-09-16, límite por límite:* escribir en `apps/` de la copia funciona; escribir en el
proyecto o en `packages/domain` de la copia se deniega; `git`, `node -e` y `Remove-Item` se deniegan;
`pnpm typecheck` se ejecuta y devuelve su salida; pedirle `.claude.json` choca con la lista de prohibidos.

> **Por qué hay reglas `unsandboxed(...)`.** En Windows la caja de arena de `agy` no aísla los comandos,
> así que **todos** cuentan como «sin aislar». Una primera versión negaba `unsandboxed(*)` y eso bloqueaba
> también `pnpm typecheck`: la obrera del piloto no pudo comprobar su propio código. Ahora se permite
> ejecutar sin aislar **solo** lo que ya está en la lista de comandos; todo lo demás sigue sin permiso.
> Además, `agy` lanza los comandos desde otra carpeta si no se le dice: el encargo base le indica la raíz
> de la copia.

### El candado del entrenamiento

Los [términos de Antigravity](https://antigravity.google/terms/) dicen que Google usa las interacciones
—código, prompts y respuestas— para mejorar sus productos, y que su personal puede revisarlas, **salvo
que se desactive**:

```powershell
# 1. Antigravity → Settings → Account → desactivar «Enable Telemetry».
# 2. Declararlo (y reabrir el editor):
setx L2_OBRERA_SIN_ENTRENAMIENTO 1
```

Sin esa variable, `scripts/obrera.mjs` se niega y explica por qué. Fail-closed (regla 4). Ojo: no
hay forma de comprobar el interruptor desde el equipo (se guarda en la cuenta), y en los foros de Google
se discute si basta; una garantía contractual solo la da una cuenta de empresa.

### El ciclo de una tarea

```bash
# 1. La maestra prepara lo que la obrera no puede tocar (contratos, dominio, ui) y lo commitea:
#    la copia sale del HEAD de ese momento.
# 2. Encarga, con una especificación guardada en docs/encargos/<tarea>.md: archivos, patrón a copiar,
#    qué no hacer y cuándo está terminado.
node scripts/obrera.mjs programa carta-editor --encargo docs/encargos/carta-editor.md
# 3. Revisa el diff entero.
node scripts/obrera.mjs diff carta-editor --completo
# 4. En la copia: pnpm verify y prueba en el navegador. Corrige lo que haga falta.
# 5. Lo lleva a main y commitea diciendo qué escribió la obrera y qué corrigió la maestra:
git -C ../L2Control-obrera add -A -N
git -C ../L2Control-obrera diff --binary > carta.patch && git apply carta.patch
#    ⚠ El servidor de desarrollo (Turbopack) no siempre ve los archivos que escribe `git apply`
#    y sirve la versión vieja —en el piloto, un 404—. Tocar los archivos (`touch`) lo resuelve.
node scripts/obrera.mjs limpia carta-editor
```

Solo hay una copia a la vez: `programa` se niega si está ocupada con otra tarea. Para opinar sin
escribir: `node scripts/obrera.mjs revisa [--flash] "encargo"`.

Usa la cuota de Google AI Pro. Los modelos disponibles salen con `agy models`; el script usa
`gemini-3.1-pro-high` para programar.

## Vía B · PAL MCP (cuando haya clave de API)

[BeehiveInnovations/pal-mcp-server](https://github.com/BeehiveInnovations/pal-mcp-server), Apache-2.0.

```powershell
# 1. uv
winget install --id=astral-sh.uv -e

# 2. PAL, en versión fija y con el SDK de MCP por debajo de 2.
#    ⚠ Sin «--with mcp<2» NO ARRANCA: PAL pide mcp>=1.0.0 sin tope, uv instala la 2.x,
#    y la 2.x quitó `Server.list_tools` → AttributeError al iniciar.
uv tool install --python 3.12 --with "mcp>=1.0,<2" `
  "git+https://github.com/BeehiveInnovations/pal-mcp-server.git@v9.8.2"

# 3. La clave, como variable de entorno. Con FACTURACIÓN ACTIVADA en el proyecto de Google:
#    en la cuota gratuita, Google usa lo enviado para mejorar sus productos.
setx GEMINI_API_KEY "tu-clave"       # https://aistudio.google.com/apikey
# DeepSeek, más adelante (API compatible con OpenAI):
# setx CUSTOM_API_URL "https://api.deepseek.com/v1"
# setx CUSTOM_API_KEY "tu-clave"

# 4. Reabrir VS Code y registrarlo SOLO para este proyecto y esta persona:
cd C:\ruta\a\L2Control
claude mcp add --scope local pal `
  -e DEFAULT_MODEL=auto `
  -e "DISABLED_TOOLS=analyze,refactor,secaudit,docgen,tracer" `
  -e LOCALE=es-VE -e LOG_LEVEL=INFO -e MAX_CONVERSATION_TURNS=20 `
  -- "$env:USERPROFILE\.local\bin\pal-mcp-server.exe"

claude mcp get pal     # debe decir: Status ✔ Connected
```

Las claves **nunca** van en el repo ni en la configuración de MCP. Conviene poner un tope de gasto en la
consola del proveedor.

Herramientas que quedan encendidas: `chat`, `thinkdeep`, `planner`, `consensus`, `codereview`,
`precommit`, `debug`, `apilookup`, `challenge` y `testgen`.

> **Ojo con `clink`** (la herramienta de PAL que llama a otras CLI): su configuración de Gemini lanza la
> CLI con `--yolo`, que aprueba sola cualquier edición o comando. Además, esa CLI ya no atiende cuentas
> Pro. No usarla.

## Piloto: el editor de Carta y precios (2026-09-16)

**Encargo:** el editor de Carta y precios (F6-03), su proveedor y `/mesas` leyendo la carta publicada.
La maestra dejó antes el contrato listo (`retiredAt` y la regla de nombres repetidos, con 4 pruebas).

**Lo que devolvió la obrera:** 8 archivos y 487 líneas en unos 5 minutos, con la arquitectura bien
(`pnpm arch` limpio) y las reglas del encargo cumplidas: retirar no borra, el precio pasa por
`fromMajor` sin `number` ni `toFixed`, el error de publicación se ve junto al botón, y `/mesas` usa la
carta completa para los pedidos viejos y oculta los retirados solo al ofrecer. Añadió «Rehacer» sin que
se le pidiera; encaja y se quedó.

**Lo que corrigió la maestra** (unas 60 líneas):

| Tipo | Qué |
|---|---|
| Fallo real | La hoja de edición usaba una propiedad inventada (`onAbierto`): **«Editar» abría vacío** |
| Fallo latente | Id de un plato nuevo: el reintento leía otra vez `Date.now()`, que en el mismo milisegundo repite → bucle sin fin |
| Tipos | Un `import` a mitad de archivo y otro sin usar (`pnpm typecheck` en rojo) |
| Pérdida | Borró el `TODO` del backend de la ruta de `/mesas` sin llevarlo a otro sitio |
| Interfaz | 16 botones rojos rellenos; «Agotado» tachaba el nombre; el error del precio no usaba el `error` del `Input` |
| Estilo | Sin comentarios de cabecera; espacios sobrantes |

**Comprobado en el navegador:** editar abre con los datos del plato; un precio no numérico da error junto
al campo; publicar con un nombre repetido muestra el motivo del contrato; retirar no borra; la carta
publicada llega al salón (Malta retirada no se ofrece, la Arepa nueva sí, los Tequeños a $ 5,50).

**Lecciones:** la obrera **declaró que el typecheck pasaría sin haberlo corrido** —nunca fiarse del
resumen, siempre comprobar—; y sus fallos fueron de los que el compilador no ve si no se ejecuta
(propiedades inventadas) o que solo aparecen usando la pantalla. Por eso la revisión incluye navegador.

## Encargos

Cada encargo se guarda en `docs/encargos/` y se versiona con el código que produjo. Están todos, en
orden de entrega; el que no se ha lanzado también, porque el encargo se escribe antes.

| Tarea | Encargo | Qué salió de ahí | Estado |
|---|---|---|---|
| `carta-editor` | [carta-editor.md](encargos/carta-editor.md) | El editor de la carta (F6-14) | Hecho |
| `tarifas-editor` | [tarifas-editor.md](encargos/tarifas-editor.md) | Tarifas y paquetes del parque (F5-04) | Hecho |
| `auditoria-frontend-codigo` | [auditoria-frontend-codigo.md](encargos/auditoria-frontend-codigo.md) | La mirada al código de la auditoría de tablet | Hecho |
| `pwa-base` | [pwa-base.md](encargos/pwa-base.md) | Manifiesto, iconos y service worker | Hecho |
| `tactil-pos` | [tactil-pos.md](encargos/tactil-pos.md) | Objetivos táctiles por superficie | Hecho |
| `barra-vertical` · `barra-puestos` | [barra-vertical.md](encargos/barra-vertical.md) · [barra-puestos.md](encargos/barra-puestos.md) | La barra de estación en tablet vertical y el paso a otro puesto (N-06) | Hecho |
| `panel-avisa` | [panel-avisa.md](encargos/panel-avisa.md) | El panel avisa de lo que pasa en el local (F9-08) | Hecho |
| `acceso-desde-directorio` | [acceso-desde-directorio.md](encargos/acceso-desde-directorio.md) | Entrar eligiendo a la persona (N-03) | Hecho |
| `caja-compacta` · `turno-arqueo` · `parque-tablet` · `estaciones-apaisado` | [caja-compacta.md](encargos/caja-compacta.md) · [turno-arqueo.md](encargos/turno-arqueo.md) · [parque-tablet.md](encargos/parque-tablet.md) · [estaciones-apaisado.md](encargos/estaciones-apaisado.md) | Las olas 1 y 2 del plan del frontend: todas las estaciones en 12 tamaños | Hecho |
| `solo-caja-cobra` | [solo-caja-cobra.md](encargos/solo-caja-cobra.md) | DEC-25 en las pantallas | Hecho |
| `sucursal-ajustes` · `dispositivos` | [sucursal-ajustes.md](encargos/sucursal-ajustes.md) · [dispositivos.md](encargos/dispositivos.md) | Ola 4, tanda A: ajustes del local y equipos autorizados | Hecho |
| `entrada-rapida` · `sala-nombra-y-vincula` | [entrada-rapida.md](encargos/entrada-rapida.md) · [sala-nombra-y-vincula.md](encargos/sala-nombra-y-vincula.md) | La entrada en dos toques y la sala que nombra y vincula (DEC-27 a DEC-29) | Hecho |
| `representantes` | [representantes.md](encargos/representantes.md) | El directorio de familias (F5-01) | Hecho |
| `tasas-de-cambio` | [tasas-de-cambio.md](encargos/tasas-de-cambio.md) | La tasa del día, su historial y su confirmación (F3-03 a F3-05) | Hecho |
| `medios-de-pago` | [medios-de-pago.md](encargos/medios-de-pago.md) | Qué se cobra, por dónde y con qué datos (F4-02, F4-04) | Hecho |
| `cortesia` | [cortesia.md](encargos/cortesia.md) | Regalar una línea con motivo y autorización (F6-14) | Hecho |

## Actualizar o quitar

```powershell
agy update
uv tool upgrade pal-mcp-server        # respeta el tope de mcp<2 si se instaló con --with
claude mcp remove pal -s local
uv tool uninstall pal-mcp-server
```
