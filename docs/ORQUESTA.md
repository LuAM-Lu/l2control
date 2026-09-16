# Orquesta de modelos

> **Montada el 2026-09-16.** Claude Code es la maestra (con el plan Pro de quien la usa) y llama a
> otros modelos a través de **PAL MCP** ([BeehiveInnovations/pal-mcp-server](https://github.com/BeehiveInnovations/pal-mcp-server),
> Apache-2.0). Las reglas de qué se delega y qué no están en [CLAUDE.md](../CLAUDE.md#orquesta-de-modelos-opcional).
> Es **opcional y personal**: se configura por persona y no cambia nada para quien no la tenga.

## Por qué esta forma y no otra

Se compararon las alternativas el 2026-09-16 (Roo Code, Cline, Kilo Code, OpenCode, OpenHands, Aider,
Antigravity y Cursor). Decidieron tres hechos:

- **La suscripción Claude Pro solo vale dentro de Claude Code.** Desde febrero de 2026 los términos de
  Anthropic prohíben usar la sesión de Free, Pro o Max en herramientas de terceros, y desde el 4 de abril
  está bloqueado. En Cline, Kilo u OpenCode la maestra se pagaría por API.
- **Roo Code cerró** el 15 de mayo de 2026.
- **Antigravity no acepta claves propias ni DeepSeek**, y Cursor cobra la maestra con sus créditos.

Con PAL, la maestra sigue siendo Claude Code con el plan Pro, sigue leyendo este `CLAUDE.md` y el flujo
de trabajo no cambia.

## Instalación (Windows)

Requisitos: git y uv. Python no hace falta: uv descarga el suyo.

```powershell
# 1. uv
winget install --id=astral-sh.uv -e

# 2. PAL, en versión fija y con el SDK de MCP por debajo de 2.
#    ⚠ Sin «--with mcp<2» NO ARRANCA: PAL pide mcp>=1.0.0 sin tope, uv instala la 2.x,
#    y la 2.x quitó `Server.list_tools` → AttributeError al iniciar.
uv tool install --python 3.12 --with "mcp>=1.0,<2" `
  "git+https://github.com/BeehiveInnovations/pal-mcp-server.git@v9.8.2"

# 3. Registrarlo en Claude Code SOLO para este proyecto y esta persona (no toca el repo).
cd C:\ruta\a\L2Control
claude mcp add --scope local pal `
  -e DEFAULT_MODEL=auto `
  -e "DISABLED_TOOLS=analyze,refactor,secaudit,docgen,tracer" `
  -e LOCALE=es-VE -e LOG_LEVEL=INFO -e MAX_CONVERSATION_TURNS=20 `
  -- "$env:USERPROFILE\.local\bin\pal-mcp-server.exe"
```

## Las claves

**Nunca en el repo ni en la configuración de MCP.** Se crean como variables de entorno del usuario de
Windows y PAL las hereda de Claude Code:

```powershell
setx GEMINI_API_KEY "tu-clave"          # https://aistudio.google.com/apikey
# Más adelante, para DeepSeek (API compatible con OpenAI):
# setx CUSTOM_API_URL "https://api.deepseek.com/v1"
# setx CUSTOM_API_KEY "tu-clave"
```

`setx` solo afecta a las ventanas nuevas: **hay que cerrar y volver a abrir VS Code** (o la terminal)
para que Claude Code la vea. Comprobación:

```powershell
claude mcp get pal     # debe decir: Status ✔ Connected
```

Conviene poner un **tope de gasto** en la consola del proveedor (Google AI Studio / Cloud Billing).

## Herramientas activas

Encendidas: `chat`, `thinkdeep`, `planner`, `consensus`, `codereview`, `precommit`, `debug`,
`apilookup`, `challenge` y **`testgen`** (el piloto). Apagadas: `analyze`, `refactor`, `secaudit`,
`docgen`, `tracer`. Se cambian con `DISABLED_TOOLS`.

## Piloto

Primera tarea con obrera: **las pruebas de los editores de Carta y Tarifas** (F6-03, F5-06). Se mide
cuánto de lo que devuelve Gemini entra sin retoques. Según el resultado, se conecta DeepSeek o se
deja la orquesta solo para segundas opiniones.

## Actualizar o quitar

```powershell
uv tool upgrade pal-mcp-server        # respeta el tope de mcp<2 si se instaló con --with
claude mcp remove pal -s local
uv tool uninstall pal-mcp-server
```
