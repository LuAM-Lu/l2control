# Orquesta de modelos

> **Montada el 2026-09-16.** Claude Code es **la maestra** (con el plan Pro de quien la usa):
> planifica, prepara contratos y dominio, escribe el encargo, revisa y hace commit. **La obrera
> Gemini programa** lo encargado en una copia aislada del proyecto. Las reglas de qué se delega y qué no están en
> [CLAUDE.md](../CLAUDE.md#orquesta-de-modelos-opcional). Es **opcional y personal**: se configura por
> persona y no cambia nada para quien no la tenga.

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
      "command(regex:^pnpm --filter [@a-z0-9/_.-]+ (typecheck|test)$)"
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
      "unsandboxed(*)",
      "execute_url(*)"
    ]
  }
}
```

*Comprobado el 2026-09-16, límite por límite:* escribir en `apps/` de la copia funciona; escribir en el
proyecto o en `packages/domain` de la copia se deniega; `git` y `Remove-Item` se deniegan; `pnpm
typecheck` se ejecuta; pedirle `.claude.json` choca con la lista de prohibidos.

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
# 2. Encarga, con una especificación: archivos, patrón a copiar, qué no hacer, cuándo está terminado.
node scripts/obrera.mjs programa carta-editor "…"
# 3. Revisa el diff entero.
node scripts/obrera.mjs diff carta-editor --completo
# 4. En la copia: pnpm verify y prueba en el navegador. Corrige lo que haga falta.
# 5. Lo lleva a main (git -C ../L2Control-obrera diff | git apply), commit diciendo qué escribió
#    la obrera y qué corrigió la maestra.
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

## Piloto

Primera tarea programada por la obrera: **el editor de Carta y precios** (F6-03), con el proveedor de la
carta y `/mesas` leyendo la carta publicada. La maestra dejó antes el contrato listo (`retiredAt` y la
regla de nombres). Se mide cuánto de lo que devuelve entra sin retoques.

## Actualizar o quitar

```powershell
agy update
uv tool upgrade pal-mcp-server        # respeta el tope de mcp<2 si se instaló con --with
claude mcp remove pal -s local
uv tool uninstall pal-mcp-server
```
