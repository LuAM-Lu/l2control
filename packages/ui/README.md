# @l2/ui

Biblioteca de componentes. Implementa §9.4 del plan.

## Qué resuelve

Que las superficies operativas —caja, mesas, monitor de parque— se vean y se comporten igual sin
copiar código, y que las reglas de §8 (contraste, objetivos táctiles, estado por color + icono
+ texto) se cumplan por construcción en lugar de por memoria.

## Los tres niveles

**Nivel 1 · primitivos** — base sin dominio: `Button`, `Badge`.
Un primitivo no acepta colores literales, solo tokens. Y el tamaño se elige por **superficie**
(`pos` 56 px, `tablet` 48 px, `admin` 32 px; el de 64 px, `kds`, queda de la pantalla de cocina retirada con
ADR-022), no por gusto: §8.4 fija esos mínimos
porque esto se usa de pie, con prisa y a veces con guantes.

**Nivel 2 · patrones** — composiciones reutilizables, todavía sin dominio:

| Patrón | Resuelve |
|---|---|
| `StatusCard` | Tarjeta con banda de estado superior, altura uniforme y ranura de avatar |
| `TimeBar` | El tiempo **se ve**, no solo se lee. Excedente en zona aparte; `indeterminate` para lo que no tiene objetivo |
| `CountdownDisplay` | Cifra grande y tabular. Recibe el instante; no lleva reloj propio |
| `StatTile` | Cifra de cabecera legible de un vistazo |
| `Initial` | Ancla visual para encontrar a alguien entre doce tarjetas |
| `MoneyDisplay` | Única vía autorizada para mostrar dinero |
| `ScannerField` | Buffer global del lector HID, con validación de formato; «Escribir» el código a mano por el mismo camino (T-15) |
| `Marquesina` | Un texto de un renglón que no cabe se desliza y vuelve en vez de cortarse; con movimiento reducido, se parte (T-15) |
| `ConnectionBadge` | Nivel de degradación N0-N3 **en palabras** |
| `EmptyState` | Vacío explícito; los estados ocultos son antipatrón |
| `Resumen`, `Cifra` | Las 2 a 4 cifras de cabecera de una pantalla de Ajustes que llevan a su sitio (M-17) |
| `FiltroSegmentado`, `BarraDeFiltros` | Filtros con su cuenta y «Limpiar filtros» (M-17) |
| `Paginacion` | Una lista que crece va por páginas (10/20/50), nunca sin fin (M-17) |
| `Confirmacion` | Diálogo para lo irreversible: dice qué pasa, «Cancelar» y la acción |

**Nivel 3 · funcionalidad** — vive en `apps/web/src/features/<contexto>`, **no aquí**.

## La jerarquía: texto e iconos (T-16)

Los tamaños tienen nombre de trabajo, no de píxel, y viven en `packages/config/tokens.css`: quien escribe una
pantalla elige «título de sección», no «18 px». Entre un escalón y el siguiente hay al menos un 12 %; con menos, dos
títulos de distinto rango se leen iguales.

| Clase | Tamaño | Para |
|---|---|---|
| `text-pagina` | 28 px | El título de la pantalla, uno por pantalla (`PageHeader`, Inicio) |
| `text-seccion` | 18 px | El título de un bloque o de una capa (`Dialog`, `Sheet`, `EmptyState`) y el nombre en una tarjeta que se lee a distancia (`StatusCard`) |
| `text-tarjeta` | 16 px | El título de una tarjeta de panel |
| `text-subtitulo` | 15 px | La frase bajo el título de la pantalla |
| `text-cuerpo` | 14 px | El texto de trabajo |
| `text-detalle` | 13 px | Lo secundario: la descripción de una capa, un subtítulo de tarjeta |
| `text-nota` | 12 px | Pistas bajo un campo, migas, horas |
| `text-etiqueta` | 11 px | En mayúsculas y espaciada (el espaciado va en el token): nombra un dato sin competir con él |
| `text-cifra` | 24 px | La cifra de cabecera que se compara de un vistazo (`StatTile`) |

El título de página bajó de 32 a 28 px: a 1366×768 cada píxel de alto cuenta y 28 ya domina. Los importes grandes del
cobro tienen su escalado propio (6 a 8 cifras en bolívares, CLAUDE.md).

Los iconos crecen con el objetivo táctil de su superficie (§8.4), no por gusto: `--icono-pos` 20 px (caja),
`--icono-tablet` 18, `--icono-admin` 16, `--icono-texto` 14 (dentro de una frase) y `--icono-etiqueta` 12. En CSS,
`size-(--icono-pos)`; para el `size` de un icono, `TAMANO_ICONO.pos` y sus hermanos, que dicen lo mismo en números.

El ancho también es uno: `Container` con `panel` mide lo mismo que Inicio (1600 px), así que al pasar de una sección a
otra el contenido no encoge ni deja márgenes vacíos.

## Qué NO le corresponde

**No conoce el dominio.** Un componente recibe datos y emite eventos; no sabe qué es una
estancia ni una comanda. `MoneyDisplay` recibe una cadena ya formateada, no un `Money`, justo
para no cruzar esa frontera. Si un componente necesita saberlo, pertenece al nivel 3.

`pnpm arch` falla si este paquete importa `@l2/domain-*`.

## La regla de las tres veces

Un componente sube a `patterns` cuando lo pide un **tercer** uso real, no cuando alguien
anticipa que hará falta. Duplicar dos veces sale más barato que la abstracción equivocada.

## Aviso para quien añada clases aquí

Este paquete llega a `apps/web` por symlink dentro de `node_modules`, que Tailwind excluye del
escaneo por defecto. `apps/web/app/globals.css` lo incluye con `@source`. **Si se crea otro
paquete con componentes, hay que añadir su `@source` o sus clases no se generarán** — y el
fallo es silencioso: el componente se monta, no da error, y no se pinta.
