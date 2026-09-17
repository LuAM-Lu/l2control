Tres arreglos de navegación y objetivos táctiles: llegar a los otros puestos desde la barra de estación (N-06 de docs/AUDITORIA-NAVEGACION.md), los desplegables del menú lateral del panel a 32 px (F-09) y el chip DEMO a 48 px en las estaciones y el acceso (F-10 de docs/AUDITORIA-FRONTEND.md).

ARCHIVOS QUE PUEDES TOCAR: apps/web/src/features/shell/StationBar.tsx, apps/web/src/features/shell/BackOfficeShell.tsx y apps/web/src/features/identity/AccesoScreen.tsx. Nada más (otra obrera trabaja a la vez en Inicio, EnVivo, navigation.ts, layout.tsx y las pantallas del parque: no los toques).

1. N-06 · OTROS PUESTOS DESDE LA BARRA (StationBar.tsx)

   EL PROBLEMA: las pestañas de la barra salen de tres grupos fijos (`PUESTOS`: parque, caja, restaurante) y solo se ven las del grupo de la pantalla actual. Quien puede abrir /mesas no tiene cómo llegar desde /caja, salvo escribiendo la dirección. En un local de dos personas, «la cajera también atiende mesas» es lo normal.

   DISEÑO DECIDIDO (hazlo así):
   - Calcula `otros`: para cada puesto de `PUESTOS` distinto del actual (`encontrado`), sus superficies filtradas con `puedeAbrirRuta(actor, s.href)`; quita los puestos que queden vacíos. Sin actor, `otros` está vacío.
   - Si `otros` no está vacío, el conmutador del puesto (`<nav>`, línea ~183) gana un ÚLTIMO elemento en su `<ul>`: un botón de icono (`ArrowLeftRight` de lucide-react), `size-12`, `shrink-0` (no reparte ancho como las pestañas: `flex-none`), con `aria-label="Otros puestos"`, `title="Otros puestos"`, `aria-haspopup="dialog"` y `aria-expanded`. Mismo aspecto que una pestaña no activa (`text-ink-2 hover:bg-surface-2 hover:text-ink`, `rounded-[0.4rem]`).
   - Si la pantalla actual no tiene pestañas (`puesto` es null) pero `otros` sí tiene algo, el botón va solo, en el mismo sitio donde iría el `<nav>`, con el mismo aspecto.
   - Al pulsarlo abre un `<Sheet>` de @l2/ui (`abierto`, `onCerrar`, `titulo="Ir a otro puesto"`, `descripcion="Las superficies que tu rol puede abrir."`). Dentro, un bloque por puesto: el nombre del puesto como encabezado pequeño (h3, `text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase`) y debajo sus superficies como enlaces (`<Link>`) de `min-h-12`, a todo el ancho, con el nombre largo (`s.largo`) y el corto a la derecha en tenue; borde y fondo como las filas del panel (`rounded-[var(--radius-control)] border border-line bg-base/40 px-3 hover:border-brand/45`). Tocar un enlace cierra la hoja (`onClick={() => setOtrosAbierto(false)}`) y navega.
   - En la cuenta de «por cobrar»: si «Cobrar» aparece en la hoja y hay cuentas esperando, muestra el mismo contador que ya lleva la pestaña (reutiliza el marcado de la línea ~206).
   - El estado `otrosAbierto` se declara con los demás ganchos, ANTES del `return null` de /acceso (el orden de los ganchos no puede depender de la ruta; ya hay un comentario que lo dice).
   - Añade al comentario de cabecera del componente un punto 4 que explique N-06 en dos líneas.

2. F-09 · DESPLEGABLES DEL MENÚ LATERAL (BackOfficeShell.tsx, línea ~267)
   - El botón «Plegar/Desplegar» de cada módulo mide 28 px (`size-7`); la superficie del panel es admin: 32. Cámbialo a `size-8`. Comprueba que la fila del módulo no cambia de alto (si la fila medía menos de 32, dilo en el resumen).

3. F-10 · CHIP DEMO A 48 EN LAS SUPERFICIES TÁCTILES
   - `<ChipSimulacion />` mide 36 (`h-9`) y acepta `className` (se resuelve con tailwind-merge). En StationBar.tsx (línea ~252) pásale `className="h-12"`. En AccesoScreen.tsx (línea ~263), lo mismo.
   - En BackOfficeShell NO lo cambies: el panel es admin y 36 ya supera sus 32.

NO HAGAS:
- No cambies los grupos de `PUESTOS`, ni las reglas de quién ve qué (`puedeAbrirRuta`, `puedeVerInicio`), ni el botón «Panel».
- No uses `lg:` para la disposición de la barra: la barra decide con `apaisado:` (ya está así; respétalo).
- No toques ningún otro archivo.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra lo probará entrando como cajera, como monitora y como administración, a 1366×768, 960×600 y 768×1024.
