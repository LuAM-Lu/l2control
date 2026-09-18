Construye «Configuración → Impresoras»: los aparatos del local, su ancho de papel y la vista previa de lo que sacan. Es la tarea 4.9 del plan final (docs/PLAN-FRONTEND.md) y cubre F1-12 y F6-09b, con ADR-015 y DEC-8.

POR QUÉ: hoy no hay dónde decir cuál es la impresora de cocina ni cuál la de caja. Y una impresora en red **es un dispositivo en la red**: si alguien del local la alcanza, imprime en la cocina. Por eso esta pantalla no es una lista de ajustes cualquiera — es donde se declara que el aparato está en la VLAN de hardware y con IP fija, sin lo cual no se enciende.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo entero antes de empezar):
- `packages/contracts/src/impresoras.ts` (12 pruebas): `ImpresoraSchema` (id, nombre, `oficio` COCINA/CAJA/BARRA, `ip` **solo de red local**, puerto, `ancho` 58 u 80, `enVlanDeHardware`, `ipFija`, `activa`), `ImpresorasSchema` y `ImpresoraCommandSchema` (`AÑADIR`, `EDITAR`, `RETIRAR`, `ACTIVAR`, `SIN_COCINA`).
- Lo que el contrato impide, y que **no tienes que volver a comprobar con `if`**: una IP que no sea `192.168.x.x`, `10.x.x.x` o `172.16-31.x.x`; dos impresoras en la misma dirección y puerto; encender una sin VLAN o sin IP fija; y quedarse sin impresora de cocina **sin decirlo** —para eso está `sinImpresoraDeCocina`: operar sin papel es legítimo (el KDS manda, el papel es respaldo) pero tiene que ser una decisión escrita—.

EL PATRÓN A COPIAR: `apps/web/src/features/cash/MediosScreen.tsx` y `MediosProvider.tsx` —lista de aparatos con formularios y el motivo del contrato junto al formulario que lo provocó— y `apps/web/src/features/cash/ReciboDialog.tsx`, que ya pinta un recibo en papel (`ReciboImpreso`) y es de donde sale la vista previa. Léelos antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/impresoras.ts`
   - `IMPRESORAS_DEMO: ImpresorasDto = ImpresorasSchema.parse({ ... })` con dos aparatos coherentes con el local: la de **cocina** (80 mm, la que saca las comandas) y la de **caja** (58 mm, recibos), las dos en `192.168.10.x`, puerto 9100, en la VLAN y con IP fija, activas. `sinImpresoraDeCocina: false`.
   - Cabecera diciendo que son datos inventados hasta F0-04 y que imprimir de verdad es del servidor (F1-10, ADR-015).

2. NUEVO `apps/web/src/features/restaurante/ImpresorasProvider.tsx` («use client»)
   - Igual que `MediosProvider`: contexto `{ config: ImpresorasDto; aplicar(cmd: ImpresoraCommand): string | null }`, clave de `sessionStorage` `"l2:impresoras:v1"`, `safeParse` al cargar, **validación fuera del actualizador de estado de React**, y el mensaje del contrato de vuelta cuando rechaza.
   - `TODO(F1-10/backend)`: la cola de impresión con sus estados `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO` es del servidor (ADR-015); aquí solo se configura a qué aparato se le habla.

3. NUEVO `apps/web/src/features/restaurante/ImpresorasScreen.tsx` («use client»)
   - `<Container ancho="panel">` y `<PageHeader>` con migas Abby Kingdom / Configuración / Impresoras.
   - **La lista**: cada impresora con su oficio, su dirección (`192.168.10.21:9100`, en `tnum font-mono`), su ancho y si está encendida. Añadir, editar y retirar.
   - **Las dos garantías de red** son dos interruptores con su explicación corta —qué pasa si no están—, no dos casillas sueltas. Cuando falten, la pantalla dice por qué no se puede encender: el motivo viene del contrato.
   - **Vista previa del recibo y de la comanda, en los dos anchos** (F1-12). Reutiliza `ReciboImpreso` con un recibo de ejemplo y pinta el papel a su ancho real: 58 mm y 80 mm no son lo mismo y hay que poder compararlos de un vistazo. La comanda puede ser una maqueta sencilla con dos platos y una nota.
   - **«Imprimir prueba»**: simulado. Emite el evento `impresora.fallo` o su contrario con `sim.emitir` (`apps/web/src/features/simulacion/SimulacionProvider.tsx`) para que el resto del local se entere, y deja claro en la pantalla que es una prueba simulada, no papel de verdad.
   - **Si no hay impresora de cocina**, un aviso que se lee: las comandas no salen en papel y la cocina depende del KDS. Con `sinImpresoraDeCocina` encendido el aviso cambia de tono: ya no es un descuido, es la decisión del local.
   - Superficie de administración (32 px), tokens de color, `tnum` en direcciones y cifras, sin emoji.

4. NUEVO `apps/web/src/features/restaurante/ImpresorasPage.tsx` («use client»)
   - Envoltura mínima como `apps/web/src/features/cash/TasasPage.tsx`. Quien no tenga `catalogo.modificar` ve la configuración pero no la cambia. `can` devuelve una palabra, no un booleano.

LO QUE **NO** TOCAS (lo monta la maestra al integrar):
- `apps/web/app/layout.tsx`, `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` y `navigation.ts`.
Deja `ImpresorasPage` exportada y lista, y dilo en el resumen.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`). Si crees que falta algo, **dilo en el resumen**.
- No intentes imprimir de verdad, ni abrir `window.print()`, ni hablar con ninguna IP. Esta pantalla **configura**; imprimir es del servidor (ADR-015).
- No dupliques las reglas del contrato con `if`: la pantalla pide, el contrato decide y la pantalla enseña el motivo.
- No toques la caja, ni la cocina, ni las pantallas de tasas, medios de pago o impuestos.
- Ningún emoji. Colores solo desde los tokens. Estado por color + icono + texto.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; **no leas archivos con la terminal**). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: añadir una impresora con IP pública y ver el mensaje del contrato; encender una sin marcar la VLAN y ver que no se aplica; retirar la de cocina sin declarar que se opera sin papel y ver que tampoco; declararlo y ver que entonces sí, con el aviso cambiando de tono; comparar las dos vistas previas de 58 y 80 mm; y medir a 1366×768 y 1024×768.
