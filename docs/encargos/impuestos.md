Construye «Configuración → Impuestos»: las alícuotas de IVA con su vigencia y el IGTF. Es la tarea 4.8 del plan final (docs/PLAN-FRONTEND.md) y cubre F3-06 y F3-07, con §5.3.

POR QUÉ: hoy las alícuotas están escritas en `apps/web/src/demo/caja.ts` y entran a la caja como propiedades desde la ruta. Un impuesto **no es una constante**: es un dato con fecha. Cuando el IVA cambie —y va a cambiar—, tiene que poder cambiarse tecleando, sin desplegar; y **sin reescribir el pasado**, porque la factura del mes pasado se calcula con la alícuota que tenía.

⚠ AVISO QUE VA EN LA PANTALLA: los valores de hoy (16 %, 8 %, 3 %) son **los de trabajo, no una afirmación sobre la normativa vigente**. Los confirma el contador del cliente (DEC-1, todavía abierta). La pantalla tiene que decirlo donde se lee, no esconderlo.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo entero antes de empezar):
- `packages/contracts/src/impuestos.ts` (14 pruebas): `VigenciaIvaSchema` (code, basisPoints, desde, hasta nulo = abierta), `ImpuestosSchema` (las vigencias más `igtfBasisPoints` y `igtfDesde`) y `ImpuestoCommandSchema` (`PROGRAMAR_IVA` y `PROGRAMAR_IGTF`, cada uno con `por`).
- Lo que el contrato impide, y que **no tienes que volver a comprobar con `if`**: dos vigencias del mismo impuesto pisándose, un «exento» que no sea cero, quedarse sin vigencia abierta para alguno de los tres tratos, y una vigencia que termine antes de empezar. Tampoco existe editar ni borrar: se programa la siguiente.
- `@l2/domain-tax` ya calcula: `findRule(rules, code, at)` elige la regla aplicable a un instante y `computeDocument` la usa. **No repitas esa elección en la pantalla.**

EL PATRÓN A COPIAR: `apps/web/src/features/cash/TasasProvider.tsx` y `TasasScreen.tsx` — es la misma forma (un histórico que no se reescribe, con lo vigente arriba y lo programado debajo). Léelos enteros antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/impuestos.ts`
   - `IMPUESTOS_DEMO: ImpuestosDto = ImpuestosSchema.parse({ ... })` con las tres vigencias abiertas que hoy están en `DEMO_TAX_RULES` (GENERAL 1600, REDUCIDA 800, EXENTA 0) y el IGTF en 300, todas con `desde` **fijo y en el pasado** —nada de `Date.now()` en este archivo, que lo lee el servidor al pintar—.
   - Añade **una vigencia programada para el futuro** (por ejemplo, GENERAL al 1400 dentro de un mes, con la actual cerrada ese mismo día) para que el caso «hay un cambio en camino» se vea en pantalla.
   - Cabecera repitiendo el aviso de DEC-1: los valores los confirma el contador.

2. NUEVO `apps/web/src/features/cash/ImpuestosProvider.tsx` («use client»)
   - Igual que `TasasProvider`: contexto `{ impuestos: ImpuestosDto; aplicar(cmd: ImpuestoCommand): string | null }`, clave de `sessionStorage` `"l2:impuestos:v1"`, `safeParse` al cargar, **validación fuera del actualizador de estado de React**.
   - `PROGRAMAR_IVA`: cierra la vigencia abierta de ese trato en la fecha nueva (`hasta = desde`) y añade la nueva abierta. Nunca modifica una vigencia que ya terminó.
   - `PROGRAMAR_IGTF`: cambia `igtfBasisPoints` e `igtfDesde`.
   - Si el contrato rechaza el resultado, devuelve su mensaje y no aplica nada.
   - Expón `useImpuestos()` y un ayudante `useReglasDeIva(): TaxRule[]` que traduzca las vigencias a lo que espera `@l2/domain-tax` (`effectiveFrom`/`effectiveTo` son **epoch en milisegundos**, no ISO). Esa traducción vive en **un solo sitio**.
   - `TODO(F3-06/backend)`: la tabla vendrá del servidor.

3. NUEVO `apps/web/src/features/cash/ImpuestosScreen.tsx` («use client»)
   - `<Container ancho="panel">` y `<PageHeader>` con migas Abby Kingdom / Configuración / Impuestos.
   - **Arriba, lo que rige hoy**: los tres tratos del IVA con su alícuota, y el IGTF. Grande y legible; el porcentaje se escribe como lo lee una persona (16 %), aunque por dentro sean puntos básicos.
   - **Si hay un cambio programado**, se ve y se dice desde cuándo: «Desde el 18 de octubre, 14 %». Es el dato que más importa de esta pantalla.
   - **El historial** de cada trato, del más reciente al más antiguo, con quién lo programó. Sin botones de editar ni de borrar, y la pantalla lo dice con palabras: corregir un error es programar otra vigencia.
   - **Programar un cambio**: el trato, la alícuota en porcentaje y la fecha desde la que rige. Convierte a puntos básicos al enviar (14 % → 1400) sin usar flotantes para la cifra que se guarda.
   - El aviso de DEC-1 va visible, no en un `title`.
   - Superficie de administración (32 px), tokens de color, `tnum` en todas las cifras, sin emoji.

4. NUEVO `apps/web/src/features/cash/ImpuestosPage.tsx` («use client»)
   - Envoltura mínima como `TasasPage.tsx`. Quien no tenga `catalogo.modificar` ve la tabla pero no la cambia. `can` devuelve una palabra —`PERMITIDO`, `REQUIERE_AUTORIZACION`, `DENEGADO`—, no un booleano.

5. QUE LA CAJA CALCULE CON LO PUBLICADO
   - `apps/web/src/features/cash/CajaScreen.tsx` recibe hoy `rules` e `igtfBasisPoints` como propiedades. Que los lea del proveedor (`useReglasDeIva()` y el IGTF del contexto) y **quita esas dos propiedades**, junto con las líneas correspondientes de `apps/web/app/(estacion)/caja/page.tsx`.
   - No toques `computeDocument` ni `computeIgtf`: siguen recibiendo lo mismo, solo que ahora viene de la configuración.
   - Comprueba que el IVA que sale en el ticket cambia al programar una alícuota **con fecha de hoy**, y que una programada para el mes que viene **no** cambia nada todavía. Eso es lo que prueba que la vigencia funciona.

LO QUE **NO** TOCAS (lo monta la maestra al integrar):
- `apps/web/app/layout.tsx`, `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` y `navigation.ts`.
Deja `ImpuestosPage` exportada y lista, y dilo en el resumen.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`). Si crees que falta algo, **dilo en el resumen** en vez de rodearlo.
- No escribas ninguna alícuota a mano en la caja, ni como valor por defecto ni como respaldo.
- No elijas tú la regla aplicable a una fecha: eso es `findRule` de `@l2/domain-tax`, que ya está probado.
- No uses `parseFloat` ni `toFixed` para la alícuota que se guarda: entra como porcentaje que teclea una persona y se guarda en puntos básicos enteros.
- No añadas editar ni borrar una vigencia.
- Ningún emoji. Colores solo desde los tokens.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; **no leas archivos con la terminal**). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: programar el IVA general al 14 % desde hoy y ver que el ticket de la caja cambia; programarlo para dentro de un mes y ver que **no** cambia todavía y que la pantalla anuncia el cambio; intentar un 120 % y ver el mensaje del contrato; comprobar que el historial no ofrece borrar; y medir a 1366×768 y 1024×768.
