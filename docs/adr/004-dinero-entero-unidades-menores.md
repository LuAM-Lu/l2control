# ADR-004 · El dinero se almacena como entero en unidades menores

- **Estado:** Implementada
- **Fecha:** 2026-09-08
- **Situación en el código:** `packages/domain/money`: `Money` con `bigint`; 14 pruebas, dos de propiedad.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Es el error irreversible más común. Un `Float` pierde centavos de forma silenciosa.
**Decisión.** Todo monto se almacena como **entero de la unidad menor** de su moneda (`BIGINT`),
acompañado **siempre** de su código de moneda ISO-4217. Nunca `Float`, nunca `Number` de JavaScript
para dinero, nunca un monto sin su moneda al lado.
**Por qué.** Es el estándar de la industria financiera. La aritmética entera es exacta; la binaria de
punto flotante no representa 0,1.
**Cómo.**
- Un tipo `Money = { amount: bigint; currency: CurrencyCode }`, no un número suelto.
- Las conversiones a unidades mayores ocurren **solo en los bordes**: entrada de usuario y presentación.
- La escala de cada moneda se valida contra su definición ISO (USD y VES: 2 decimales; ver DEC-5 para
  la política de redondeo del bolívar).
- Las operaciones aritméticas viven en **un solo módulo** (`packages/money`), y ese módulo prohíbe
  sumar dos `Money` de distinta moneda sin pasar por una conversión explícita con tasa.
**Consecuencias.** El sistema de tipos hace imposible sumar dólares con bolívares por accidente, que
es el bug que de otro modo aparece en el reporte del tercer mes.
