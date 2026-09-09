# ADR-003 · Operación offline: degradación por niveles

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: infraestructura de F10. La topología quedó fijada en C por DEC-10.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** El plan v1 asume nube permanente en un entorno donde no la hay. Un POS que no factura
sin internet es un pasivo. **DEC-4 respondida por el cliente: cerrar no es una opción aceptable.**
**Decisión.** No se elige entre «todo en la nube» y «todo local»: se define **qué sigue funcionando en
cada nivel de degradación**, y el sistema lo anuncia en pantalla.

| Nivel | Situación | Qué sigue funcionando | Qué se detiene |
|---|---|---|---|
| **N0** | Todo bien | Todo | — |
| **N1** | Internet caído, LAN viva | Comandas, KDS, cronómetros de parque, pre-cuentas, cobro con tasa congelada del día | Sincronización de tasa BCV, respaldo remoto, reportes en nube |
| **N2** | Servidor local caído, terminales vivas | Consulta de la última vista en caché; cola local de comandas | Cobros y cierres |
| **N3** | Sin energía | Nada digital | Todo — se activa el **procedimiento manual en papel** de F12-08 |

**Implicación técnica.** Existe un **servidor en sitio** (mini-PC o NUC) que corre la aplicación y la
base de datos; la nube es réplica y respaldo, no la ruta crítica. Cada terminal mantiene una cola local
con **claves de idempotencia** para reenviar sin duplicar.
**Alternativas evaluadas.** Se compararon tres topologías antes de decidir:

| | **A · Nube pura + PWA con cola** | **B · Servidor en sitio + réplica** ✅ | **C · B + equipo en espera** |
|---|---|---|---|
| Mecanismo | Cada terminal cachea y encola escrituras en IndexedDB; sincroniza al volver | Un mini-PC en el local corre la aplicación, PostgreSQL y Valkey; la nube es réplica y respaldo | Igual que B, más un segundo mini-PC con réplica en caliente por *streaming* |
| ¿Cobra sin internet? | Sí, pero cada terminal aislada | **Sí, con normalidad** | Sí, con normalidad |
| ¿La cocina recibe la comanda? | **No.** El mensaje tendría que viajar a la nube y volver | Sí, por LAN | Sí |
| ¿Cronómetros coherentes entre terminales? | **No, divergen** | Sí, fuente única (ADR-010) | Sí |
| ¿Correlativo fiscal seguro? | **No: riesgo de huecos o duplicados** | Sí, asignado por la base bajo bloqueo | Sí |
| Si muere el servidor | — | Para todo hasta reponerlo | Se promueve el secundario en minutos |
| Costo de hardware | ~US$ 0 | **~US$ 300-500** una vez | ~US$ 550-850 una vez |

**Por qué se descarta A.** Sin un punto de coordinación en la LAN, el recorrido R4 se rompe: el mesero
envía la comanda y la cocina no la ve. Además, asignar correlativos fiscales sin coordinación central
produce huecos o duplicados, que es precisamente lo que la invariante I-07 prohíbe. La opción A solo
sirve con **una sola terminal**, y este negocio tiene mesero, cocina, caja y parque.

**Decisión adoptada: topología C.** Inicialmente se eligió B con ruta a C, pero **DEC-10 la elevó a C**:
el cliente fijó una tolerancia de **media hora** de operación en papel. Ese número descarta B como
estado final, porque conseguir, instalar y restaurar un equipo nuevo no cabe en 30 minutos; un segundo
mini-PC ya instalado y replicando, sí.

**Qué cubre cada pieza, por modo de fallo.** Es importante no confundirlos: cada uno tiene su remedio.

| Modo de fallo | Frecuencia | Remedio | Tiempo fuera |
|---|---|---|---|
| Internet caído | Alta | Topología B: todo corre en la LAN | **Cero** |
| Energía caída | Alta | UPS para servidor y red + tablets con batería | **Cero** durante 30-60 min |
| Muere el mini-PC principal | Baja | **Equipo en espera con réplica y promoción manual** | 2-5 min |
| Se pierde el local entero | Muy baja | Réplica y respaldo en la nube | Horas — fuera del alcance de este RTO |

**El *failover* es manual, con runbook, y esa es la recomendación, no una concesión.** Un failover
automático mal configurado provoca más caídas (por *split-brain*) de las que evita. La promoción manual
del secundario toma entre dos y cinco minutos con el procedimiento escrito delante, muy holgado dentro
de los 30 que fijó el cliente. Lo que sí es obligatorio es **ensayarla**: un runbook nunca ejecutado no
cuenta como plan de recuperación (F10-05).

**Cuándo entra el segundo equipo.** Durante el piloto no hace falta: el sistema corre en paralelo al
método anterior (F11-04), que ya es el respaldo. Pasa a ser **condición de salida en vivo** (F11-07b):
no se retira el método anterior hasta que el equipo en espera exista y su promoción esté ensayada.

**La otra mitad del problema: la energía.** Sin luz el servidor no sirve de nada, y v1 tampoco lo trataba.
Estrategia de mejor relación costo/beneficio, en este orden:

1. **UPS solo para servidor, router y switch** (~US$ 80-150). Mantiene el cerebro vivo 30-60 minutos.
   **No** se respaldan los monitores POS: consumen demasiado y hay una salida mejor.
2. **Tablets como terminal de contingencia.** Tienen batería propia; si se va la luz, el sistema sigue
   vivo y se opera desde tablets hasta que vuelva o se agote el UPS.
3. Esto **confirma ADR-015**: el KDS en pantalla es la fuente de verdad y el papel es respaldo, no al
   revés. Sin luz la impresora térmica muere; la tablet no.
4. Planta eléctrica o inversor para todo el local es otra escala de costo y es una decisión del negocio,
   no del software. Queda fuera de este plan.

**Consecuencias.** Más infraestructura que un SaaS puro, a cambio de que el negocio nunca deje de operar.
El mini-PC pasa a ser un activo crítico: exige el runbook de F10-03 (reinstalable desde cero por alguien
que no lo instaló) y la prueba de restauración de F10-05.
