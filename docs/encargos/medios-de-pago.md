Construye «Caja → Medios de pago»: qué se puede cobrar, por dónde, y con qué datos. Es la tarea 4.2 del plan final (docs/PLAN-FRONTEND.md) y cubre F4-02 y F4-04. La sección es nueva: la maestra ya la añadió al menú.

POR QUÉ: hoy la caja trae fijos en el código los seis medios, los dos terminales del punto de venta y —lo más delicado— **los datos que se le enseñan al cliente para que pague**: el banco, el teléfono y el RIF del Pago Móvil, y el correo de Zelle. El cliente teclea esos datos en su banco; un dígito mal es dinero que llega a otra cuenta. Eso no puede vivir en un archivo de código.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo entero antes de empezar):
- `packages/contracts/src/medios.ts` (16 pruebas):
  · `MedioDePagoSchema`: código en mayúsculas —lo referencian los pagos ya cobrados—, nombre, moneda, `triggersIgtf`, `canGiveChange`, `datos` opcional y **`activo`**. Un medio en USDT no puede dar vuelto.
  · `MediosDePagoSchema`: la configuración entera, con las reglas cruzadas que impiden un estado que parece válido y rompe el cobro — **tiene que quedar al menos un medio activo**; ofrecer Pago Móvil exige el banco, el teléfono y el RIF; ofrecer Zelle exige el titular y el correo; el punto de venta encendido exige al menos un terminal.
  · `MedioCommandSchema`: `ACTIVAR`, `DATOS_PAGO_MOVIL`, `DATOS_ZELLE`, `AÑADIR_TERMINAL`, `RETIRAR_TERMINAL`. **No existe borrar un medio**: se apaga.
- `PosTerminalSchema`, `TelefonoVeSchema` y `DocumentoVeSchema` ya existían en `packages/contracts/src/pagos.ts`: son las mismas reglas con las que la caja valida un pago.
- La sección ya está en `navigation.ts` (`/panel/caja/medios`, acción `catalogo.modificar`).

