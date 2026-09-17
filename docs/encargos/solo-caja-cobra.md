Adapta las pantallas a la decisión DEC-25 del cliente: **solo la caja cobra** (lo del parque y lo del restaurante). La monitora de la taquilla registra entradas y salidas y la cuenta pasa a la cola de la caja, pero ya NO puede abrir /caja, /ventas ni /turno. Ver docs/PLAN.md §14 (DEC-25 y DEC-26).

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- La matriz de permisos (packages/domain/identity): la monitora ya no tiene `documento.emitir`, `documento.reimprimir` ni `cobro.anular`. La administración puede concedérselos en Configuración → Roles y accesos.
- El contrato de la salida: el destino «se paga ahora» se llama `{ kind: "CAJA" }` (antes `TAQUILLA`). CheckoutScreen ya usa el nombre nuevo.
- Para saber si quien está en la pantalla puede abrir la caja: `useActorEnSesion()` de apps/web/src/features/identity/sesion.ts y `puedeAbrirRuta(actor, "/caja")` de apps/web/src/features/identity/visibilidad.ts. Sin actor, trátalo como que NO puede.

EL PROBLEMA: al registrar, la entrada (prepago) y la salida (con algo por cobrar) llevan a /caja. La monitora ya no puede abrirla: se encontraría con la guardia de la estación.

QUÉ HACER:

1. apps/web/src/features/park/CheckInScreen.tsx
   - Calcula `puedeCobrar = actor !== null && puedeAbrirRuta(actor, "/caja")`.
   - Al registrar en PREPAGO (línea ~253): si `puedeCobrar`, como hoy (router.push a /caja con `cuenta` y `volver`). Si no, NO navegues: deja la pantalla lista para la siguiente familia y avisa con `avisar.ok` → texto «Cuenta enviada a caja: {familia}», detalle «{n} niño(s) · {total con formatMoneyVE}. Se cobra en la caja.».
   - El botón principal (línea ~490): en PREPAGO, «Registrar y cobrar» si `puedeCobrar`, «Registrar y enviar a caja» si no. En cuenta abierta, igual que hoy.
   - La opción «Pagar ahora» de «Cómo paga» (línea ~440): su detalle dice «Al salir, solo el tiempo de más»; no lo cambies.

2. apps/web/src/features/park/CheckoutScreen.tsx
   - Mismo `puedeCobrar`.
   - `confirmarSalida` (línea ~204): si hay cuentas por cobrar y `puedeCobrar`, como hoy. Si no puede, NO navegues: las cuentas ya quedaron guardadas en la cola; avisa con `anunciarCierre` (o `avisar.ok` con el mismo estilo) diciendo que se enviaron a la caja y cuánto suman.
   - El botón principal (línea ~440): si `puedeCobrar`, los textos de hoy («Cobrar $ X en caja» / «Enviar N cuentas a caja»); si no, «Enviar $ X a caja» (una cuenta) o «Enviar N cuentas a caja» (varias). Sin nada por cobrar, «Registrar salida sin cargo» en los dos casos.
   - Cambia el comentario de cabecera (línea ~45) que dice «cobrar en taquilla»: ahora es «enviar a la caja».

3. apps/web/src/features/cash/TurnoScreen.tsx y PuntosDeCobro.tsx — la pestaña «Por punto de cobro»
   - DEC-26 deja los turnos genéricos: el dominio sigue distinguiendo puntos de cobro, pero con DEC-25 lo normal es que todo entre por el mostrador.
   - En TurnoScreen (línea ~258), la pestaña «Por punto de cobro» solo aparece si en `tally.byPoint` hay MÁS DE UN punto con algo cobrado (`cobrado` distinto de cero o efectivo neto distinto de cero). Si no, se omite del arreglo de pestañas.
   - En PuntosDeCobro, pinta solo los puntos que tengan filas (no una tarjeta vacía de «Taquilla»).

4. apps/web/src/demo/turno.ts
   - Los movimientos de ejemplo con `origin: "TAQUILLA"` pasan a `origin: "MOSTRADOR"` (con DEC-25 todo se cobra en la caja). Actualiza el comentario de cabecera, que habla de «los dos puntos de cobro».
   - apps/web/src/demo/caja.ts: el comentario que dice «cobrada en taquilla» pasa a «cobrada en caja».

NO HAGAS:
- No toques packages/, la matriz, los contratos, StationBar ni la guardia de las estaciones.
- No cambies la lógica de las cuentas, los cálculos ni la cola de la caja.
- No toques ningún archivo que no esté en esta lista.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra lo probará entrando como monitora (Ana Rojas) y como cajera (Marisol Prieto): registrar un prepago en la entrada, una salida con excedente, y abrir el turno.
