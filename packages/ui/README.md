# @l2/ui

Biblioteca de componentes. Implementa §9.4 del plan.

## Qué resuelve

Que las superficies operativas —POS, KDS, monitor de parque— se vean y se comporten igual sin
copiar código, y que las reglas de §8 (contraste, objetivos táctiles, estado por color + icono
+ texto) se cumplan por construcción en lugar de por memoria.

## Los tres niveles

**Nivel 1 · primitivos** — base sin dominio: `Button`, `Badge`.
Un primitivo no acepta colores literales, solo tokens. Y el tamaño se elige por **superficie**
(`kds` 64 px, `pos` 56 px, `tablet` 48 px, `admin` 32 px), no por gusto: §8.4 fija esos mínimos
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
| `ScannerField` | Buffer global del lector HID, con validación de formato |
| `ConnectionBadge` | Nivel de degradación N0-N3 **en palabras** |
| `EmptyState` | Vacío explícito; los estados ocultos son antipatrón |

**Nivel 3 · funcionalidad** — vive en `apps/web/src/features/<contexto>`, **no aquí**.

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