EL PATRÓN A COPIAR: `apps/web/src/features/cash/TasasProvider.tsx` y `TasasScreen.tsx` —la sección hermana, recién hecha— y `apps/web/src/features/sucursal/EditorSucursal.tsx` (borrador, descartar, publicar). Léelos antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/medios.ts`
   - `MEDIOS_DEMO: MediosDePagoDto = MediosDePagoSchema.parse({ ... })` construido con **lo que hoy está en el código**, sin inventar nada nuevo:
     · Los seis medios de `DEMO_TENDERS` (apps/web/src/demo/caja.ts), todos `activo: true`.
     · Los dos terminales de `DEMO_TERMINALES`.
     · `pagoMovil`: banco `0134`, teléfono `0414-2345678`, documento `J-40123456-7` — los que hoy están escritos dentro de `CajaScreen.tsx`.
     · `zelle`: titular «Parque Infantil L2 C.A.», correo `pagos@parquel2.com`, también de `CajaScreen.tsx`.
   - Cabecera diciendo que son datos inventados hasta F0-04 y que esto vendrá del servidor (F4-02).
   - **No borres `DEMO_TENDERS` ni `DEMO_TERMINALES`** todavía: los usa la ruta de la caja hasta el punto 5.

2. NUEVO `apps/web/src/features/cash/MediosProvider.tsx` («use client»)
   - Igual que `TasasProvider`: contexto `{ config: MediosDePagoDto; aplicar(cmd: MedioCommand): string | null }`, clave de `sessionStorage` `"l2:medios:v1"`, `safeParse` al cargar.
   - `aplicar` valida el mando, calcula la configuración nueva, la **vuelve a validar entera** con `MediosDePagoSchema` y solo entonces guarda. Devuelve el mensaje del contrato o `null`. **Valida fuera del actualizador de estado de React.**
   - Ahí está lo que hace útil este proveedor: apagar el último medio activo, o quitar el terminal que sostiene el punto de venta, **devuelve el motivo y no se aplica**. No lo compruebes tú con `if`: deja que lo diga el contrato.
   - Expón `useMedios()` y un ayudante `useMediosActivos()` que devuelva solo los activos, en el tipo `MedioPago` que ya usa la caja (`apps/web/src/features/cash/medios.ts`).
   - `TODO(F4-02/backend)`: la configuración vendrá del servidor.

3. NUEVO `apps/web/src/features/cash/MediosScreen.tsx` («use client»)
   - `<Container ancho="panel">` y `<PageHeader>` con migas Abby Kingdom / Caja / Medios de pago.
   - **Los medios**, en lista: nombre, moneda, si lleva IGTF, si da vuelto, y un interruptor de activo. Al apagar uno que no se puede apagar, el motivo del contrato aparece **en pantalla**, no en la consola.
   - **Los datos que ve el cliente**, en dos tarjetas —Pago Móvil y Zelle— con su formulario. El banco se elige de la lista que ya existe (`apps/web/src/features/cash/bancos.ts`, `BANCOS_VE`), no se teclea a mano. Enseña **una vista previa de cómo lo verá el cliente en la caja**: es lo que va a leer en voz alta la cajera.
   - **Los terminales del punto de venta**: lista con nombre y banco, añadir y retirar.
   - Si un medio está activo y le faltan sus datos, la pantalla lo dice antes de que el cliente se plante delante de la caja: color + icono + texto.
   - Superficie de administración (32 px), tokens de color, `tnum` en cifras, sin emoji.

4. NUEVO `apps/web/src/features/cash/MediosPage.tsx` («use client»)
   - Envoltura mínima, como `apps/web/src/features/cash/TasasPage.tsx`. Sin sesión, no pinta nada.
   - Quien no tenga `catalogo.modificar` (`can(actor, "catalogo.modificar")` de `@l2/domain-identity`) **ve la configuración pero no la cambia**. Recuerda que `can` devuelve una palabra —`PERMITIDO`, `REQUIERE_AUTORIZACION`, `DENEGADO`—, no un booleano.

5. QUE LA CAJA LEA LA CONFIGURACIÓN (la otra mitad del encargo)
   - `apps/web/src/features/cash/CajaScreen.tsx`:
     · Los medios y los terminales salen del proveedor (`useMediosActivos()`), no de las propiedades `tenders` y `terminales`: **quita esas dos propiedades** y las líneas correspondientes de `apps/web/app/(estacion)/caja/page.tsx`.
     · El bloque de datos de Pago Móvil (banco, teléfono, RIF) y el de Zelle (titular, correo) se pintan **con lo configurado**, incluido lo que se copia al portapapeles. El nombre del banco sale de `nombreDeBanco` (`bancos.ts`), no de una cadena escrita a mano.
     · Si un medio activo se queda sin sus datos, la caja **no lo ofrece**: es la misma regla fail-closed que ya aplica sin tasa.
   - No toques el cálculo del IGTF ni el del vuelto: `triggersIgtf` y `canGiveChange` siguen viniendo de cada medio, ahora configurados.

LO QUE **NO** TOCAS (lo monta la maestra al integrar):
- `apps/web/app/layout.tsx` (montar el proveedor),
- `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` (la ruta),
- `apps/web/src/features/shell/navigation.ts` (ya está hecho).
Deja `MediosPage` exportada y lista, y dilo en el resumen.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`). Si crees que falta algo en el contrato, **dilo en el resumen** en vez de rodearlo.
- No añadas un botón de borrar un medio. No existe en el contrato: un medio apagado sigue nombrando los pagos de ayer.
- No dupliques las reglas del contrato en la pantalla con `if`. La pantalla pide, el contrato decide y la pantalla enseña el motivo.
- No inventes datos bancarios nuevos: usa los que ya están en el código.
- No toques la pantalla de tasas ni su proveedor.
- Ningún emoji. Colores solo desde los tokens. Nada de `toFixed` ni de formatos de hora a mano.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; **no leas archivos con la terminal**). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: apagar Zelle y comprobar que desaparece de la caja; intentar apagar todos los medios y ver el motivo del contrato; quitar el último terminal con el punto de venta encendido y ver que no se aplica; cambiar el teléfono del Pago Móvil y comprobar que la caja enseña y copia el nuevo; escribir un teléfono inválido y ver el mensaje junto al campo; y medir a 1366×768 y 1024×768.
