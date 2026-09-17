Construye «Configuración → Sucursal»: los ajustes del local que hoy están escritos a mano en el código. Es la tarea 4.7 del plan final (docs/PLAN-FRONTEND.md), y cubre F2-03, F5-08b, F4-04c y F6-13 (decisión D8).

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- El contrato `AjustesSucursalSchema` en `@l2/contracts` (packages/contracts/src/sucursal.ts), con sus pruebas. Léelo entero antes de escribir nada: datos fiscales, `formatoHora` («12h» o «24h»), `horario` de los siete días —`CERRADO` es un caso con nombre y el cierre no cruza la medianoche—, `maxRetenido` (dinero, en la moneda funcional y mayor que cero) y `servicio` (`SIN_SERVICIO` o `SUGERIDO` con puntos básicos). Exporta también `HorarioDelDiaSchema`, `ServicioSchema`, `DiaSemanaSchema` y sus tipos.
- La sección del panel ya existe en el mapa (`configuracion/sucursal`, tarea F5-08b): hoy enseña la pantalla de «por construir».

EL PATRÓN A COPIAR, ENTERO: `apps/web/src/features/park/TarifarioProvider.tsx` y `apps/web/src/features/park/EditorTarifario.tsx` (proveedor con `publicar`; editor con borrador, deshacer, rehacer, «Descartar cambios» y «Publicar», con el error del contrato visible junto al botón). Léelos antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/sucursal.ts`
   - `AJUSTES_DEMO: AjustesSucursalDto = AjustesSucursalSchema.parse({...})` con: branchId "b1", nombre «Abby Kingdom», un RIF de ejemplo (`J-40123456-7`), una dirección fiscal inventada de Venezuela, `monedaFuncional: "USD"`, `formatoHora: "12h"`, horario de los siete días (abierto de 10:00 a 20:00, domingo cerrado), `maxRetenido` igual al valor que hoy usa la caja (`DEMO_MAX_RETAINED` de `apps/web/src/demo/caja.ts`, `$ 0.05`) y `servicio: { kind: "SIN_SERVICIO" }`.
   - Cabecera explicando que son datos inventados hasta F0-04.

2. NUEVO `apps/web/src/features/sucursal/SucursalProvider.tsx`
   - Copia el patrón de `TarifarioProvider`: contexto `{ ajustes: AjustesSucursalDto; publicar(a: AjustesSucursalDto): void }`, clave de `sessionStorage` `"l2:sucursal:v1"`, `safeParse` al cargar y `parse` al publicar, `useSucursal()` que lanza un Error claro fuera del proveedor, y el `TODO(F2-03/backend)`.

4. NUEVO `apps/web/src/features/sucursal/EditorSucursal.tsx` («use client»)
   - Pantalla del panel con el estilo de `EditorTarifario`: `<Container ancho="panel">`, `<PageHeader>` con migas Abby Kingdom / Configuración / Sucursal, y las acciones Deshacer · Rehacer · Descartar cambios · Publicar.
   - **El local**: nombre, RIF (el error del contrato junto al campo), dirección fiscal, teléfono opcional. La moneda funcional se muestra como dato fijo («Dólar estadounidense (USD)») con una línea que explique que cambiarla es una decisión del plan (DEC-2), no un ajuste.
   - **Horario**: los siete días en filas. Cada día, un conmutador Abierto | Cerrado y, si abre, dos campos de hora (`type="time"`). Cerrar antes de abrir se rechaza junto a la fila, con el mensaje del contrato.
   - **Formato de hora**: dos opciones, 12 h y 24 h, con un ejemplo vivo al lado («2:00 pm» / «14:00»). Di en una línea que cambia **todas** las pantallas.
   - **Caja**: `maxRetenido` como monto en dólares (texto, acepta coma; usa `fromMajor` dentro de try/catch y enseña el error junto al campo). Explica en una línea qué es: lo máximo que la caja puede quedarse cuando no hay vuelto exacto.
   - **Servicio y propina**: elegir entre «Sin servicio» y «Sugerido», y en el segundo caso el porcentaje (entero, en la pantalla se escribe «10 %» y en el dato son 1000 puntos básicos). Una línea: es un ajuste del local (D8), no un paso del cobro, y hoy no se cobra automáticamente.
   - Superficie de administración (objetivos de 32 px), tokens de color, estado con color + icono + texto, cifras con `tnum`, sin emoji.
   - Igual que el editor de tarifas: el borrador es local y solo «Publicar» lo pone en servicio, validando con `AjustesSucursalSchema.safeParse` y enseñando el primer error si falla.

5. Que las pantallas usen lo publicado
   - **La caja** deja de recibir `maxRetained` por props desde `app/(estacion)/caja/page.tsx`: lo toma de `useSucursal()` dentro de `CajaScreen` (quita la prop y su tipo; en la página, deja de pasar `DEMO_MAX_RETAINED`). Si `DEMO_MAX_RETAINED` queda sin uso, déjalo en el archivo de demo con un comentario de que ahora vive en los ajustes.
   - **El formato de hora**: `CheckoutScreen` y `ParkChildCard` ya aceptan `timeFormat` con `DEFAULT_TIME_FORMAT` por defecto. Haz que quien los usa se lo pase desde los ajustes: en `CheckoutScreen`, tómalo de `useSucursal()` en lugar del valor por defecto; en `ParkMonitor` (que es quien pinta las tarjetas), pásaselo a cada `ParkChildCard`. No cambies `time-format.ts` ni el valor por defecto.

LO QUE **NO** TOCAS (lo hace la maestra al integrar, porque otra obrera trabaja a la vez en esos mismos archivos):
- `apps/web/app/layout.tsx` (montar el proveedor),
- `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` (la ruta de la sección),
- `apps/web/src/features/shell/navigation.ts` (el enlace del menú).
Deja el editor exportado y listo para montarse, y dilo en el resumen.

NO HAGAS:
- No toques `packages/` ni los contratos.
- No cambies el aforo ni las reglas del parque: viven en «Tarifas y paquetes».
- No inventes campos que el contrato no tenga: si algo falta, dilo en el resumen.
- No toques el monitor del servidor (`app/(estacion)/monitor/page.tsx`).

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra probará: publicar un cambio de formato de hora y verlo en la salida y en el monitor; subir el umbral y verlo en el aviso de la caja; un horario con cierre antes de la apertura, que no debe publicarse; y la pantalla a 1366×768 y 1024×768.
