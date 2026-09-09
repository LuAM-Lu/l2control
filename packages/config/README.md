# @l2/config

Configuración compartida: tokens de diseño y base de TypeScript.

## Qué resuelve

Que exista **un solo sitio** donde viven los colores, la tipografía y los tamaños táctiles.
F1-06 lo exige y el lint lo comprueba: ningún color literal fuera de `tokens.css`.

## `tokens.css`

Implementa §8.2 y §8.3 del plan. Se consume desde `apps/web/app/globals.css`.

**Los colores de estado son reservados.** `state-ok`, `state-warn`, `state-crit` y `state-idle`
significan siempre lo mismo en todo el sistema. Nunca se reutilizan como color decorativo ni
como «serie 4» de un gráfico. Si el verde significa «en tiempo» en el tablero, no puede
significar otra cosa en otra pantalla.

**`brand` y `state-warn` son variables distintas aunque el tono se parezca.** §8.2 advierte de
ese conflicto: en las superficies operativas el ámbar pertenece **al estado**; la marca solo
aparece en la cabecera. Mezclarlas hace que el operador dude de qué es una alerta.

## `tsconfig.base.json`

`strict` más tres opciones que atrapan errores que `strict` deja pasar:

- **`noUncheckedIndexedAccess`** — `array[i]` puede ser `undefined`, y lo dice.
- **`exactOptionalPropertyTypes`** — distingue «propiedad ausente» de «propiedad con valor
  `undefined`». Ya atrapó un error real que el servidor de desarrollo no comprueba.
- **`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals/Parameters`**.

## Qué NO le corresponde

Componentes, lógica y utilidades. Es configuración, no código ejecutable.
