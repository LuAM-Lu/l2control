# @l2/domain-printing

El ticket impreso y la cola de impresión (B5-2, ADR-015, ADR-026). Módulo puro: sin red, sin base y sin
reloj (las horas entran como argumento).

## Qué resuelve

- **El documento** (`documento.ts`): una plantilla dice qué renglones lleva (texto, par concepto–importe,
  línea, vacío; negrita y doble tamaño) y `componer` los ajusta a las columnas del papel: **32 en 58 mm y 48
  en 80 mm**. Alinear es rellenar con espacios; lo que no cabe se parte por palabras. `comoTexto` da la misma
  composición como texto: es la vista previa de la pantalla y lo que comparan las pruebas.
- **El ESC/POS** (`escpos.ts`): iniciar, página de códigos **850** (tildes, eñe, «¿», «¡»), negrita, doble
  tamaño, avanzar y cortar. Lo común a casi todas las térmicas. `PREGUNTA_PAPEL` (DLE EOT 4) y
  `problemaDePapel` leen el sensor del rollo.
- **La cola** (`cola.ts`): `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO`, cinco intentos con espera de 5, 10, 20
  y 40 s, 30 s para que el agente responda, y el reintento a mano desde cero.
- **Formatos** (`importe.ts`): importes, tasa y hora como los escribe la pantalla (`$ 1,234.56`,
  `Bs. 1.234,56`, `857,01`, `1:27 pm`), porque el servidor no puede importar `@l2/ui`.

## Qué NO le corresponde

- **Imprimir.** Mandar bytes a una IP es del agente (`apps/printer-agent`).
- **Las plantillas.** Qué dice un recibo o un corte lo arma `@l2/application` (`impresion/plantillas.ts`)
  desde lo que guardó el servidor; aquí solo se compone y se codifica.
- **Guardar la cola.** Sus estados viven en `print_job`; la base impide que lo impreso cambie.

```bash
pnpm test    # 14 pruebas
```
