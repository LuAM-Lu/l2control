Construye «Personas → Representantes y niños»: el directorio de familias del parque. Es la parte C de la tarea 4.5 del plan final (docs/PLAN-FRONTEND.md) y cubre F5-01, con las decisiones DEC-9, DEC-27 y DEC-28.

QUÉ ES ESTA SECCIÓN, EN UNA FRASE: **lo que hace rápida la visita siguiente**. En la puerta solo se teclea el teléfono del representante (DEC-27): con él, la familia que ya vino aparece sola y no se vuelve a registrar. Este directorio es la memoria de esas familias, el sitio donde se corrige lo que se tecleó mal y donde se les pone nombre a los niños que entraron solo con su pulsera (DEC-28).

QUÉ NO ES: DEC-9 fijó **lo menos sensible que permite operar**: nombre, apodo opcional, edad opcional y una referencia de contacto para una urgencia. Sin documento de identidad, sin dirección, sin foto. El contrato no admite nada más, y la pantalla tampoco debe pedirlo.

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- En `@l2/contracts` (packages/contracts/src/park.ts), con pruebas: `RepresentanteSchema` (id, fullName, contactReference, `kids` con su id, `visitas` y `ultimaVisita` opcional), `DirectorioRepresentantesSchema` (dos familias no comparten contacto, ni escrito de otra forma; sin visitas no hay última visita) y `RepresentanteCommandSchema` (`CORREGIR_REPRESENTANTE` y `CORREGIR_NINO`; no hay «borrar» y no piden motivo: son correcciones de tecleo). Léelos enteros.
- **El nombre de un niño es opcional** (DEC-28): `KidSchema.name` puede faltar, y por eso el directorio tiene que saber pintar a un niño que todavía no tiene nombre. `CORREGIR_NINO` sirve para las dos cosas: corregir un nombre y ponérselo por primera vez.

EL PATRÓN A COPIAR: `apps/web/src/features/identity/UsuariosScreen.tsx` (lista densa con buscador, detalle al lado, hoja para editar) y `apps/web/src/features/park/TarifarioProvider.tsx` (proveedor). Léelos antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/representantes.ts`
   - `DIRECTORIO_DEMO: DirectorioRepresentantesDto = DirectorioRepresentantesSchema.parse({ representantes: [...] })` con cinco familias inventadas, coherentes con lo que ya existe: usa los nombres y teléfonos de `DEMO_GUARDIANS` (apps/web/src/demo/parque.ts) y, como niños, los que aparecen en las estancias de ese mismo archivo (nombre y apodo). Visitas entre 1 y 12; una familia con `visitas: 0` y **sin** `ultimaVisita`, y **una familia con un niño sin nombre**, que es lo que deja una entrada rápida (DEC-28): las dos son casos reales que la pantalla tiene que saber pintar.
   - Cabecera diciendo que son datos inventados hasta F0-04 y que el servidor los contará de verdad (las visitas salen de las estancias, no se teclean).

2. NUEVO `apps/web/src/features/park/RepresentantesProvider.tsx`
   - Patrón de `TarifarioProvider`: contexto `{ directorio: DirectorioRepresentantesDto; corregir(cmd: RepresentanteCommand): string | null }`, clave de `sessionStorage` `"l2:representantes:v1"`, `safeParse` al cargar.
   - `corregir` valida el mando con `RepresentanteCommandSchema`, aplica el cambio y **vuelve a validar el directorio entero** con `DirectorioRepresentantesSchema` antes de guardarlo: si el contacto nuevo choca con el de otra familia, no se aplica y devuelve el mensaje del contrato (devuelve `null` cuando todo fue bien).
   - Valida **fuera** del actualizador de estado de React: calcula el directorio nuevo, compruébalo, y solo entonces llama a `setState`. Un `throw` dentro del actualizador rompe el pintado y no hay `try/catch` que lo recoja.
   - `TODO(F5-01/backend)`: el directorio vendrá del servidor y las visitas se calcularán con las estancias.

3. NUEVO `apps/web/src/features/park/RepresentantesScreen.tsx` («use client»)
   - `<Container ancho="panel">` y `<PageHeader>` con migas Abby Kingdom / Personas / Representantes y niños.
   - **Buscador** por nombre de la familia, de un niño o por teléfono (sin acentos y sin guiones: normaliza como hace `filtrarCola` en `apps/web/src/features/cash/ColaCuentas.tsx`). Con el buscador vacío se ven todas, ordenadas por última visita, las más recientes arriba.
   - **Lista**: por familia, su nombre, el contacto, cuántos niños y las visitas («12 visitas · última el 16/09»). Una familia sin visitas lo dice con palabras («sin visitas todavía»), no con un cero suelto.
   - **Detalle** de la familia elegida, al lado: sus niños (nombre, apodo y edad si la hay) y el contacto. Botón «Corregir» en la familia y en cada niño, que abre una `<Sheet>` montada con `key`, con los campos del contrato y el error junto al campo cuando el proveedor lo devuelve.
   - **Un niño sin nombre** se pinta como lo que es, no como un hueco: «Sin nombre todavía» en tono neutro (`text-ink-3`, nunca `state-crit` ni `state-warn`: no es un error, entró así a propósito) y el botón de esa fila dice **«Poner nombre»** en vez de «Corregir». Es el mismo mando `CORREGIR_NINO`.
   - Estado vacío con texto («Nadie con ese nombre», «Todavía no hay familias registradas»).
   - Superficie de administración (32 px), tokens de color, `tnum` en cifras y fechas, formato de hora de 12 h, sin emoji.
   - Quién entra: la sección hereda `parque.verContacto` del módulo, así que quien la abre ya puede ver el teléfono. No hace falta enmascarar aquí; no inventes otro permiso.

4. NUEVO `apps/web/src/features/park/RepresentantesPage.tsx` («use client»)
   - Envoltura mínima, como `apps/web/src/features/identity/AccesosPage.tsx`: lee la sesión y pinta la pantalla. Sin sesión, no pinta nada.

LO QUE **NO** TOCAS (lo monta la maestra al integrar, porque otras obreras trabajan a la vez en esos archivos):
- `apps/web/app/layout.tsx` (montar el proveedor),
- `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` (la ruta de la sección),
- `apps/web/src/features/shell/navigation.ts` (el enlace del menú).
Deja `RepresentantesPage` exportada y lista para montarse, y dilo en el resumen.

NO HAGAS:
- No toques `packages/`, ni la entrada (`CheckInScreen.tsx`), ni la salida, ni el monitor de sala: se están rediseñando en otros encargos.
- No añadas campos que DEC-9 no autorizó, ni un botón de borrar.
- No inventes visitas editables: son un dato del servidor.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; no leas archivos con la terminal). Resume qué hiciste en cada punto.

CÓMO LO PROBARÁ LA MAESTRA: buscar por teléfono sin guiones; ponerle nombre al niño que no lo tiene; corregir un apodo; y dar a una familia el teléfono de otra, que el contrato debe rechazar con su mensaje.
