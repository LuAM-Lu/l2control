# L2 Control — documento maestro

> **El único documento vivo del proyecto.** Actualizado: **2026-09-29**.
>
> Aquí están el estado, la ruta hasta producción, lo que bloquea y el handoff. Nada de esto se escribe
> en otro sitio. Hay cuatro referencias que **no se editan** y se citan por sección:
>
> - [PLAN.md](PLAN.md): la especificación. ADRs, decisiones del cliente (DEC-n) y tareas `Fn-nn` con su
>   criterio de aceptación en §12. Sus casillas y sus enlaces a documentos retirados están congelados.
> - [FLUJOS.md](FLUJOS.md): cómo se mueven personas, pedidos y dinero en el local. El código lo cita.
> - [JORNADA.md](JORNADA.md): el día completo en cuatro momentos (primer encendido, apertura, jornada y
>   cierre), con lo decidido el 2026-09-27 (M-13). Se corrige cuando un paso resuelve algo suyo.
> - [adr/](adr/): las decisiones de arquitectura, una por archivo (25; ADR-018 supersede la biblioteca
>   de ADR-013, ADR-019 cambia la confirmación de la tasa automática de §5.2, ADR-020 cambia el TOTP
>   de ADR-018 por llaves de acceso, ADR-021 supersede la topología de ADR-003, ADR-022 retira la
>   pantalla de cocina de DEC-19, ADR-023 supersede ADR-012, ADR-024 retira el límite de cordura de
>   ADR-019 y ADR-025 concreta el tiempo real de ADR-008).
>
> Las reglas del código están en [CLAUDE.md](../CLAUDE.md).

**Documentos retirados el 2026-09-26.** PROGRESO, PENDIENTES, PLAN-FRONTEND, BITACORA, ORQUESTA,
`docs/README`, `encargos/` y `cerrados/` (entre ellos UX-MEJORAS y las dos auditorías). Su contenido
útil está resumido aquí. El código todavía cita «UX-MEJORAS §n» o «AUDITORIA-…», y esas citas se leen
en la historia de git:

```bash
git show e250c54:docs/cerrados/UX-MEJORAS.md     # o PROGRESO.md, BITACORA.md, encargos/<tarea>.md…
```

---

## 1. Dónde estamos

**Versión 0.30.1 · 30 de 55 pasos.** **Todo va en tiempo real (B5-1):** lo que pasa en un equipo llega a los
demás en menos de 2 s, sin sondeos. Toda escritura audita, y el asiento deja su evento en un outbox en la
misma transacción; nace `apps/worker`, que lo publica por Socket.io con adaptador Valkey a la sala de cada
sucursal (autorización con ticket en el apretón de manos), y cada pantalla vuelve a leer lo suyo con sus
permisos (ADR-025). Quién está en cada puesto sale de las sesiones de la base, el bus del restaurante viaja
por el worker y la barra dice si hay canal. La tasa del BCV se aplica siempre, salte lo que salte, y su
consulta vive en el worker (V-14, ADR-024). **El parque funciona contra el servidor (B4-1 a B4-3, M-14):**
la entrada registra en la base (con el nombre del niño si se quiere), la sala de cualquier equipo ve
a los niños con el reloj del servidor, se recarga tiempo, la salida liquida el tiempo de más en el
servidor y deja constancia de quién recogió al niño (D9), la caja recibe la cuenta y las estancias
huérfanas las cierra la dirección sin cobrar tiempo de más. Falta B4-4 (ajustes) para cerrar el Parque. **La caja cierra en el servidor (B3-5): lo previsto de la Etapa 3, hecho** (la visita técnica le suma B3-6 y B3-7). Arqueo a ciegas, corte X, corte Z que firma la cajera hasta $ 1,00 de diferencia y supervisión por encima, relevo, cierre de la jornada sin pendientes (cuentas, niños en sala, huérfanas y otros turnos), incobrables con 🔐 y el resumen del día en Inicio. Etapas 0, 1 y 2 hechas, y la versión ya se ve (T-1). En la Etapa 2 (dinero): las tasas
son de la base, se traen del BCV, se aplican solas con salvaguardas y llegan en vivo a toda pantalla
(B2-1c), los impuestos son de la base con su vigencia (B2-2) y **el libro de pagos existe en el
servidor (B2-3)**, a la espera de que la caja cobre contra él (B3-3), y **el día de negocio y los
feriados bancarios (B2-4)**. Etapa 3 (caja) empezada: el turno es real (B3-1) y sin él no se cobra, y **los medios de pago son de la base (B3-2)**: se añaden sin desplegar y los datos de cada pago se guardan cifrados. Etapa 9 empezada: **el catálogo de productos es de la base (B9-1)**, con el precio programado por día, y la caja vende de él. **Las cuentas son de la base (B3-3)**: familia, mesa y mostrador; la caja cobra y anula contra el libro en una transacción, con el total, la tasa y la autorización comprobados en el servidor; **cada cobro deja su venta (B3-4)** con la foto de lo cobrado, y reimprimir, anular y regalar quedan en el servidor con su autorización. Sin modo demo; lo provisional y lo simulado que queda está
inventariado en §5, y cada pieza tiene el paso que la elimina (M-11). La versión sigue M-10: el
número del medio cuenta los pasos entregados.

- **Infraestructura local:** `pnpm infra:up` (PostgreSQL 17 en el 5433, Valkey 8), `pnpm db:migrar`,
  `pnpm db:semilla` (local, equipo con PIN 1970, credenciales de Abigail, tarifario).
- **Servidor:** `@l2/database` (RLS forzada, solo-agregar, auditoría), `@l2/application` (tarifario,
  auditoría, equipos, sesiones, elevación, personas, excepciones, accesos, autorización 🔐, tasas y
  su sincronización con el BCV, impuestos con vigencia, feriados bancarios, libro de pagos, turnos de caja, medios de pago, catálogo de productos, cuentas, parque y directorio de familias), `@l2/observability` (logs redactados, entorno validado). La web lee
  la sesión de cookies `httpOnly` y recibe el actor COMPLETO del servidor.
- **Ya van contra la base:** acceso (equipo + PIN, alta de equipos con código de emparejamiento),
  tarifario, Dispositivos, Usuarios y permisos, Roles y accesos, Tasas de cambio (barra, caja e
  Inicio), Impuestos y Feriados bancarios (Configuración), el turno (apertura, barra, caja e Inicio) los medios de pago (Caja → Medios de pago y los medios que ofrece la caja) el catálogo de productos (Inventario → Productos y la carta de mostrador de la caja) y las cuentas (entrada, mesas, caja, cobrar y anular), los cortes del turno y el resumen del día de Inicio, y **el parque** (entrada, sala, salida, directorio de familias y
  los niños atendidos de Inicio). No se enseña nada inventado: lo que no existe dice «Sin datos» o «Sin turno
  abierto». Lo demás es configuración provisional o simulación, en §5.
- **Entrar en local:** navegador nuevo → «Pedir registro» en `/acceso` → «Soy de administración» con
  contraseña `abby-kingdom-desarrollo` + código de `pnpm totp` (o `pnpm equipos aprobar "<nombre>"`)
  → persona → PIN 1970. Tope: 10 solicitudes por hora desde la misma dirección.
- **Pruebas:** `pnpm verify:db` en verde (76 de base, 286 de aplicación, 9 del worker; en el dominio, 55 de tasas,
  44 de impuestos, 104 de caja, 18 de inventario y 104 de identidad). **Subido a GitHub el 2026-09-27** (`main` y las etiquetas hasta
  v0.22.0); el CI pasó en verde allí el 2026-09-26. Para cerrar B0-4 falta verlo en rojo con un PR de
  prueba.

**La tasa en la base local (2026-09-27).** Vaciada y sembrada de cero; el servidor trajo del BCV la del
viernes 25 (855,6625, solo DolarApi) y la del lunes 28 (857,0058, web del BCV), retenidas las dos. La
del viernes la confirmó Abigail Karam al comprobar B2-1c; la del lunes se aplicó sola en cuanto hubo
vigente. Para probar el aviso de la caja se aplicaron a mano para el domingo 27, dos veces, 860,00 y
luego 855,6625: la vigente de ese día quedó en 855,6625, el valor del BCV. Equipos de prueba «Verif Caja» y «Verif
Admin» revocados.

**Los impuestos en la base local.** La semilla programó 16 %, 8 % y 3 % el 2026-09-27. Al comprobar
B2-2 se programó el IVA general al 15 % (hoy y el 27 oct) y se devolvió al 16 %, y el IGTF al 2 % el
27 oct y se canceló: rige 16 %, 8 % y 3 %, sin nada programado. Equipos «Prueba B22 Admin» y «Prueba
B22 Caja» revocados.

**Turnos de prueba abiertos en la base local.** Al comprobar B3-1 se abrió un turno en «Prueba B31
Caja» ($ 20,00 y Bs. 1.500,00), al comprobar B3-2 otro en «Prueba B32» ($ 0 y Bs. 0,00) y al comprobar
T-6 otro en «Prueba T6» ($ 10,00 y Bs. 0,00), los dos últimos a nombre de Abigail Karam; los tres
equipos están revocados. Un turno no se borra ni se cierra sin corte Z, así
que Inicio los enseña hasta B3-5, que debe permitir cerrar un turno huérfano desde otro equipo.

**Medios de pago en la base local.** La migración de B3-2 dio a cada local los siete medios de §5.5
(los que piden datos del local, apagados) y `pnpm db:semilla` cargó datos inventados: Pago Móvil
(Banesco, 0414-2345678, J-40123456-7), Zelle (Parque Infantil L2 C.A.) y dos terminales (Punto
Banesco y Punto Mercantil), con Pago Móvil, Punto débito y Zelle encendidos. Al comprobar B3-2 se
añadió el medio «Biopago» (se queda apagado: un medio no se borra) y se añadió y retiró el terminal
«Punto BNC». Punto crédito sigue apagado.

**Cuentas en la base local (2026-09-28).** Al comprobar B3-3 se abrieron ocho: #0001 (mostrador, cobrada
mixta), #0002 a #0004 (familias en cuenta abierta, se quedan abiertas: la salida no ve la sala hasta
B4-2), #0005 (familia en prepago, cobrada; sigue abierta con el niño dentro), #0006 (mesa 1, cobrada
en dos partes) y #0007 y #0008 (mostrador, cobradas y anuladas: vuelven a estar por cobrar). Dos turnos
de prueba más, en «Prueba B33 Caja» ($ 10,00) y «Prueba B33 Admin» ($ 20,00); equipos «Prueba B33
Caja», «Prueba B33 Admin» y «Prueba B33 Salón» revocados. Al comprobar B3-4, #0009 (mostrador con una
cortesía, cobrada, impresa dos veces y anulada) y #0010 (cobrada y anulada por administración), y dos
turnos más en «Prueba B34 Caja» y «Prueba B34 Admin» ($ 20,00 cada uno); equipos revocados.

**Productos en la base local.** `pnpm db:semilla` cargó doce de ejemplo (bebidas, snacks, golosinas
y café). Al comprobar B9-1 se creó «Pirulín» ($ 2,50) y se dejó exento, se apartó «Gomitas», el agua
subió a $ 1,20 desde el domingo 27 y la malta tiene $ 1,75 programado para el miércoles 30. Se abrió
un cuarto turno de prueba en «Prueba B91» ($ 10,00 y Bs. 0,00, con una venta de $ 1,31); el equipo
está revocado.

**Feriados en la base local:** ninguno (al comprobar B2-4 se registró el 12 oct y se retiró). El cliente
carga los de 2026 desde Configuración → Feriados bancarios con el calendario de SUDEBAN.

**Producción arranca con la base vacía (M-12).** Hoy el primer administrador y su primer equipo solo
se crean por consola, y el segundo factor es un TOTP de una app de terceros. T-4 lo resuelve antes de
staging: instalación inicial desde el navegador y llaves de acceso (ADR-020).

**El día completo, en cuatro momentos (M-13).** Con el cliente se fijó el 2026-09-27 cómo es la
jornada: primer encendido, apertura, jornada y cierre, en [JORNADA.md](JORNADA.md). Lo que exige a
la ruta está en su §6 y ya está en §3: un paso nuevo (T-6, el menú por operación) y criterios más
completos en T-4, B3-4, B3-5, B4-4 y B8-2. **T-6 ya está hecho** (v0.22.0): el menú es por operación
y la caja tiene Cobrar | Turno. Lo abierto de su §7 se pregunta al cliente cuando llegue su paso
(sin día simulado: decisión del cliente, 2026-09-27).

**El parque en la base local (2026-09-28).** Al comprobar B4-1 y B4-2 entraron tres familias de prueba:
Carolina Méndez en prepago (#0011, cobrada con $ 20; #0013, por cobrar) y Pedro Álvarez en cuenta
abierta (#0012 y #0014, por cobrar). Salieron todos: la sala está vacía (seis estancias cerradas). Se abrió un turno más en «Prueba B4 Caja» ($ 10,00);
equipos «Prueba B4 Entrada», «Prueba B4 Sala» y «Prueba B4 Caja» revocados. Al comprobar B4-3: Laura Pérez
tres veces en cuenta abierta (#0017 a #0019, por cobrar; una con una recarga de 1 hora) y la
«Familia Olvido» (#0016, por cobrar), una huérfana de ayer creada con el caso de uso y cerrada por Luis
Guerrero. #0015 (Luis Morandin, cobrada) es del cliente. Sala vacía; equipos «Prueba B43 …» revocados.

**Limpieza para probar de cero (2026-09-28, pedido del cliente).** Todas las cuentas pendientes de prueba
(#0002–#0005 abiertas de B3-3 y #0007–#0010, #0012–#0014 y #0016–#0019 por cobrar) se marcaron
**incobrables** con el caso de uso de B3-5, motivo «Otro: datos de prueba», autorizadas por Abigail
Karam con su PIN: nada se borró. No queda ninguna cuenta pendiente ni niños en sala. Los turnos
huérfanos de prueba se cerraron al comprobar B3-5 (abajo).

**Cortes en la base local (2026-09-28, al comprobar B3-5).** Supervisión (Luis Guerrero) cerró desde Inicio, con
conteo en cero y justificación, los turnos de prueba que seguían abiertos (B31, B32, T6, B91, B33 ×2, B34 ×2 y B4
Caja). **Por error, el mismo guion selló también el turno de «PC admin»**, el equipo del cliente (abierto por Abigail
Karam a las 12:29 pm, con #0015 y #0020 cobradas): su Z dice $ 12,00 de diferencia y «Turno de prueba…», y un Z
no se deshace. Hay que decírselo al cliente; su cuadre real, si lo quiere, se anota aparte. En «Prueba B35 Caja»,
tres turnos: un relevo que cuadra (Z de la cajera), otro con $ 5,00 de faltante (Z de supervisión) y uno con
la «Familia Prueba Jornada» (#0023), que entró, salió y se marcó incobrable. **Quedan pendientes del cliente**
#0021 (mostrador, $ 2,78) y #0022 (Mesa 8): la jornada del local no se cerró. Equipos «Prueba B35 …» revocados.

**Visita técnica (2026-09-28, M-15).** El cliente fijó cómo se trabajará en el local, y la ruta pasa de 48 a
**55 pasos** (56 con lo nuevo, menos la gaveta, que no hay): la monitora en un **teléfono** que lee pulseras **preimpresas y de un solo uso** con la cámara;
la caja en una **laptop**; el mesero en una **tablet**; la **cocina sin pantalla**, con la comanda impresa;
**una impresora**, en caja, por red; el **restaurante entra en el piloto**; un **inventario mínimo y real**
(lo que no hay no se vende); **descuentos configurables** (por medio de pago, VIP, manual y de
administración); **reservas de cumpleaños** con anticipo; **todo en tiempo real**; y **un solo servidor en la
nube con internet de respaldo** en el local. El detalle, en §2 (M-15); los pasos nuevos, en §3. El mismo día
se respondieron **todas las preguntas abiertas de §4** (descuentos, eventos, pulseras, gaveta, número de orden,
autorizarse a sí mismo, puestos, umbral de la tasa e IGTF): ya no queda ninguna del cliente para la Ruta A,
salvo los datos maestros (F0-04) y la firma del alcance (F0-09).

**El IGTF ya no se cobra (V-13).** Con el visto bueno del cliente, el 2026-09-29 se programó en Ajustes →
Impuestos el IGTF al **0 %**, rigiendo desde ese momento, a nombre de Abigail Karam (equipo «Prueba IGTF
Admin», revocado). Lo cobrado antes se queda como se cobró; el IVA sigue en 16 % y 8 %. La caja y el recibo
enseñan todavía la línea del IGTF en cero hasta B3-6.

**El IVA reducido no se usa en el local** (el cliente, 2026-09-29; v0.30.1): no se ofrece ni se acepta al
crear o editar un producto, Ajustes → Impuestos no lo enseña y la caja no lo exige para cobrar. El 8 %
programado en la base local se queda (nada se borra) pero no lo usa ningún producto; el motor lo conserva.

**Pendiente con el cliente:** **contarle** lo del turno de «PC admin» (arriba).

**El tiempo real en la base local (2026-09-29, al comprobar B5-1).** Entraron y salieron dos familias de
prueba, «Prueba Vivo B51» (#0025) y «Prueba Caida B51» (registrada con el worker caído); sus cuentas
quedaron **incobrables** («Otro: datos de prueba», autorizadas por Abigail Karam). Equipos «Prueba B51 …»
revocados. La migración del outbox se aplicó a la base del cliente (solo añade una tabla y un disparador).
El turno de «PC admin» abierto el 28/09 a las 7:27 pm es del cliente: no se tocó.

**Siguiente paso:** **B4-4** (ajustes del local en la base: zona horaria, umbrales de huérfanas y arqueo) y
**B4-5** (la monitora en el teléfono y las pulseras de un solo uso).

---

## 2. Decisiones de esta etapa (2026-09-26)

| # | Decisión | Consecuencia |
|---|---|---|
| **M-1** | **Se congela el frontend.** No se construyen más pantallas sobre datos de ejemplo | Las tres que faltaban (apertura de turno, impuestos, impresoras) se hacen **directamente contra el servidor**, en su etapa. Así cada pantalla se construye una sola vez. El inventario (tanda D) pasa a después del piloto, porque está fuera de la Ruta A. Los hallazgos de la antigua Ola 5 se corrigen al pasar por cada pantalla (§5), y la medición final se hace en staging (B7-3) |
| **M-2** | **Claude programa todo.** Se retira la orquesta con Gemini | Se borran `scripts/obrera.mjs`, ORQUESTA y los encargos. Los comentarios del código que dicen «escrito por la obrera» se quedan: son historia |
| **M-3** | **Nada fiscal por ahora** | F7 queda fuera, igual que el hito M1 (F3-08, las 20 facturas), la máquina fiscal y la nota de crédito. El recibo es **no fiscal**. IVA e IGTF **se siguen calculando** en el ticket, porque ya están hechos y cambian lo que se cobra |
| **M-4** | **Entornos: primero local (Docker), luego VPS** | ⚠ **Choca con ADR-003**, que pide un servidor en el local y usa la nube solo como réplica. Con solo un VPS, un corte de internet detiene los cobros y la cocina. **Propuesta:** el VPS sirve de staging y para el piloto en paralelo, donde el método anterior hace de respaldo (F11-04). La topología final (D-INF, §4) se decide antes de retirar ese método. El servidor se empaqueta en Docker para que la misma imagen corra en el VPS o en un mini-PC sin cambios. **Resuelto por M-15 ([ADR-021](adr/021-servidor-en-la-nube.md)):** un solo VPS, con internet de respaldo en el local |
| **M-5** | **Un solo documento vivo y handoff a petición** | Este archivo. El protocolo está en §8 |
| **M-7** | **Alta de equipos con buenas prácticas** (2026-09-26, pedido del cliente) | Amplía F2-02. El primer equipo de un local, o el que sustituye a uno perdido, se aprueba **desde él mismo con la contraseña y el TOTP** de quien gestiona personas (nunca con un PIN, y sin enseñar nombres en un equipo no aprobado); la consola `pnpm equipos` queda como puerta de emergencia. Cada equipo enseña un **código de emparejamiento** que quien aprueba compara. Una solicitud **caduca a las 24 h** y se renueva desde el equipo. Tope de 10 solicitudes por hora y dirección y de 20 pendientes por sucursal. Regla de operación (runbook, B8-2): **siempre dos equipos de administración aprobados** |
| **M-6** | **Fuera el modo demo y el simulador** (2026-09-26), y **todo el backend según esta ruta** | Se retiran el chip «DEMO», su panel, los escenarios, el reloj acelerado, `NEXT_PUBLIC_DEMO` y `L2_FUENTE_DE_DATOS`: la app corre siempre contra su servidor. Queda el bus de eventos (`features/operacion`), que no era simulado y en B5-1 viaja por el servidor. Lo que aún no tiene backend usa datos provisionales de `src/demo`; **cada paso borra el suyo** (tabla en su README). Cambio de alcance sobre F1-19 (DEC-22), pedido por el cliente |

| **M-8** | **La tasa del BCV se aplica sola y llega en vivo a todas las pantallas** (2026-09-26, pedido del cliente, [ADR-019](adr/019-tasa-automatica.md)) | Cambia §5.2 y F3-04 (confirmación humana de toda tasa automática). Salvaguardas: solo se aplica sola la de la web oficial del BCV con TLS verificado; si salta más del 10 % respecto de la vigente, si es la primera o si solo respondió un tercero, **no** se aplica y sale alerta crítica; si dos fuentes discrepan para el mismo día, no se captura. Todo queda auditado como «Aplicada automáticamente». La carga manual de administración también se aplica al guardarla (supervisión sigue con 🔐). En vivo: sondeo de 60 s hasta B5-1, push después. Un cobro en curso conserva su tasa y avisa si cambió (ADR-005) |
| **M-9** | **El inventario vuelve al plan** (2026-09-26, pedido del cliente; revierte esa parte de M-1) | Nueva **Etapa 9** (catálogo de productos, movimientos de solo-agregar, compras con costo promedio, ajustes con motivo y 🔐, alertas y conteo físico). Su primer paso, el catálogo, va antes del cobro en servidor (B3-3), que lo necesita. Recetas, descarga al marcar LISTO y merma (F8-03, F8-04, F8-09) van con el restaurante (B6-4), porque dependen de las comandas |
| **M-10** | **Versionado semántico visible** (2026-09-26, pedido del cliente) | SemVer 2.0.0. **MAJOR** 0 hasta producción; **1.0.0 = puesta en marcha** (B8-4). **MINOR** +1 por cada paso de la ruta entregado: la versión dice cuántos van. **PATCH** +1 por cada corrección entre pasos. Staging publica `-rc.N`. Fuente única: `version` del `package.json` raíz; `CHANGELOG.md` por versión (Keep a Changelog, en español) y etiqueta git `vX.Y.Z` en cada entrega. Se ve en el acceso y en Configuración con su etapa: «v0.14.0 · Etapa 2 · Dinero». Punto de partida: **0.13.0** |
| **M-12** | **Puesta en marcha sin consola y sin apps de terceros** (2026-09-27, pedido del cliente; [ADR-020](adr/020-llaves-de-acceso.md)) | Producción arranca vacía: el primer administrador y su equipo se crean desde el navegador con un código de instalación de un solo uso. El segundo factor pasa de TOTP a **llaves de acceso** (Windows Hello, el bloqueo del teléfono), dos por administrador, más diez códigos de recuperación impresos. Las credenciales de administración se dan desde el panel con un enlace de alta (QR). Paso **T-4**, antes de staging |
| **M-13** | **La app se ordena por la jornada** (2026-09-27, pedido del cliente; [JORNADA.md](JORNADA.md)) | El objetivo es operar el parque y el restaurante con un camino feliz. El menú pone arriba lo que se opera (Inicio, Parque, Restaurante, Caja) y abajo, en «Ajustes», lo que se configura (impuestos, feriados, medios, tasas, tarifas, carta, plano, personas, equipos). Turnos y Ventas del turno son **una sección, Turno**. Primer uso con asistente corto y «Puesta a punto» en Inicio; la cajera abre el turno y el sistema comprueba; relevo con corte, arqueo a ciegas, Z por umbral ($ 1,00, firma de supervisión por encima) y **ninguna jornada se cierra con pendientes**; ticket de corte impreso y resumen del día en Inicio. Nuevo paso **T-6**; la ruta pasa a 48 pasos |
| **M-14** | **El parque primero** (2026-09-28, pedido del cliente: «hacer funcional parque, urgente») | B3-5 queda en pausa a medias (dominio, contrato, base y caso de uso, sin pruebas ni pantalla) y el parque (B4-1 a B4-3) pasa delante, **sin esperar a B5-1**: la sala llega a los demás equipos por sondeo de 5 s, como las cuentas desde B3-3, y B5-1 la empujará en vivo. Las estancias, las familias y el precio del parque salen del navegador |
| **M-15** | **Lo decidido en la visita técnica** (2026-09-28, con el cliente) | Dispositivos, pulseras, cocina, impresión, inventario, descuentos, eventos, tiempo real y servidor: detalle abajo (V-1 a V-12). Cierra D-INF, D-RES, D-INV y F-12; cambia DEC-8 (en parte), DEC-18 y DEC-19; ADR-021, ADR-022 y ADR-023. La ruta pasa a **55 pasos**: entran B4-5, B3-6, B3-7, la Etapa 6 (B6-1 a B6-3, sin recetas) y la Etapa 10 (B10-1 y B10-2), y sale B5-3 (no hay gaveta electrónica, D-GAV) |
| **M-11** | **Cero código demo o simulado en producción** (2026-09-26, pedido del cliente) | Todo lo provisional o simulado está inventariado en §5 con el paso que lo borra, y un paso no está hecho si deja simulado algo suyo. Antes del staging, **T-2** lo impone en CI: `src/demo` borrada, sin datos de negocio en `sessionStorage`/`localStorage`, sin PINs literales ni listas inventadas |

La Ruta A (PLAN §11.3) sigue siendo el alcance, **más el inventario mínimo** (M-9) y, desde la visita técnica
(M-15), **el restaurante sin pantalla de cocina, los descuentos y los eventos**: parque y caja primero. Las
cinco reglas de CLAUDE.md no se relajan.

**M-15 en detalle.** Cada fila, con el paso que la construye.

| # | Decidido | Paso |
|---|---|---|
| **V-1** | **Pulseras preimpresas por lote y desechables: un código por visita.** Un código ya usado en otra estancia se rechaza; el formato de la serie (prefijo y longitud) es un ajuste | B4-5 |
| **V-2** | **La monitora trabaja en un teléfono del local** (entrada, sala y salida). Lee con la **cámara** (QR y código de barras) y, si lo compran, con un **lector Bluetooth** en modo teclado (lo que DEC-8 ya resolvía). **Sin pantalla de pared** (cambia DEC-18): la sala se ve en el teléfono y en el panel | B4-5 |
| **V-3** | **Caja en una laptop; mesero en una tablet.** Equipos del local, aprobados como del puesto (DEC-17); cada persona entra con su PIN | B7-3 |
| **V-4** | **La cocina trabaja con la comanda impresa, sin pantalla** ([ADR-022](adr/022-cocina-con-comanda-impresa.md), cambia DEC-19). El sistema sabe el pedido y la cuenta, no «listo» ni «entregado». La comanda sale en la **impresora de comandas**, un ajuste: hoy la de caja (alguien la lleva), mañana una en la cocina | B5-2, B6-2 |
| **V-5** | **Una sola impresora térmica, en la caja, por red** (TCP 9100): recibo, ticket de corte y comandas | B5-2 |
| **V-6** | **El restaurante entra en el piloto** (cierra D-RES): mesas, carta, pedidos del mesero y cuenta de mesa en el servidor | B6-1 a B6-3 |
| **V-7** | **Inventario mínimo y real** (cierra D-INV): lo que se vende tal cual (refrescos, golosinas, juguetes) y servicios sin existencia (alquiler por cumpleaños, paquetes). Entradas de **varias líneas de una vez** o de un producto, con **costo promedio** y margen. **Lo que no hay no se vende** ([ADR-023](adr/023-existencia-al-entrar-en-la-cuenta.md)). Insumos y recetas de cocina, después del piloto | B9-2 a B9-5 |
| **V-8** | **Todo sincronizado en tiempo real**: sala, cuentas, existencias, turnos y pendientes, comandas, reservas, tasa, catálogo, medios y equipos | B5-1 |
| **V-9** | **Descuentos configurables** por administración (porcentaje o monto; a toda la cuenta, al parque, al restaurante o a categorías; con vigencia), **siempre antes del IVA**. Por **medio de pago** (p. ej. Zelle): la caja lo propone y se aplica solo con la 🔐 de supervisión o administración, y solo si **toda la cuenta** va por ese medio. **Cliente VIP**: administración marca a la familia con su porcentaje. **Manual** con motivo de lista cerrada y 🔐. **Administración** aplica cualquiera con su PIN y un motivo escrito. Todos, en el recibo y en las excepciones | B3-6 |
| **V-10** | **Cumpleaños: reserva con fecha y anticipo.** Horario, cliente, **niños invitados** (sus pulseras cuentan en el aforo), **paquete con productos** (descuenta existencias el día del evento), anticipo al reservar y saldo el día. Sin política de cancelación: devolver un anticipo es anular su cobro (DEC-24) | B10-1, B10-2 |
| **V-11** | **Un solo servidor en la nube (VPS)** con **internet de respaldo 4G** y UPS en la red del local ([ADR-021](adr/021-servidor-en-la-nube.md), cierra D-INF; supersede la topología de ADR-003 y DEC-4/DEC-10 en lo que pedían un equipo en el local) | B7-1, B8-1 |
| **V-12** | **Papel**: si caen los dos enlaces, se anota en formularios; al volver, **la cajera lo carga en su turno**, marcado «desde papel» con la hora real anotada, y **supervisión lo revisa** en el cierre (cierra JORNADA §7.4) | B3-7 |
| **V-13** | **No se cobra IGTF por ahora** (el cliente, 2026-09-28): se programa al 0 % en Ajustes → Impuestos y el motor se queda para cuando vuelva. Con el IGTF al 0 %, la caja y el recibo no enseñan su línea. Cambia lo que M-3 decía del IGTF; el IVA sigue | ~~Ajustes~~ (hecho el 2026-09-29); B3-6 (la línea) |
| **V-14** | **La tasa del BCV es siempre la que trae la API**: se retira el umbral de salto de ADR-019 (D-CORD). Si la API falla, administración (o supervisión con 🔐) la carga a mano en Ajustes → Tasas y se aplica al guardarla, como ya hace; en dólares se cobra siempre. Cuando la API trae la del día, la reemplaza | B5-1 |

---

## 3. Ruta a producción

El orden es por dependencia: **nada cobra sin identidad y auditoría debajo** (H-06). Cada paso cuenta
como hecho solo si su criterio se cumple y se puede demostrar, y se marca aquí en el mismo commit.
Los paquetes nuevos siguen el mapa de PLAN §9.2 (`database`, `application`, `auth`, `observability`,
`hardware` y `apps/worker`), y `pnpm arch` incorpora sus fronteras al crearlos.

**Definición de hecho de un paso de backend.** Un paso cuenta como hecho solo si cumple todo esto:

1. **Contrato** Zod de entrada y salida en `@l2/contracts`. El servidor revalida lo que llega (ADR-017)
   y nada del navegador declara identidades ni instantes.
2. **Dominio** puro con sus pruebas. Las reglas de negocio viven ahí, no en la acción ni en la pantalla.
3. **Caso de uso** en `@l2/application`, dentro de la transacción del tenant: `exigirPermiso…` antes de
   tocar nada, `auditar()` en la misma transacción y rechazos auditados.
4. **Base:** migración versionada y nunca editada una vez aplicada, `l2_aislar_por_tenant`, solo-agregar
   donde haya dinero, stock o historia, CHECKs, FK compuestas con el tenant, sin `Float` e índices con
   el tenant primero.
5. **Dinero:** clave de idempotencia en toda escritura de dinero y tasa congelada en el asiento (ADR-005).
6. **Pruebas:** unitarias del dominio, `*.test-db.ts` contra la base con reloj fijo si depende del día,
   y negativas de permiso y de aislamiento.
7. **Web:** lectura en `*.servidor.ts` con `connection()`, escritura en `*.acciones.ts` (`unknown` →
   `Resultado`) y el proveedor adopta lo que devuelve. Nada de negocio en el almacenamiento del navegador.
8. **Limpieza:** se borra lo provisional o simulado del paso, tanto el archivo de `src/demo` como su
   fila de §5 (M-11).
9. **Navegador:** el flujo real, con Playwright, a 1366×768, 1280×800 y 800×1280; sin errores de
   consola; estados de carga, vacío y error visibles.
10. **Cierre:** `pnpm verify:db` en verde, versión +1 MINOR con su entrada en `CHANGELOG.md` y su
    etiqueta (M-10), y la casilla de este archivo marcada en el mismo commit.

**Orden de ejecución.** Es el camino crítico, y no coincide con el número de etapa:

1. ~~Limpiar la base local → T-1 → B2-1c → B2-2 → B2-3 → B3-1 → B2-4 (se cierra Dinero) → T-3~~.
   B3-1 se adelantó a B2-4 el 2026-09-27 (decisión del cliente): el día de negocio lo asigna el turno
   (ADR-009), así que el turno tenía que existir antes.
2. ~~B3-2 → T-6 → B9-1~~ (catálogo, que el cobro necesita) →
   **B3-3** → B3-4 → B3-5 (se cierra Caja).
3. ~~B4-1 → B4-2 → B4-3 → B3-5 → B5-1~~ (todo en tiempo real, V-8) → **B4-4** → B4-5 (la monitora en el
   teléfono; se cierra Parque). M-14 adelantó el parque a B3-5 y a B5-1: mientras no haya tiempo real, la
   sala viaja por sondeo de 5 s.
4. B9-2 → B9-3 → B9-4 → B9-5 (se cierra Inventario) → B3-6 (descuentos) → B5-2 (impresión y comandas).
5. B6-1 → B6-2 → B6-3 (restaurante, en el piloto por M-15) → B10-1 → B10-2 (eventos).
6. B3-7 (carga desde papel) → **T-2** (cero simulación) → **T-4** (instalación inicial y llaves de acceso)
   → Etapa 7 (staging) → Etapa 8 (producción, 1.0.0).

Fuera de la cuenta de 55: B5-3 (retirado, D-GAV) y B6-4 (recetas e insumos de cocina), después del piloto (M-15, V-7).

### Transversal

- [x] **T-1 · Versión visible** (M-10).
  → El acceso y Configuración dicen «v0.13.0 · Etapa 2 · Dinero» (con la versión que toque), el log de
  arranque la repite, y `pnpm verify` falla si `CHANGELOG.md` no tiene la versión del `package.json`.
  Incluye `CHANGELOG.md` reconstruido desde el historial (0.1.0 = B0-1 … 0.13.0 = B2-1b) y las
  etiquetas `vX.Y.Z` en los commits de cada paso.
  *Hecho el 2026-09-27 (v0.14.0): `version` y `l2.etapa`/`l2.pasos` en el `package.json` raíz;
  `next.config.ts` incrusta solo esos tres datos (el navegador no recibe el `package.json`). Se ven
  en los tres estados del acceso (desconocido, pendiente y «¿Quién entra?») y en Panel →
  Configuración → Sistema, con «14 de 45 pasos» y su barra; el log «servidor web conectado a la
  base» lleva `version` y `etapa`. `pnpm version:comprobar` entra en `pnpm verify` y falla si
  CHANGELOG.md no abre con la versión del `package.json`; 6 pruebas demuestran que muerde.
  CHANGELOG reconstruido de 0.1.0 a 0.13.0 (B1-3 y B1-4 salieron juntos: no hay 0.7.0) y etiquetas
  en el commit de cada paso. Comprobado con Playwright a 1366×768, 1280×800 y 800×1280, sin errores
  de consola ni desplazamiento del documento.*
- [x] **T-3 · Rediseño del acceso** (pedido del cliente el 2026-09-27; la ruta pasa a 46 pasos).
  → La pantalla de acceso da protagonismo al producto: marca y nombre a la izquierda, el formulario a
  la derecha. «Soy de administración» (aprobar el equipo con contraseña y TOTP, M-7) se ve desde la
  primera pantalla de un equipo desconocido, no solo después de «Pedir registro».
  *Hecho el 2026-09-27 (v0.20.0): `PantallaAcceso` y `PanelMarca` en `AccesoScreen`, la misma
  estructura para equipo sin registrar, pendiente, no autorizado, «¿Quién entra?» y el PIN: «L2
  Control», «Abby Kingdom · Parque y restaurante», la hora grande, el estado del equipo (sin registrar,
  esperando aprobación, autorizado, no autorizado) y la versión; en vertical, una franja arriba. Sin
  registrar y pendiente son un mismo componente (`AltaDeEquipo`): al registrarse, el servidor repinta
  el acceso y el formulario conserva lo que hacía. «Soy de administración» registra y aprueba de una
  vez (dos acciones del servidor, sin cambiar el backend de M-7); si la aprobación falla, queda
  pendiente con el error en el campo y el siguiente intento solo aprueba. Comprobado con Playwright:
  sin registrar (con y sin la opción de administración), contraseña mala → pendiente con «Contraseña o
  código incorrectos» y su código, aprobar → «¿Quién entra?» → PIN → panel, y pendiente; los cinco a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
- [ ] **T-4 · Instalación inicial y llaves de acceso** (M-12, ADR-020), antes de B7-1.
  → Con la base vacía, el acceso ofrece «Instalar L2 Control» (código de instalación de un solo uso que
  el servidor escribe en su registro): local, primer administrador con contraseña, PIN y llave de
  acceso, diez códigos de recuperación y este equipo aprobado; después la pantalla no vuelve a
  existir. La elevación y la aprobación de equipos piden contraseña + llave (o un código de
  recuperación). Administración da credenciales a otra desde Panel → Personas con un enlace de alta
  de 24 h con QR. Se retiran el TOTP y `pnpm totp`. Una base vacía queda operativa sin tocar la
  consola; las pruebas de navegador usan el autenticador virtual de Chromium. Al terminar, Inicio
  enseña la **Puesta a punto** de JORNADA §2 (personas, equipos, tarifas, impuestos, tasa, medios,
  catálogo, impresoras, feriados, carta y plano, segunda administración), que se tacha sola cuando
  el dato existe; cada punto dice qué puesto bloquea.
- [x] **T-6 · Menú por operación** (M-13, JORNADA §1).
  → El menú del panel pone arriba Inicio, Parque, Restaurante y Caja, y abajo «Ajustes» con
  impuestos, feriados bancarios, medios de pago, tasas, tarifas, carta, plano, personas y equipos.
  La estación de caja queda en **Cobrar | Turno**: Turno se lee de arriba abajo (resumen del turno,
  ventas con reimprimir y anular, «Cerrar turno»). Las rutas viejas (`/ventas`, las secciones
  movidas) redirigen, ningún enlace se rompe, y la alerta de la tasa sigue llevando a su pantalla.
  Comprobado en el navegador en los tres tamaños.
  *Hecho el 2026-09-27 (v0.22.0):*
  *· Menú (`navigation.ts`): arriba Parque (sala, entrada, salida, representantes), Restaurante (mesas,
  comandas), Caja (Cobrar, Turno) e Inventario; abajo, separado y fijo al pie, **Ajustes** con cuatro
  grupos: Parque y restaurante (tarifas, carta, plano), Dinero (medios, tasas, impuestos, feriados),
  Equipo (usuarios, dispositivos, roles y accesos) y El local (sucursal, impresoras). Personas y
  Configuración dejan de ser módulos; cada sección conserva su permiso (supervisión ve Ajustes solo
  con Tasas). La versión del sistema se ve en Ajustes.*
  *· `RUTAS_MOVIDAS`: `/panel/configuracion/*`, `/panel/personas/*`, `/panel/caja/medios`, `…/tasas`,
  `/panel/parque/tarifas`, `/panel/restaurante/plano` y `…/carta` redirigen a su sitio nuevo;
  `/ventas` y `/panel/caja/turnos`, a `/turno`. Migas, enlaces de la caja, del acceso y de Inicio,
  al día.*
  *· Estación de caja: **Cobrar | Turno**. Turno con el turno abierto es una sola sección: a la
  izquierda el resumen (fondo al abrir, lo cobrado y por medio —lo que quedó en caja, no el billete
  entregado—, excepciones) con **«Cerrar turno»** siempre a la vista al pie; al lado las ventas del
  turno con su recibo (`VentasDelTurno`, antes `VentasScreen`). «Cerrar turno» lleva al arqueo, con
  «Volver al turno»; el Z sigue siendo de B3-5.*
  *· Comprobado en el navegador: el menú con Ajustes al pie y sus grupos; seis redirecciones; `/ventas`
  → `/turno`; la barra con Cobrar | Turno; una venta de mostrador en efectivo aparece en el resumen
  y en la lista; «Cerrar turno» → arqueo → «Volver al turno». Inicio, Ajustes, Turno y el cierre a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento y con «Cerrar turno» a la vista; sin
  errores de consola.*
- [ ] **T-2 · Cero simulación** (M-11), antes de B7-1.
  → La carpeta `src/demo` ya no existe, se retira la regla `demo-solo-desde-las-rutas` y `pnpm lint`
  suma la regla `sin-simulacion`: rechaza datos de negocio en el almacenamiento del navegador, PINs
  literales y listas de ejemplo en `features/`. El CI sale en rojo con una violación.

### Etapa 0 · Cimientos del servidor (local)

- [x] **B0-1 · Docker Compose** con PostgreSQL 17 y Valkey 8 (F1-04).
  → `docker compose up -d` deja el entorno listo en una máquina limpia; documentado en el README.
  *Hecho el 2026-09-26: `pnpm infra:up` con PostgreSQL 17.11 y Valkey 8.1.10 fijos, puertos solo en
  127.0.0.1 y tres papeles en la base (el de la aplicación no crea tablas ni se salta la RLS).*
- [x] **B0-2 · `packages/database`**: Prisma 7.4+, `tenant_id` en toda tabla y RLS `FORCE` (F1-05,
  ADR-002, ADR-007), sin `FLOAT` para montos (F3-02).
  → Pasan la prueba negativa de aislamiento (el tenant A no lee filas de B) y la prueba que falla ante
  una columna `Float` de dinero.
  *Hecho el 2026-09-26: Prisma 7.10, `abrirBase()` → `conTenant()` como única puerta, que se niega a
  arrancar con un usuario que se salte la RLS. `l2_aislar_por_tenant()` aísla una tabla en una línea.
  19 pruebas (4 estáticas y 15 contra `l2control_test`) que fallan si se apaga la RLS (comprobado).*
- [x] **B0-3 · Configuración validada al arrancar y logger con redacción** (`packages/observability`,
  F1-13, §10.3).
  → Si falta una variable, el proceso no arranca. Una prueba demuestra que un PIN o una referencia de
  pago no aparece en el log.
  *Hecho el 2026-09-26: `@l2/observability` con `crearLogger()` (pino 10, JSON), `redactar()` por
  nombre de campo y por forma del texto (URL con contraseña, `Bearer`, móviles venezolanos) y
  `leerEntorno()`, que lista todos los problemas sin enseñar un solo valor. 20 pruebas; cazaron dos
  filtraciones reales (`txId` y el contexto de `child()`). **Se engancha al arranque de Next en B0-5**,
  que es cuando la app empieza a necesitar variables.*
- [~] **B0-4 · CI en GitHub Actions** con `pnpm verify` y un lint que sí haga algo: `toFixed` fuera de
  `@l2/ui`, colores literales y `parseFloat` sobre dinero (F1-14).
  → Un PR con una violación sale en rojo.
  *Hecho en local el 2026-09-26: `.github/workflows/ci.yml` (acciones fijadas por hash, Node 24,
  mismo `docker-compose.yml`, `pnpm verify:db`) y `pnpm lint` con 5 reglas y 9 pruebas que demuestran
  que muerden: `toFixed` fuera de `@l2/ui`, `parseFloat`, colores literales, reloj en el dominio y
  emojis en pantalla. Excepciones solo con `lint-permitido: <regla> — <motivo>`. **Visto en verde en
  GitHub el 2026-09-26** (primer push, `verify:db` completo con la base en el runner). Falta ver en
  rojo un PR con una violación a propósito (una rama de prueba que no se fusiona).*
- [x] **B0-5 · La costura entre demo y servidor** (`packages/application`). Se fija un patrón único:
  acción de servidor → contrato Zod → dominio → repositorio en transacción con `SET LOCAL app.tenant_id`.
  El primer caso vertical es el **tarifario**: leer y publicar.
  → Una tarifa publicada se ve desde otro navegador y sobrevive a reiniciar el servidor.
  *Hecho el 2026-09-26. `@l2/application` (`conectar()`, `tarifario.leer/publicar`,
  `sucursal.asegurar`), tabla `park_tariff_version` de solo-agregar con FK compuesta, contratos
  `TarifarioPublicadoSchema` y `Resultado`. En la web, el entorno validado en `instrumentation.ts`, `publicarTarifario` como server action y
  `pnpm db:semilla`. Comprobado en el navegador: publicar $ 7,25 en una sesión, leerlo en otra
  independiente, en la entrada, y tras reiniciar el servidor; con el entorno roto el servidor no
  arranca y no enseña la contraseña. 33 pruebas contra la base. **Hasta B1 solo se escribe con
  `L2_ENTORNO=desarrollo`.***

### Etapa 1 · Identidad y auditoría (F2 completa, no se recorta)

- [x] **B1-1 · `AuditLog` append-only**: un disparador rechaza `UPDATE` y `DELETE` (F2-07).
  *Hecho el 2026-09-27: tabla `audit_log` (RLS y solo-agregar), `auditar(tx, ctx, asiento)` en la misma
  transacción que la operación, con `before`/`after` redactados, y catálogo `AccionAuditada`. Publicar
  el tarifario ya deja su asiento. Pendiente de B7: enviarlo fuera de la máquina (§7.4).*
- [x] **B1-2 · Sesión en el servidor** con cookie `httpOnly`; administración con contraseña y segundo
  factor como elevación (F2-01, F2-04). **Sesión propia en vez de Better Auth: [ADR-018](adr/018-sesion-propia.md)**,
  porque Better Auth no puede vivir bajo la RLS forzada; los controles de ADR-013 se mantienen.
  *Hecho el 2026-09-27: `catalogo.modificar`, `usuarios.gestionar` y `reportes.verTodas` exigen,
  además del permiso, confirmar identidad con contraseña (Argon2id) y código TOTP; vale 15 minutos
  en esa sesión. El servidor responde `ELEVACION_REQUERIDA` y la pantalla abre el diálogo y
  reintenta. Secreto TOTP cifrado con AES-256-GCM (`L2_CLAVE_CIFRADO`); sin clave, no hay elevación.
  Los fallos cuentan para el mismo bloqueo que el PIN. Credenciales con `pnpm credenciales
  "<nombre>"`; en desarrollo, `pnpm totp`. 9 pruebas. Pendiente: dar credenciales desde el panel
  con QR (hoy, consola) y protección contra reutilizar el mismo código dentro de su ventana.*
- [x] **B1-3 · Dispositivos**: alta, aprobación y revocación, y revocar cierra sus sesiones (F2-02).
  *Hecho el 2026-09-27: un equipo nuevo pide su registro desde el acceso (credencial en cookie
  `httpOnly`, solo su SHA-256 en la base); se aprueba en Panel → Personas → Dispositivos o, el
  primero de un local, con `pnpm equipos aprobar "<nombre>"`. Revocar cierra sus sesiones en el
  acto (comprobado en el navegador con dos equipos).*
- [x] **B1-4 · PIN con Argon2** y bloqueo creciente registrado; sesión compartida en el servidor
  (F2-03, F2-12).
  → Un PIN nunca viaja ni se guarda en claro. Un dispositivo desconocido no entra con PIN.
  *Hecho el 2026-09-27: Argon2id, bloqueo de `@l2/domain-identity` decidido en el servidor, sesión en
  cookie `httpOnly` con su hash en la base, una por equipo, caduca a los 30 min sin actividad y
  muere al salir, al revocar el equipo o al dar de baja a la persona. Cada intento, bueno o malo,
  queda en la auditoría. Publicar el tarifario ya exige la sesión y `catalogo.modificar`. Se retira
  el «solo en desarrollo» de B0-5. 18 pruebas de identidad contra la base.*
- [x] **B1-5 · Permisos en el servidor**: usuarios, roles, excepciones por persona y ajustes de la
  sucursal persistidos. `can()` se evalúa en cada acción, y la autorización de supervisor se registra
  **antes** de ejecutar (F2-05, F2-08, F2-10, F2-11, F2-13).
  → Cada ❌ de la matriz tiene su prueba y devuelve 403. Dar de baja a alguien revoca su acceso en
  menos de 5 s.
  *Código hecho el 2026-09-27, con 19 pruebas contra la base y `pnpm verify:db` en verde: directorio,
  alta/baja/reingreso/rol/PIN con las cinco puertas del dominio sobre el equipo real (la baja cierra
  sus sesiones en el acto), PIN temporal que se muestra una vez y obliga a elegir uno propio al
  entrar, excepciones (sin llaves de la casa ni a uno mismo), ajustes de sucursal con su suelo
  intocable, y `exigirPermisoOAutorizacion()` para los 🔐 (PIN del autorizador, `canAuthorize`,
  asiento antes de ejecutar). La web recibe el actor del servidor; se borran `equipo.ts` y
  `accesos.ts` del cliente. Comprobado en el navegador el 2026-09-26 con dos equipos: el alta
  enseña el PIN temporal una vez (al recargar ya no está), con él la persona entra en otro equipo y
  elige el suyo antes de llegar a su puesto; una concesión aparece en su ficha; ajustar «Reportes de
  la sucursal» para Caja le abre el panel en el otro equipo y retirarlo se lo cierra. Los 🔐 de la
  caja se conectan en B3-4.*

- [x] **B1-6 · Alta de equipos con buenas prácticas** (M-7, amplía F2-02).
  → Un local nuevo aprueba su primer equipo sin consola; aprobar exige comparar el código; una
  solicitud vieja no se aprueba.
  *Hecho el 2026-09-26: `elevacion.aprobarEquipo` (la contraseña identifica a la persona entre
  quienes tienen credenciales en la sucursal; exige `usuarios.gestionar`; los fallos bloquean al
  EQUIPO con el bloqueo creciente y, si la contraseña era de alguien, también a esa persona);
  código de emparejamiento derivado del id (sin 0/O ni 1/I) en la pantalla del equipo, en Panel →
  Dispositivos, en el diálogo de aprobar y en `pnpm equipos`; caducidad a las 24 h con renovación
  (`RENOVADO` en su historia); topes contados sobre la auditoría y la tabla (valen con varios
  procesos). Se corrige `ipDeLaPeticion`: tomaba la PRIMERA dirección de `x-forwarded-for`, que
  inventa el cliente; ahora la última, la del proxy más cercano. 13 pruebas contra la base.
  Comprobado en el navegador: tope por dirección, código igual en pantalla y consola, contraseña
  mala rechazada y buena aprobando, panel con el código, caducada en los dos lados y renovada; sin
  desplazar la página a 1366×768, 1280×800 y 800×1280.*

### Etapa 2 · Dinero (F3, sin lo fiscal)

- [x] **B2-1 · Tasas** (`ExchangeRate`): historial inmutable, carga manual con confirmación y doble
  verificación sobre el umbral, y fail-closed sin tasa del día (F3-03, F3-05, ADR-005). La
  sincronización con el BCV (F3-04) puede llegar después: para el piloto basta la carga manual.
  *Hecho el 2026-09-26: tablas `exchange_rate` y `exchange_rate_confirmation`, las dos de
  solo-agregar y con RLS (confirmar AÑADE un hecho; el valor es texto exacto con CHECK distinto de
  cero). Cada tasa lleva su **fecha valor** (`effectiveDate`, el `effectiveFrom` de §5.2): se captura
  para hoy o hasta 7 días por delante, y la caja cobra solo con `rateOfDay`, la del día confirmada;
  la de ayer bloquea. Capturan administración y supervisión (quien cobra, no); confirma
  administración, y supervisión con autorización 🔐 (PIN de quien autoriza, antes de ejecutar).
  Salto de más del 10 % o primera tasa del par: se teclea otra vez y debe coincidir. Quién captura
  y confirma lo pone el servidor, no el navegador. 20 pruebas de aplicación y 3 de base. Comprobado
  en el navegador con tres equipos: caja «Sin tasa» → capturar → confirmar (un valor mal tecleado
  se rechaza) → la caja cobra con Bs. 228,41 → supervisión confirma otra con autorización. Inicio
  del panel lee la misma tasa. Se borra `src/demo/tasas.ts`.*
- [x] **B2-1b · Tasa traída del BCV** (F3-04) y **vigencia por días hábiles**.
  → Lo traído entra pendiente y no cobra hasta confirmarlo; si la fuente cae, la carga manual sigue.
  *Hecho el 2026-09-26: dos lectores, la web del BCV (valor y fecha valor) y DolarApi (respaldo y
  contraste), probados en vivo. El servidor del BCV manda incompleta su cadena TLS: se añade el
  intermediario público de Sectigo solo a esa conexión, sin apagar la verificación (un certificado
  caducado se sigue rechazando). `tasas.sincronizar` captura PENDIENTE lo que rige hoy o en los
  próximos 7 días, no repite, y si dos fuentes discrepan para el mismo día no captura ese día (T6).
  Botón «Traer del BCV» y consulta automática cada hora (`L2_SINCRONIZAR_TASA`, se muda a
  `apps/worker` en B5). **Se corrige la regla de B2-1:** la tasa rige desde su fecha valor hasta el
  siguiente día hábil (la del viernes cubre el fin de semana; el lunes exige la del lunes); antes
  exigía fecha valor = hoy y el parque no habría cobrado en bolívares los fines de semana. Las
  pruebas de tasas corren con un reloj fijo. 9 pruebas nuevas de aplicación, 4 de lectores y 5 de
  dominio. La caja escribía «45,81 Bs/$» con 229,05 (leía la fracción como /100): corregido.*
- [x] **B2-1c · Tasa automática y en vivo** (M-8, ADR-019).
  → Un cambio de la tasa del BCV llega a todas las pantallas sin navegar, en menos de 1 minuto (menos
  de 2 s tras B5-1), y la caja cobra con él sin que nadie lo confirme. Un salto de más del 10 %, la
  primera tasa o un valor solo de un tercero no se aplican solos: salen como alerta crítica. Un cobro
  en curso conserva su tasa y avisa si cambió.
  Incluye:
  - la confirmación automática como asiento de solo-agregar («Aplicada automáticamente (BCV)»);
  - consulta cada 15 min y al arrancar, alejándose si la fuente falla, y aviso si falta la tasa del
    siguiente día hábil a la hora habitual;
  - carga manual de administración que se aplica al guardar (tecleada dos veces si salta);
  - sondeo de 60 s y al volver el foco en `TasasProvider`;
  - una sola fuente de tasa para toda pantalla que muestre bolívares (entrada, salida, caja, recibo,
    ventas, Inicio);
  - la alerta de Inicio llevando a Tasas y diciendo «Sin tasa vigente».

  *Hecho el 2026-09-27 (v0.15.0):*
  *· Dominio: `autoApplyDecision` (SOLO_TERCERO → PRIMERA → SALTO), `heldRates`,
  `missingNextBusinessDayRate`, `isBusinessDay`/`nextBusinessDay`; 13 pruebas nuevas. En
  `@l2/domain-money`, `sameRate`: dos tasas se comparan por valor (857,0058 = 857,00580000).*
  *· Base: migración `20260929000000_tasa_automatica`: `exchange_rate.held_back` (solo si la trajo un
  proceso) y `exchange_rate_confirmation.automatic` (sin persona, autorizador ni doble tecleo), con
  CHECK y 2 pruebas.*
  *· Aplicación: `sincronizar` aplica sola con asiento `tasa.aplicar` y a nombre de «Aplicada
  automáticamente (BCV)», y vuelve a mirar las pendientes que trajo un proceso; `capturar` de
  administración se aplica al guardar (tecleada dos veces si salta o es la primera), la de supervisión
  sigue con 🔐; `leer(ctx, ahora)` devuelve `alertas` (RETENIDA crítica, FALTA_SIGUIENTE aviso desde
  las 6:00 pm de un día hábil).*
  *· Web: sondeo de 60 s y al volver el foco en `TasasProvider`; Tasas con alertas, «Revisar y
  confirmar», «Guardar y aplicar» y «Aplicada sola»; Inicio lee `useTasaVigente` y su alerta dice «Sin
  tasa vigente» y lleva a Tasas; consulta al BCV al arrancar y cada 15 min, alejándose si no responde.
  La caja congela la tasa con el primer pago y, si la vigente cambia, lo dice en la franja del medio
  (56 px fijos): «Tasa nueva» con «Mantener» y «Usar la nueva». La primera versión del aviso iba
  dentro del visor, ocupaba cuatro renglones y sacaba «Cerrar cobro» de la pantalla a 1366×768.*
  *· Comprobado en el navegador con dos equipos: confirmar la del viernes en Tasas llega a la barra de
  la caja a los 57 s sin navegar; «Traer del BCV» aplica sola la del lunes («Aplicada sola: …») y se
  va la alerta; con un pago en Bs. a medias, aplicar otra tasa desde administración saca el aviso en
  la caja a los 55 s, «Usar la nueva» reconvierte (Bs. 4.954,29 → 4.979,40) y «Mantener» sigue con la
  del cobro. Tasas, Inicio y caja a 1366×768, 1280×800 y 800×1280 sin desplazar el documento ni
  desbordar a lo ancho, con «Cerrar cobro» siempre a la vista; sin errores de consola.*
  *Queda para después: el rechazo en el servidor de un cobro con una tasa que ya no rige (B3-3), el
  empuje en menos de 2 s (B5-1) y el umbral configurable (D-CORD).*
- [x] **B2-2 · Impuestos con vigencia** persistidos, más la pantalla **Configuración → Impuestos**
  (contrato `impuestos.ts`).
  → Programar una alícuota con fecha de hoy cambia el ticket; con fecha del mes que viene, no.
  *Hecho el 2026-09-27 (v0.16.0):*
  *· Dominio (`@l2/domain-tax`): `taxTimeline` arma el calendario de lo programado (el fin de un tramo
  es el comienzo del siguiente; con el mismo comienzo manda la última; lo que no cambia la alícuota no
  abre tramo, y así programar la vigente cancela un cambio), `ivaRulesOf` (lo exento, 0 % siempre),
  `igtfAt`, `missingTaxesAt`, `scheduleProblem` (nunca hacia atrás) y porcentajes sin coma flotante.
  `startOfDay` en `@l2/domain-rates`. 18 pruebas nuevas.*
  *· Contrato: `VigenciaImpuestoSchema`, `ImpuestosSchema` (vacío vale: local nuevo) y
  `ProgramarImpuestoCommandSchema` con el DÍA; el instante y quién lo pone el servidor (se retira el
  `por` que mandaba el navegador).*
  *· Base: migraciones `20260930000000_impuestos` y `…010000_impuestos_trato_obligatorio`: `tax_rate`
  de solo-agregar con RLS, CHECK de impuesto, trato (lo exento no se guarda), rango y
  `effective_from >= scheduled_at` (el pasado no se reescribe), y una sola programación por impuesto e
  instante. La segunda corrige un CHECK que dejaba pasar un IVA sin trato (ver §5). 3 pruebas.*
  *· Aplicación: `impuestos.leer` (sin persona: la caja lo necesita) e `impuestos.programar`
  (`catalogo.modificar` con elevación; hoy rige desde ya, otro día desde su medianoche en Caracas;
  hasta 366 días; lo que no cambia nada se rechaza; asiento `impuesto.programar` con lo que regía y lo
  que regirá; el rechazo por permiso, auditado). La semilla programa 16 %, 8 % y 3 %. 15 pruebas.*
  *· Web: Configuración → Impuestos (rige ahora, calendario por impuesto con «Rige ahora»,
  «Programado» y «Terminó», y «Programar un cambio»). La caja lee el calendario en el servidor y
  elige las alícuotas del instante (hora del servidor que avanza con el reloj); sin alguna vigente no
  cobra y enlaza a Impuestos. Se borran las alícuotas de `src/demo/caja.ts`.*
  *· Comprobado en el navegador con dos equipos: ticket de $ 5,00 → total $ 5,80; programar el IVA
  general al 15 % para el 27 oct no lo cambia; al 15 % para hoy, $ 5,75 (IVA 15 %); devuelto al 16 %,
  $ 5,80. Programar el 16 % que ya rige: «Ese día ya rige esa alícuota» en el campo; IGTF al 2 % el 27
  oct y luego al 3 %: «se cancela el cambio». Impuestos a 1366×768, 1280×800 y 800×1280 sin desplazar
  el documento ni desbordar; sin errores de consola. No se vio en el navegador la caja sin impuestos
  (la base local los tiene): lo cubren `missingTaxesAt` y su prueba.*
- [x] **B2-3 · Libro de pagos append-only con idempotencia**, y la reversión como asiento (F3-09,
  F3-10, §5.5).
  → Un doble clic produce un solo cobro. Al revertir quedan los dos asientos y el original intacto.
  *Hecho el 2026-09-27 (v0.17.0). **Alcance acordado con el cliente:** el libro en el servidor; la
  caja cobra contra él en B3-3, así que este paso no tiene pantalla ni se comprueba en el navegador
  (DoD 7 y 9 no aplican; el criterio se demuestra contra la base).*
  *· Dominio (`@l2/domain-cash`, `libro.ts`): tipos COBRO, VUELTO, PROPINA y RESIDUO (§5.6), los siete
  medios de §5.5 con su moneda, `entryProblem`, `reversalOf`, `reversalProblem` y `ledgerBalance`
  (cada asiento con su tasa congelada; USDT a la par). 9 pruebas.*
  *· Contrato (`libro.ts`): `AsentarPagosCommandSchema` (clave de la operación, documento y asientos;
  el navegador no manda ni el valor de la tasa, ni el IGTF, ni quién), `RevertirPagoCommandSchema`
  (motivo de la lista; «Otro» exige explicarlo) y `LibroDocumentoSchema`. 8 pruebas.*
  *· Base: migración `20261001000000_libro_de_pagos`: `payment` de solo-agregar con RLS, FK compuestas
  (sucursal, tasa, persona, equipo, asiento revertido), única `(operation_key, line)` (I-11) y una
  reversión por asiento; CHECK de tipo, medio y moneda del medio, signo (original positivo, reversión
  negativa con motivo), IGTF solo en cobros, vuelto solo en efectivo y bolívares con su tasa; y un
  disparador que exige que la reversión sea el original con el signo contrario (mismo documento,
  medio, tasa e IGTF) y que no se revierta una reversión. 5 pruebas.*
  *· Aplicación (`pagos`): `asentar` (`documento.emitir`; tasa citada y confirmada, su valor copiado
  de la base; IGTF del instante con la alícuota de la base, y sin ella no se cobra en divisas; todo o
  nada; la misma clave devuelve lo asentado y con otro contenido es CONFLICTO; el doble clic
  simultáneo se resuelve con la unicidad de la base), `revertir` (`cobro.anular`, 🔐 registrado antes
  de ejecutar; idempotente; una sola vez) y `libro` (saldo calculado). Asientos `pago.asentar` y
  `pago.revertir`. 17 pruebas.*
- [x] **B2-4 · `businessDate` en toda fila de dinero** (F3-11, ADR-009), y **calendario de feriados
  bancarios** (lo usa la vigencia de la tasa).
  → Una venta a la 1:30 am cuenta en el día del turno que la generó. Un feriado entre semana sigue
  cobrando con la tasa del día hábil anterior, sin carga manual.
  *Hecho el 2026-09-27 (v0.19.0), después de B3-1 (el turno fija el día):*
  *· Dominio (`@l2/domain-rates`): `isBusinessDay`, `nextBusinessDay`, `coversDay`, `rateOfDay`,
  `heldRates` y `missingNextBusinessDayRate` reciben los feriados (un feriado no es día hábil: lo
  cubre la tasa del día hábil anterior) y `holidayProblem` (un día real entre semana). 4 pruebas.*
  *· Contrato: `feriados.ts` (registrar con día y nombre, retirar por id); el historial de tasas lleva
  `feriados`; el asiento del libro, `businessDate`.*
  *· Base: migración `20261003000000_dia_de_negocio_y_feriados`: `payment.business_date` NOT NULL y el
  disparador exige que sea el de su turno; `bank_holiday` con RLS, entre semana, uno vigente por día,
  y un disparador que solo deja retirarlo una vez (ni borrar ni reescribir). 3 pruebas.*
  *· Aplicación: `feriados` (`listar` sin persona; `registrar` y `retirar` con `catalogo.modificar` y
  elevación, auditados); las tasas usan los feriados al leer, capturar, confirmar, sincronizar y
  avisar; el libro pone el día de negocio del turno. 8 pruebas de feriados (con el criterio: en el
  feriado rige la del lunes sin carga manual, y la víspera se avisa por la del miércoles) y 1 en el
  libro (un cobro a la 1:30 am del lunes cuenta el domingo, día de su turno).*
  *· Web: Configuración → Feriados bancarios (por año, registrar con día y nombre, retirar en dos
  pasos); `useTasaVigente` y Tasas usan los feriados, y Tasas dice «feriado bancario» ese día.*
  *· **Decisión:** la tasa sigue el día de calendario, no el de negocio (ver ADR-009): la fecha valor
  del BCV es de calendario. Resuelve la deuda que decía lo contrario.*
  *· Comprobado en el navegador: sábado rechazado en el campo; registrar el 12 oct con elevación; el
  mismo día otra vez, rechazado; retirarlo; Tasas intacta; a 1366×768, 1280×800 y 800×1280 sin
  desplazar el documento; sin errores de consola. El criterio del feriado no se ve en el navegador
  (haría falta que hoy fuera un feriado con tasa del día hábil anterior); lo demuestran las pruebas.*

### Etapa 3 · Caja (F4)

- [x] **B3-1 · Turno real**: la pantalla de **apertura** con fondo por moneda en `/turno` (contrato
  `turno.ts`) y un turno por dispositivo (I-06) (F4-01). El punto de cobro sale del equipo, no fijo.
  → Sin turno abierto no se cobra. La barra deja de decir «Turno sin abrir» fijo: lee el turno real.
  *Hecho el 2026-09-27 (v0.18.0), adelantado a B2-4 (ver el orden):*
  *· Dominio (`@l2/domain-cash`): `openingFloatProblem` (un fondo por moneda de la gaveta, USD y VES,
  cero vale, negativo no), `chargeProblem` (sin turno o con corte Z no se cobra) y `openingMovements`
  (el fondo entra en la gaveta como movimiento del turno). 4 pruebas.*
  *· Contrato: el turno lleva `punto` (el equipo) y `businessDate`; abrir manda SOLO el fondo (se
  retiran `deviceId` y `abiertoPor`, que declaraba el navegador) y el corte Z ya no trae `por`.*
  *· Base: migración `20261002000000_turno_de_caja`: `cash_shift` con RLS, índice único parcial por
  equipo sin corte Z (I-06) y un disparador que no deja borrar, reescribir la apertura, retroceder de
  estado ni cambiar un cierre firmado; `cash_shift_float` de solo-agregar; `payment.shift_id` NOT
  NULL y un disparador que rechaza cobrar en un turno con corte Z o de otra sucursal (I-14). 4
  pruebas.*
  *· Aplicación (`turnos`): `abrir` (`turno.abrir`; equipo aprobado de la sesión; día de negocio =
  día del local al abrir, ADR-009; dos aperturas a la vez dejan una), `delEquipo` y `abiertos` (para
  Inicio, con `reportes.verSucursal`). El libro exige el turno abierto del equipo para asentar y
  revertir, y guarda en cuál entró. 10 pruebas nuevas y 2 más en el libro.*
  *· Web: `/turno` abre el turno (fondo en $ y Bs., importes a la venezolana) y, abierto, enseña día de
  negocio, punto, quién y a qué hora, con el arqueo; el corte Z simulado en el navegador se retira
  (los cortes guardados son de B3-5). La barra lee el turno del equipo; la caja no cobra sin turno
  («Abrir el turno») y dice «Cobrando desde <equipo>»; Inicio enseña el turno y su fondo en la gaveta.*
  *· Comprobado en el navegador con dos equipos: caja sin turno bloqueada con aviso; importe mal
  escrito señalado en el campo; apertura con $ 20 y Bs. 1.500,00 → «Turno abierto en Prueba B31 Caja»,
  barra «Turno desde 2:14 pm»; la caja cobra desde ese equipo; Inicio «Turno desde 2:14 pm · Marisol
  Prieto» y en gaveta $ 20,00 / Bs. 1.500,00. Caja sin turno, apertura y turno abierto a 1366×768,
  1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
- [x] **B3-2 · Medios de pago, terminales y datos de cobro** persistidos; los datos de pago, **cifrados
  en reposo** (F4-02, F4-04). Se borran `src/demo/medios.ts` y la parte de medios de `caja.ts`.
  → Añadir un medio no requiere desplegar (F4-02). El dato obligatorio de cada medio se exige y no
  aparece en ningún log (F4-04).
  *Hecho el 2026-09-27 (v0.21.0):*
  *· Decisión: el medio del libro deja de ser la lista cerrada de §5.5 y pasa a ser un código del
  catálogo del local (§9.9 manda sobre el «enum tipado» de §5.5); los siete de §5.5 son el catálogo
  con el que nace un local. La FK del libro lleva la moneda, así que un asiento sigue sin poder ir en
  otra moneda que la de su medio.*
  *· Dominio (`@l2/domain-cash`, `medios.ts`): `DEFAULT_LEDGER_METHODS`, `methodDefinitionProblem`
  (solo da vuelto el efectivo de la gaveta, que no pide referencia), `offerProblem` y
  `offeredMethods` (encendido y con los datos del local). `entryProblem` recibe el medio y exige los
  datos que pide (FALTAN_DATOS, DATOS_DE_OTRO_MEDIO, DATOS_SOBRANTES). 12 pruebas nuevas.*
  *· Contrato: `CodigoMedioSchema`; mandos `AÑADIR_MEDIO` (nace apagado) y `AÑADIR_TERMINAL` sin
  identificador (lo pone el servidor); el asiento lleva `datos` (solo en un cobro) y el libro los
  devuelve enmascarados (`enmascararDatos`); `claveDeReferencia` es la misma en la caja y en el
  servidor. 4 pruebas nuevas.*
  *· Base: migración `20261004000000_medios_de_pago`: `payment_method` (sin borrar ni redefinir;
  se enciende, se apaga y se renombra), `pos_terminal` (se retira una vez; dos vigentes no se llaman
  igual) y `collection_details` (solo-agregar, cifrada), con RLS. El libro cita el medio con su
  moneda (FK compuesta; se retiran los CHECK de la lista cerrada) y guarda `reference_cipher` (con
  la forma del cifrado: un dato en claro no entra), `reference_digest` y `terminal_id` (de su
  sucursal); un disparador exige vuelto de un medio que lo da, cobro de un medio encendido, los datos
  que pide y un terminal vigente. La migración siembra los siete medios en cada local existente. 7
  pruebas nuevas.*
  *· Aplicación: `medios.leer` (con persona en sesión) y `medios.aplicar` (`catalogo.modificar` con
  elevación; valida la configuración resultante antes de guardar; asientos `medio.*` y `terminal.*`
  sin los datos). `pagos.asentar` toma el medio del catálogo (IGTF según su `triggersIgtf`), rechaza
  uno apagado o sin los datos del local, cifra los datos del pago y rechaza una referencia ya cobrada
  y no revertida (huella HMAC con clave derivada y candado por huella). Un local nuevo nace con los
  siete medios (`sucursal.asegurar`). 17 pruebas de medios y 6 más en el libro.*
  *· Web: `medios.servidor.ts` (solo con sesión: la pantalla de acceso no recibe los datos de cobro) y
  `medios.acciones.ts`; `MediosProvider` sin `sessionStorage`. Caja → Medios de pago en tres pestañas
  (Medios, Datos para el cliente, Terminales) con «Añadir medio» en una hoja. La caja ofrece
  `offeredMethods` y, con más de seis, la sexta casilla es «Otros medios» (con siete, «Cerrar cobro»
  se salía de la pantalla a 1366×768). Se borran `src/demo/medios.ts` y `src/demo/caja.ts`.*
  *· Logs: la redacción no tapaba `document` ni `holder` (el RIF del Pago Móvil del local, la cédula de
  quien paga y el titular de un Zelle viajan con esos nombres); ahora sí, con `documentId` como
  excepción explícita.*
  *· Comprobado en el navegador: apagar y encender Pago Móvil con elevación; un teléfono mal escrito,
  señalado; añadir y retirar un terminal (dos pasos); «Añadir medio» normaliza el código y rechaza
  un efectivo que pide referencia; Biopago añadido nace apagado, se enciende y la caja lo ofrece en
  «Otros medios»; Punto crédito (apagado) no sale en la caja; Pago Móvil enseña los datos del local
  leídos del servidor. Medios, Datos, Terminales y caja a 1366×768, 1280×800 y 800×1280 sin desplazar
  el documento, con «Cerrar cobro» a la vista; sin errores de consola.*
- [x] **B3-3 · Cobro mixto y vuelto en el servidor** contra el libro, con la tasa congelada (F4-03,
  F4-04b, F4-04c, §5.6). Necesita B9-1: la venta de mostrador vende del catálogo de la base y tiene su
  tipo de cuenta «mostrador». Las cuentas dejan de vivir en el almacenamiento del navegador.
  → Un cobro que no cuadra al céntimo no se confirma. Un cobro con una tasa que ya no es la vigente se
  rechaza fuera de un margen corto (ADR-019).
  *Hecho el 2026-09-28 (v0.24.0), en `feat/b3-3`. **Alcance acordado con el cliente: todas las cuentas**
  (familia, mesa y mostrador) salen del navegador; el importe del parque y de la mesa sigue llegando
  de la pantalla hasta B4-2 y B6-1 (deuda a anotar en §5). Anular un cobro pasa al servidor en este
  paso (el libro lo exige), con la autorización 🔐 comprobada allí; cortesía y descuento siguen en B3-4.*
  *· Dominio `@l2/domain-cash` (`cuenta.ts`, depende ahora de `@l2/domain-tax`): `chargeableLines`,
  `documentLinesOf` (cada línea con su IVA), `markPaid`, `markPartPaid`, `revertPaid` y
  `accountChangeProblem`, que dice qué cambio de una pantalla acepta el servidor: marcar pagado es del
  cobro, una línea pagada no se toca, lo consumido no se quita (solo lo de mostrador sin pagar), lo
  movido no se mueve otra vez, las partes cobradas las cuenta el cobro y una línea nueva de un
  producto lleva el precio, el nombre y el IVA del catálogo de ese instante. 19 pruebas.*
  *· Dominio `@l2/domain-rates`: `citedRateValid` y `COBRO_GRACE_MS` (10 min): la tasa de un cobro
  vale para cerrarlo si rige ahora o regía hace menos de 10 min. 3 pruebas.*
  *· Contrato: la cuenta lleva `kind` (FAMILIA, MESA, MOSTRADOR; se retira el truco del id `c-dir-`)
  y `version`; `cuentas.ts` con `GuardarCuentaCommandSchema` (UUID que genera la pantalla),
  `CobrarCuentaCommandSchema` (clave, cuenta, versión, `lineIds`, el `total` que veía la pantalla,
  pagos sin IGTF ni tasa, `rateId`, destino de lo que sobra), `AnularCobroCommandSchema` (con
  `cobroKey`) y `CuentaYLibroSchema`. 8 pruebas.*
  *· Base: migración `20261006000000_cuentas`: `account` (tipo, número de orden único por sucursal,
  quién la abrió) y `account_version` (la cuenta entera en JSON; su `status` en columna igual al del
  JSON; `cause` GUARDAR, COBRO o ANULACION, estos dos con su `operation_key`, una vez cada una), las
  dos de solo-agregar y con RLS; **`payment.document_id` pasa a ser FK a la cuenta** (salda la deuda
  de §5). 5 pruebas nuevas y las del libro ajustadas.*
  *· Aplicación `caja/cuentas.ts` (quinto commit): `leer` (quien trabaja con cuentas; las no cobradas
  y las cobradas hoy, en su última versión; sin las ventas de mostrador vaciadas, `isDiscardedDraft`),
  `guardar` (permiso según el tipo; `accountChangeProblem` contra el catálogo del instante; número de
  orden con candado por sucursal, apertura y entrada en la cola del servidor; reintento de un alta y
  guardar lo mismo no añaden versión; otra versión → CONFLICTO; dar o quitar cortesía exige no tener
  `cuenta.cortesia` DENEGADO), `cobrar` (en UNA transacción: versión y líneas iguales a las de la
  pantalla, IVA e IGTF del instante, la parte con `allocate`, USDT a la par, `citedRateValid`, el
  total igual al de la pantalla o CONFLICTO, `closeSettlement` con `MAX_RESIDUO` $ 0,05 hasta B4-4,
  asientos COBRO y lo que sobra como VUELTO, PROPINA o RESIDUO en `EFECTIVO_USD`, versión COBRO),
  `anular` (`cobro.anular` o 🔐; reversión de cada asiento del cobro; qué vuelve a deberse sale de
  comparar versiones con `linesPaidBetween`; versión ANULACION) y `autorizadores`. `pagos.ts` expone
  `asentarEn`, `revertirAsientoEn`, `leerLibroEn`, `huellasDe` y `catalogoDe` para usarlos dentro de
  esa transacción; `tasas.ts`, `historialParaCobrar`. Auditoría: `cuenta.abrir`, `cuenta.guardar`,
  `cuenta.cobrar` y `cuenta.anular_cobro`. 19 pruebas contra la base.*
  *· Pruebas del libro: cada documento es una cuenta real (`crearCuenta` en `para-pruebas.ts`).*
  *· `revertPaid` con cuenta dividida: anular una parte resta esa parte y la división sigue; si la
  cuenta estaba completa, vuelve a deberse lo que marcó pagado la última parte. 4 pruebas nuevas.*
  *· Web: `CuentasProvider` contra el servidor: lectura en el layout (`cuentas.servidor.ts`), sondeo
  de 5 s y al volver el foco, `cuentas.acciones.ts` (leer, guardar, cobrar, anular, autorizadores).
  Guardar es optimista y en cola por cuenta: el cambio que sigue a otro de ESTE equipo lleva la
  versión que el servidor dio al primero; uno hecho sobre lo que otro equipo cambió recibe CONFLICTO;
  un rechazo se avisa y se vuelve a lo de la base. Fuera `sessionStorage` y el canal entre pestañas.
  Entrada, mesas y caja crean cuentas con tipo y UUID; `esVentaDirecta` y `esLineaDeMostrador` van
  por el tipo y el producto; los ids de línea ya no se truncan. Se quitan `marcarCobrada`,
  `marcarParteCobrada` y `revertirCobro` de la pantalla. La caja cobra con la acción (clave estable
  por intento: un reintento no cobra dos veces), cita el id de la tasa del cobro y registra la venta
  con la cuenta que devuelve el servidor y la clave del cobro (`cobroKey`, nuevo en
  `VentaCerradaSchema`). El diálogo de anular pide los autorizadores al servidor (con su rol) y le
  manda el PIN; la administración anula sin PIN; el Turno ya no recibe el directorio de ejemplo.*
  *· Logs: Next escribía en su registro los argumentos de cada acción del servidor (el PIN de
  `entrar`, y con este paso el de quien autoriza y las referencias de pago). `logging.serverFunctions:
  false` en `next.config.ts`; comprobado: cero PIN en el registro tras anular con PIN malo y bueno.*
  *· Comprobado en el navegador (Playwright, local de desarrollo): venta de mostrador #0001 cobrada con
  $ 1,00 en efectivo (IGTF 0,03) y Bs. 359,94 a 857,0058, dos asientos en el libro; entrada en
  prepago → caja → $ 20 con vuelto $ 15,92 (la familia sigue dentro: la cuenta queda abierta); mesa 1:
  el mesero pide y manda la cuenta, la cajera la ve llegar en otro equipo por el sondeo y la cobra
  dividida en dos partes de Bs. 7.953,01; anular desde Turno como cajera: lista de autorizadores del
  servidor, PIN malo → «PIN de autorización incorrecto.», PIN de Luis Guerrero → dos reversiones
  autorizadas por él y la cuenta a «por cobrar», todo auditado. Caja, Turno, Mesas y Entrada a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
- [x] **B3-4 · Ventas del turno**, dentro de la sección Turno (M-13): reimprimir queda como copia
  auditada y anular es una reversión (DEC-24). Las autorizaciones 🔐 de la caja (anular, cortesía, descuento) van al servidor con
  `exigirPermisoOAutorizacion`: se quitan los PIN «1970» comprobados en el navegador y se borra
  `src/demo/usuarios.ts`.
  *Hecho el 2026-09-28 (v0.25.0):*
  *· Dominio: D-AUT con su propuesta (`canAuthorize`): supervisión se autoriza a sí misma en la caja,
  no en `tasa.confirmar` ni en `inventario.ajustar` (`SIN_AUTORIZARSE_A_SI_MISMO`). La cortesía sale
  del «guardar»: `accountChangeProblem` rechaza darla o quitarla desde la pantalla
  (CORTESIA_DESDE_LA_PANTALLA) y nacen `courtesyProblem` y `withCourtesy`. 7 pruebas nuevas.*
  *· Contrato: `VentaCerradaSchema` es la venta del servidor, con datos y no textos (líneas, IVA por
  alícuota, IGTF, tasa, pagos con lo que se devolvería y su referencia enmascarada, lo que sobró,
  cliente con el documento enmascarado, impresiones y anulación); `ReciboSchema` queda como forma de
  presentación. El cobro lleva `cliente`; anular lleva `devoluciones`; nacen `CortesiaCommandSchema`,
  `VentasDelTurnoSchema`, `ImprimirVentaCommandSchema` y `enmascararDocumento`.*
  *· Base: migración `20261007000000_ventas`: `sale` (una por cobro, su contenido cita su cuenta, su
  clave y su total; solo en un turno abierto de su sucursal), `sale_print` y `sale_void` (una por
  venta, la referencia de devolución solo cifrada: un CHECK rechaza la clave `reference` en claro),
  las tres de solo-agregar con RLS; la versión de una cuenta admite la causa CORTESIA. 4 pruebas.*
  *· Aplicación: el cobro crea la venta en su transacción (`CuentaYLibro` la devuelve); `anular`
  exige una devolución por cada pago con algo que devolver (por su medio con referencia, o en
  efectivo explicándolo) y guarda la anulación; `cortesia` (🔐 comprobado, el servidor pone quién y
  cuándo, versión CORTESIA con su clave); `ventas.delTurno` e `imprimir` (original y copias,
  auditadas `venta.imprimir`/`venta.reimprimir`). `exigirPermisoOAutorizacion` acepta
  `confirmarConPin`: anular y regalar piden el PIN también a quien puede por sí mismo. 11 pruebas
  nuevas en la caja y una en tasas.*
  *· Web: `VentasProvider` y las ventas del turno del servidor (`ventas.servidor.ts`,
  `ventas.acciones.ts`), sin `sessionStorage`; el recibo lo arma `reciboDeVenta` desde la venta; la
  caja ya no compone el recibo. `Autorizacion.tsx` (lista y PIN del servidor) en anular y cortesía;
  el diálogo de anular, a dos columnas desde tablet, ya no desplaza a 1366×768. Se borra
  `src/demo/usuarios.ts`: no queda ningún PIN «1970» en el navegador. Lo regalado no se mueve a una
  mesa.*
  *· Comprobado en el navegador: cortesía como cajera (Luis Guerrero la autoriza; PIN malo rechazado),
  el recibo la enseña tachada con su motivo; cobro con vuelto; recibo desde la venta; imprimir y
  reimprimir (original y copia anotados); anular como cajera con supervisión y como administración con
  su propio PIN (sin PIN y con PIN malo, rechazado en su campo). Caja, Turno y los diálogos de anular
  y cortesía a 1366×768, 1280×800 y 800×1280 sin desplazar; sin errores de consola.*
  *· El descuento (`cuenta.descuento` en la matriz) no tiene pantalla ni tarea propia: no hay nada que
  mover al servidor. Anotado en §5.*
- [x] **B3-5 · Cortes X y Z, arqueo y excepciones reales** derivadas del libro, cortesías y
  anulaciones incluidas (F4-05 a F4-08). Hoy las excepciones son un dato fijo. Según JORNADA §3 a §5
  (M-13): abrir turno comprueba tasa, impuestos, medios, tarifario e impresora y lista lo que falta;
  **relevo** («Cambiar de cajera») con arqueo y Z de quien sale; **arqueo a ciegas** por moneda y
  denominación; el Z lo firma la cajera si la diferencia no pasa del umbral y supervisión (🔐) si lo
  pasa; supervisión cierra un turno ajeno desde otro equipo; «Cerrar la jornada» lista los
  pendientes (cuentas por cobrar; niños en sala con B4-3; mesas y comandas con la Etapa 6) y no
  ofrece el Z hasta resolverlos; el resumen del día en Inicio sale del libro.
  → Después del Z, ninguna operación toca ese turno. Ninguna jornada se cierra con pendientes.
  *Hecho el 2026-09-28 (v0.29.0). D-JOR decidido: incobrable con 🔐, relevo que deja el fondo, umbral con la
  tasa del turno.*
  *· Dominio (`corte.ts`): `ledgerMovements` (solo el cobro y el vuelto mueven la gaveta: la propina y el residuo
  dicen de quién es una parte de lo cobrado, y antes se sumaban dos veces), `countDifferenceInUsd`, `zSigner`
  ($ 1,00), `leftInDrawerProblem` y `withdrawn`. Cuenta: estado INCOBRABLE, `isPendingAtClose`, `markUncollectible`
  y `uncollectibleProblem` (una familia con niños dentro no se da por incobrable: primero su salida). `tallyShift`
  pierde el punto de cobro (el punto es el equipo).*
  *· Contrato (`cortes.ts`): arqueo por billetes, `ArqueoSchema`, `ExcepcionSchema`, `CorteSchema` (VISTA sin
  gaveta, X, Z con arqueo y cierre), `CorteZCommandSchema`, `PendientesDelCierreSchema` (cuentas, niños en sala,
  huérfanas y turnos de otros equipos), `IncobrableCommandSchema`, `ComprobacionAperturaSchema` y
  `ResumenDelDiaSchema`.*
  *· Base: `20261008000000_cortes` y `20261008010000_cortes_disparador`: `shift_count` y `shift_cut` de
  solo-agregar, un Z por turno, nada se cuenta ni se corta en un turno sellado y una venta de un turno con Z no se
  anula. 4 pruebas.*
  *· Aplicación: `caja/cortes.ts` (vista a ciegas; corte X con la gaveta solo para quien ve la sucursal; arqueo;
  Z con el último conteo y sin dinero nuevo desde él, primero la foto y después el sello, en una transacción; un
  turno ajeno lo cierra solo supervisión; la jornada, negada con pendientes; comprobación al abrir; resumen del
  día), `caja/gaveta.ts` (lo que debería haber en la gaveta según el libro), `cuentas.incobrable` (🔐) y
  `pendienteDe` con el IVA del instante y las partes que faltan. Anular devuelve en efectivo solo lo que la gaveta
  del turno tiene (salda la deuda de §5), y anular una venta de un turno con Z es CONFLICTO (antes, el error de la
  base). Auditoría `turno.arqueo`, `turno.corte_x` y `turno.corte_z` (el CHECK de `audit_log` no admite
  mayúsculas). `confirmarPinPropio`: la cajera firma su Z. 18 pruebas contra la base (`cortes.test-db.ts`); cazaron
  cinco fallos (el Z no sellaba, la propina doble, la auditoría en camelCase, el X de otra caja y la anulación de
  un turno sellado).*
  *· Web: `cortes.servidor.ts` y `cortes.acciones.ts`. `/turno` con la vista del libro, «Corte X», «Cambiar de
  cajera» y «Cerrar la jornada» (`CierreTurno`: pendientes → contar a ciegas → diferencia, qué se deja y firma →
  Z sellado); `PendientesDelCierre` con «Incobrable» (motivo y 🔐) y enlaces para cobrar, dar la salida, cerrar la
  huérfana o el turno ajeno; `?turno=` para que supervisión cierre el de otro equipo («Cerrar este turno»). La
  apertura comprueba tasa, impuestos, medios y tarifario, enseña los turnos que quedaron de días anteriores y
  propone el fondo del último Z. Inicio lee el resumen del día: vendido, cobrado por medio (lo que quedó, no el
  billete entregado), turnos del día con su diferencia y quién firmó, y las excepciones del día. `useAutorizacion`
  firma con el PIN propio. El salón ya no toma una cuenta de mesa incobrable por la vigente. Se borran
  `src/demo/turno.ts`, `PuntosDeCobro` y el tipo `Excepcion`.*
  *· Comprobado en el navegador (Playwright, local): apertura con la comprobación y los turnos de días
  anteriores; relevo que cuadra (a ciegas, PIN malo rechazado, Z de la cajera, el fondo propuesto al entrar); Z
  con $ 5,00 de faltante firmado por supervisión con justificación; supervisión cerrando desde Inicio los turnos
  de otros equipos; «Cerrar la jornada» con cuentas y un niño en sala y sin conteo ofrecido; la salida del niño y
  su cuenta incobrable (PIN malo rechazado), con su excepción en el turno. Apertura, turno, conteo, revisión,
  pendientes, incobrable e Inicio a 1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de
  consola. La jornada completa hasta su Z se prueba contra la base: el local tiene cuentas vivas del cliente, que
  no se tocaron.*

- [ ] **B3-6 · Descuentos configurables** (M-15, V-9; `cuenta.descuento`, que ya estaba en la matriz).
  → Administración crea las reglas en Ajustes → Descuentos (tipo: medio de pago, VIP o manual;
  porcentaje o monto; alcance: toda la cuenta, el parque, el restaurante o categorías; vigencia) y marca
  familias VIP en el directorio. Al cobrar, la caja ve los que aplican: el de medio de pago exige que
  toda la cuenta vaya por ese medio y la 🔐 de supervisión o administración; el manual, motivo de lista
  cerrada y 🔐; administración aplica cualquiera con su PIN y un motivo escrito. Lo calcula el servidor,
  antes del IVA y del IGTF; sale en el recibo y en las excepciones del turno y del día, y anular el cobro
  lo revierte. **Uno por cuenta**: la caja propone el mayor y quien autoriza puede elegir otro (D-DESC).
  **Tope de supervisión en el manual: 20 %**, configurable; administración no tiene tope. Con el IGTF al 0 %
  (V-13), la caja y el recibo no enseñan su línea.
  → Ningún descuento sin regla o autorización en la auditoría; el total con descuento cuadra al céntimo
  con el libro.
- [ ] **B3-7 · Carga de lo anotado en papel** (M-15, V-12; JORNADA §4 y §7).
  → Tras un corte de los dos enlaces (ADR-021, N2), la cajera carga en su turno las entradas y los
  cobros anotados, cada uno marcado «desde papel» con la hora real que se anotó: la única hora que
  declara la pantalla, acotada a la ventana del corte y auditada (excepción explícita a ADR-017, con su
  ADR al construirla); el servidor guarda además cuándo se cargó. Los formularios salen impresos de la
  app. Los pendientes del cierre listan lo cargado sin revisar y supervisión lo revisa antes del Z.
  → Lo cargado desde papel se distingue en el turno, en Inicio y en la auditoría; ninguna jornada se
  cierra con cargas sin revisar.

### Etapa 4 · Parque (F5, es el producto)

- [x] **B4-1 · `Guardian`, `Kid` y `ParkSession`**, sin entidad pulsera. El código solo es único entre
  estancias activas (F5-01, F5-12, I-04). El directorio de representantes se persiste.
- [x] **B4-2 · Entrada y estancias con cronómetro del servidor**: prepago y postpago, gracia y
  penalización. El monitor usa el tarifario publicado (F5-02, F5-05 a F5-07, ADR-010).
  → Cambiar el reloj de la tablet no altera el tiempo cobrado.
  *B4-1 y B4-2 hechos juntos el 2026-09-28 (v0.27.0; no hay 0.26.0), antes que B3-5 y B5-1 (M-14), en
  `feat/parque`:*
  *· Base: `20261009000000_parque` (y `…010000_parque_disparador`, que corrige un disparador: PL/pgSQL no
  deja leer `NEW.guardian_id` en `guardian`). `guardian` (contacto en dígitos normalizados, único por
  local), `kid` (nace al nombrarlo, DEC-28) y `park_session` (cuenta, familia, niño, pulsera, paquete y
  **condiciones copiadas al entrar**, versión del tarifario, hora del servidor, clave de la entrada y de
  la salida). Índice parcial: una pulsera, una estancia ACTIVA (I-04). La estancia solo avanza de
  ACTIVA a CERRADA, se nombra una vez y su niño es de su familia; el directorio se corrige pero no se
  borra. La versión de una cuenta admite las causas ENTRADA y SALIDA. RLS en las tres. 6 pruebas.*
  *· Dominio: `settleAtExit` (el excedente con su desglose), `admits` (el aforo se llena, no se pasa, y
  una entrada no entra a medias) y `contactKey` (0412-1234567 y +58 412 1234567 son la misma familia);
  en la cuenta, `registerExit`, y `accountChangeProblem` rechaza que una pantalla abra una familia
  (FAMILIA_DESDE_LA_PANTALLA), meta o saque niños (ESTANCIAS_DESDE_LA_PANTALLA) o ponga paquete o tiempo
  de más (PARQUE_DESDE_LA_PANTALLA): **salda la deuda del importe del parque que llegaba de la pantalla**.*
  *· Contrato: `EstanciaSchema` (la estancia con su cuenta, su familia, su paquete y sus condiciones), la
  sala con estancias, la entrada con `paymentMode` y su resultado con la cuenta, la salida (una familia,
  hasta 10 niños) con el desglose y la cuenta, y `BuscarRepresentanteSchema`.*
  *· Aplicación `park/parque.ts` y `park/representantes.ts`: `sala` (quien trabaja con el parque o sus
  cuentas), `entrar` (una transacción: precio y condiciones del tarifario vigente, candado por sucursal
  para aforo y pulseras, familia reconocida por su contacto, cuenta con número de orden y, en prepago,
  en la cola), `salir` (reloj del servidor y condiciones de la entrada; cargar a una mesa responde
  NO_DISPONIBLE hasta el restaurante), `nombrar`, `atendidos` (niños de hoy contra el mismo día de la
  semana pasada), `buscar` (contacto entero), `directorio` y `corregir` (`parque.verContacto`). Todo
  auditado (`parque.entrada`, `parque.salida`, `parque.nombrar`, `representante.corregir`,
  `nino.corregir`) y la entrada y la salida con reintento idempotente. 20 pruebas; las de cuentas abren
  la familia por la entrada (`familiaDePrueba`).*
  *· Web: `SalaProvider` (sala del layout y sondeo de 5 s y al volver el foco; `adoptar` y `quitar` para
  lo que hace este equipo) y la proyección de la operación toma de ella los niños, así salón, caja e
  Inicio ven los mismos. Entrada con la acción (clave estable por intento, busca a la familia con el
  teléfono completo), monitor con cada niño medido con sus condiciones y nombre en el servidor, salida
  con una operación por familia y la cuenta adoptada, la caja encuentra la cuenta por la pulsera en la
  sala, Inicio cuenta los niños atendidos y el directorio de familias se lee y corrige en el servidor.
  Se borran `src/demo/parque.ts`, `src/demo/representantes.ts` y `RepresentantesProvider` (y su
  `sessionStorage`); fuera «Cargar a una mesa» de la salida, que anunciaba una carga que no hacía.*
  *· Comprobado en el navegador con tres equipos: prepago de dos niños enviada a caja, cuenta abierta de
  uno, pulsera ya activa rechazada, familia reconocida al volver con el teléfono escrito de otra manera,
  la sala de OTRO equipo ve a los niños por el sondeo, nombrar desde la ficha, salida con envío a caja,
  la caja de otro equipo recibe las cuentas y abre la de la familia al pasar su pulsera, cobro con
  $ 20, y salida de tres familias a la vez (la ya pagada sale sin cargo). Entrada, sala y salida a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
- [x] **B4-3 · Salida y liquidación**: cobrar en caja o cargar a una mesa sin cobrar dos veces. Incluye
  la recarga de tiempo, las estancias huérfanas y el paso pulsera → cuenta en caja (F5-11, F5-13,
  F5-14).
  *Hecho el 2026-09-28 (v0.28.0). La salida liquida en el servidor con su reloj y las condiciones de la
  entrada, cada familia con su operación y su clave (un reintento no cobra dos veces), y la caja abre la
  cuenta por la pulsera (con B4-2). **Cargar a una mesa espera al restaurante** (Etapa 6, D-RES): el
  servidor responde NO_DISPONIBLE y la salida no lo ofrece. D9 y el umbral de las huérfanas, decididos
  con el cliente (§4).*
  *· Base: `20261010000000_parque_recarga_y_cierre`. `park_session_extension` (una recarga: minutos,
  paquete, precio y su clave; solo-agregar, solo de una estancia ACTIVA de tiempo fijo). La estancia
  dice cómo se cerró (`closure_kind` SALIDA o ADMINISTRATIVA, con motivo) y a quién se entregó
  (`picked_up_by_guardian`, `picked_up_by_name`), y el cierre entero no se reescribe. Causas RECARGA y
  CIERRE_ADMINISTRATIVO en la cuenta. El relleno de las cerradas suspende la RLS forzada solo mientras
  escribe (un primer intento sin eso falló en la base local y se deshizo antes de marcarlo revertido).
  2 pruebas nuevas.*
  *· Dominio: `withRecharges`, `isOrphan` (de un día anterior o más de 8 horas, `ORPHAN_AFTER_MS`) y
  `registerRecharge` (en prepago vuelve a la cola). Matriz: `parque.cerrarHuerfana` (administración y
  supervisión).*
  *· Contrato: la estancia con sus `recargas` (la duración ya las suma), la sala con sus `huerfanas`,
  la salida con `recogida` (REPRESENTANTE u OTRA_PERSONA con nombre), `RecargaCommandSchema` y
  `CierreHuerfanaCommandSchema`.*
  *· Aplicación: `recargar` (paquete de tiempo fijo a la venta, línea `rec-…` en la cuenta, auditada),
  `cerrarHuerfana` (sin tiempo de más; lo contratado se sigue debiendo; con motivo y auditado), la sala
  separa las huérfanas, que no cuentan en el aforo ni se liquidan ni se recargan, y la salida guarda a
  quién se entregó. 5 pruebas nuevas (25 del parque).*
  *· Web: «Recargar tiempo» en la ficha del niño (y sus recargas), aviso «estancias a revisar» en la
  sala y en Inicio con su hoja para cerrarlas con motivo, «Lo recoge: su representante u otra persona»
  por familia en la salida (sin marcarlo no se registra), y el **nombre del niño opcional en la
  entrada** (pedido del cliente): si la familia ya vino, se proponen sus niños conocidos.*
  *· Comprobado con Playwright en dos equipos: entrada con un nombre, familia que vuelve con su niña
  propuesta, recarga de 1 hora desde la sala de supervisión (la ficha dice +60 min y 120 min), la
  huérfana de ayer cerrada con motivo, salida con «otra persona» (el botón no se habilita sin
  marcarlo) y dos familias en la misma salida ($ 25,00 con la recarga). Entrada, sala y salida a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
- [ ] **B4-4 · Ajustes de la sucursal** persistidos: formato de hora, umbral de residuo, servicio y
  umbral de diferencia del arqueo ($ 1,00 o su equivalente, M-13) (F5-08b).
- [ ] **B4-5 · La monitora en el teléfono y las pulseras de un solo uso** (M-15, V-1 y V-2).
  → Entrada, sala y salida en el teléfono del local (360×800 y 390×844, objetivos de 48 px, sin desplazar
  el documento), instalable como aplicación (PWA; la cámara pide HTTPS, que da el staging). La pulsera se
  lee con la **cámara** (QR y código de barras, con el lector del navegador y una biblioteca de respaldo
  si el teléfono no lo trae) o con un **lector Bluetooth** en modo teclado. Un código ya usado en una
  estancia anterior se rechaza, y el formato de la serie (prefijo y longitud) es un ajuste del local. Se
  retira la pantalla de pared del monitor (DEC-18). Se empieza con la cámara; el lector Bluetooth se
  compra si con cola hace falta, y el formato se fija con el primer lote (D-PUL): hasta entonces vale
  cualquier código legible.
  → Una entrada de dos niños en menos de 90 s en un teléfono real (F5-02); una pulsera usada ayer no
  entra hoy.

### Etapa 5 · Tiempo real e impresión (`apps/worker`, ADR-006)

- [x] **B5-1 · Socket.io con adaptador Valkey** y autorización en el handshake (F2-09, ADR-008). El
  monitor, la cola de caja, la tasa y el panel en vivo se actualizan solos, y esto sustituye a
  `BroadcastChannel` y al sondeo de la tasa. Con M-15 (V-8), **todo**: la sala, las cuentas y la cola,
  las existencias, el turno y sus pendientes, las comandas y su impresión, las reservas, la tasa, el
  catálogo, los medios y los equipos; se retiran los sondeos de 5 s (sala y cuentas) y de 60 s (tasa).
  Al mudarse al worker, la sincronización del BCV **deja de retener un salto grande** (V-14, D-CORD), con
  un ADR que supersede esa salvaguarda de ADR-019.
  Los eventos salen de una **tabla outbox** escrita en la
  misma transacción que la operación: ninguno se pierde ni se publica uno de una operación que no
  ocurrió. Nace `apps/worker`, con los trabajos programados: la sincronización del BCV se muda allí.
  → El cambio llega a otro equipo en menos de 2 s. Una sucursal no recibe eventos de otra. Con el
  worker caído, la operación sigue y los eventos se entregan al volver.
  *Hecho el 2026-09-29 (v0.30.0), con [ADR-025](adr/025-tiempo-real-por-outbox.md) y [ADR-024](adr/024-tasa-del-bcv-sin-umbral.md):*
  *· Base: migración `20261011000000_outbox`: `outbox_event` con RLS, que llena un disparador de
  `audit_log` por cada asiento HECHO en la misma transacción, con `pg_notify('l2_outbox')`; la aplicación
  solo marca lo publicado (una vez) y no borra. `escuchar()` en `@l2/database` (LISTEN).*
  *· Contratos: `TemaSchema` (12 temas), `CambioSchema`, `TicketTiempoRealSchema`,
  `EventoDelNavegadorSchema` (solo `mesa.*` y `pedido.*`) y `SesionEnCursoSchema`; fuera `sesion.*` del bus.*
  *· Aplicación: `temasDe` con una tabla exhaustiva sobre `AccionAuditada` (una acción nueva no compila
  sin decidir qué invalida); `tiempoReal.ticket/abrir` (HMAC con clave HKDF de `L2_CLAVE_CIFRADO`, 60 s,
  sesión viva), `latido`, `despachar` (FOR UPDATE SKIP LOCKED, por sucursal, marca con el reloj de la base)
  y `escuchar`; `sesiones.enCurso`. V-14: `autoApplyDecision` sin umbral (siguen SOLO_TERCERO y PRIMERA).
  14 pruebas contra la base (evento en la misma transacción, nada si se deshace o se niega, se republica
  si publicar falla, cada tenant lo suyo, publicado inmutable, el aviso llega al confirmar, ticket tocado,
  caducado o de otro tenant, latido y presencia) y las de tasas al día.*
  *· `apps/worker`: canal Socket.io en `/tiempo-real` con adaptador Valkey, salas por tenant y sucursal,
  vuelta del outbox (aviso + barrido de 5 s), latido de 60 s que cierra el canal de sesiones muertas (al
  momento con una salida, revocación o baja), bus del restaurante revalidado, con la hora del servidor,
  tope de 30 eventos por 10 s y lista por sucursal en Valkey, y la consulta del BCV (fuera del arranque de
  la web). 9 pruebas con un servidor y clientes reales (apretón de manos, F2-09, bus y tope).*
  *· Web: `TiempoRealProvider` (ticket por acción del servidor, reconexión de 0,5 a 2 s, al reconectar se
  relee todo, sin canal se relee cada 30 s y la barra dice «Sin conexión en vivo»); sala, cuentas y tasas
  con `useAlCambiar` y el resto con `router.refresh()`; pendientes del cierre e Inicio en vivo; el bus sin
  `sessionStorage` ni `BroadcastChannel`; quién está en cada puesto, de la base (Inicio avisa «Sin nadie
  en …» con el turno abierto; la cocina ya no cuenta, ADR-022). Fuera los sondeos de 5 s y 60 s.*
  *· Comprobado en el navegador con cuatro equipos: la sala hace 0 peticiones en 12 s sin cambios; una
  entrada llega a la sala de otro equipo a los 1,6 s del clic (con la acción de la entrada incluida); una
  salida saca al niño de otra sala y lo pone en la cola de la caja a los 0,9 s; al salir la cajera, Inicio
  marca la caja vacía a los 48 ms, y al entrar la ve a los 2,3 s del clic (con la verificación Argon2 del
  PIN); con el worker parado la entrada registra, la sala dice «Sin conexión en vivo» y no lo ve, y al
  relanzarlo lo recibe sola (5,6 s con el retroceso por defecto, que se bajó a 2 s). Inicio, sala,
  entrada, caja y turno a 1366×768, 1280×800 y 800×1280 con el canal abierto, sin desplazar el documento y
  sin errores de consola (con el worker caído, el navegador anota que no conecta). Tasas, medios, catálogo
  y equipos usan el mismo camino pero no se vieron cambiar en el navegador (no se tocaron los datos del
  cliente). Las existencias, las comandas y las reservas lo usarán al nacer.*
- [ ] **B5-2 · Cola de impresión por TCP 9100** y plantillas de 58 y 80 mm, más la pantalla
  **Configuración → Impresoras** (contrato `impresoras.ts`) (F1-10, F1-12, ADR-015). Con M-15 (V-4 y V-5):
  una sola impresora, en la caja, por red, para el recibo, el **ticket de corte** (JORNADA §5) y las
  **comandas**; la **impresora de comandas** es un ajuste (hoy la de caja, mañana una en la cocina).
  → El recibo no fiscal sale en papel real en los dos anchos. Sin confirmación de impresión, nada avanza.
- ~~**B5-3 · Gaveta** que solo se abre asociada a una operación (F4-09)~~. **Retirado el 2026-09-28
  (D-GAV):** la impresora de caja no lleva gaveta electrónica; la gaveta es manual. No cuenta en la ruta.

### Etapa 9 · Catálogo e inventario (F8, M-9)

Número nuevo para no renumerar las etapas que el código ya cita. Va antes del staging; su primer paso,
antes del cobro en servidor (orden de ejecución).

- [x] **B9-1 · Catálogo de productos** de venta directa y de consumo en cuenta: nombre, categoría,
  precio en USD con vigencia, código de IVA y si lleva control de stock (F8-02). Pantalla Panel →
  Inventario → Productos.
  → La caja vende del catálogo de la base y se borra `features/cash/catalogo-mostrador.ts`. Cambiar un
  precio no altera una venta ya hecha.
  *Hecho el 2026-09-27 (v0.23.0), con D-INV como la propuesta (solo productos de mostrador):*
  *· Dominio: paquete nuevo **`@l2/domain-inventory`** (PLAN §9.2). `priceTimeline` (el precio es un
  calendario, como las alícuotas: con el mismo comienzo manda el último y un precio igual no abre
  tramo, así se cancela un cambio), `priceAt`, `changesTimeline`, `priceProblem` (mayor que cero,
  hasta $ 10.000,00 y nunca hacia atrás), `nameKey`/`nameClash` (sin mayúsculas, acentos ni espacios
  de más, contando los apartados), `sellableAt` y `categoriesOf`. 18 pruebas.*
  *· Contrato (`productos.ts`): `CatalogoSchema` (vacío vale), `ProductoCommandSchema` (CREAR con su
  primer precio, EDITAR, ACTIVAR y PROGRAMAR_PRECIO con el DÍA; sin «borrar» ni instantes del
  navegador). La línea de la cuenta lleva `productId` y `taxCode` copiados al venderse. 9 pruebas.*
  *· Base: migración `20261005000000_catalogo_de_productos`: `product` (se edita y se aparta; no se
  borra ni cambia quién lo creó; nombre único sin mayúsculas ni espacios de más; CHECK de nombre,
  categoría y trato) y `product_price` de solo-agregar (USD, `amount_minor` BIGINT entre 1 y
  1.000.000, `effective_from >= scheduled_at`, uno por producto e instante, FK compuesta con el
  tenant), las dos con RLS. Nada se siembra: producción nace sin productos (M-12). 5 pruebas.*
  *· Aplicación (`productos`): `leer` (sin persona: la caja vende con él) y `aplicar`
  (`catalogo.modificar` con elevación; hoy rige desde ya y otro día desde su medianoche en Caracas,
  hasta 366 días; lo que no cambia nada se rechaza; asientos `producto.crear|editar|activar|apartar`
  y `precio.programar` con el precio que regía; el rechazo por permiso, auditado). 14 pruebas con
  reloj fijo, con la negativa de permiso, de elevación y de aislamiento.*
  *· Web: `productos.servidor.ts` y `productos.acciones.ts`; Inventario → Productos (a la venta y
  apartados, búsqueda, por categoría con el precio en $ y Bs., «Nuevo producto» y la ficha con el
  calendario de precios, «Programar precio», los datos y «Apartar de la venta»). La caja recibe el
  catálogo del servidor y calcula lo que vende con el mismo instante que las alícuotas; sus pestañas
  salen de las categorías; cada línea copia precio, nombre e IVA, y `lineasParaCobrar` usa el IVA de
  la línea (se retira el «GENERAL» fijo). `importeTecleado` sale de TurnoScreen para compartirse, y
  los billetes, a `billetes.ts`. Se borra `features/cash/catalogo-mostrador.ts`; `pnpm db:semilla`
  carga doce productos de ejemplo en desarrollo.*
  *· Comprobado en el navegador: Productos con los doce; crear «Pirulín» con elevación; «agua
  mineral» repetida y un precio cero, señalados en su campo; apartar «Gomitas» (la caja deja de
  ofrecerla); la malta a $ 1,75 para el miércoles sale «Programado» y hoy sigue en $ 1,50. En la caja,
  una venta de agua a $ 1,00 cobrada ($ 1,31) y otra a medias; al subir el agua a $ 1,20 hoy, la
  venta cobrada sigue en $ 1,31 en Turno, la de a medias conserva su $ 1,00 y la carta ofrece el agua
  a $ 1,20. «Pirulín» exento se cobra sin IVA. Productos, la ficha y la carta de la caja a 1366×768,
  1280×800 y 800×1280 sin desplazar el documento ni desbordar; sin errores de consola.*
- [ ] **B9-2 · Existencias en tiempo real, de solo-agregar** (F8-05, I-10, [ADR-023](adr/023-existencia-al-entrar-en-la-cuenta.md)):
  la existencia es la suma de movimientos. La línea que entra en una cuenta (mostrador, mesa, evento) la
  descuenta en la misma transacción, y quitarla o anular lo no entregado la devuelve. **Sin existencia no
  se vende**, ni en la caja ni en la tablet del mesero; los servicios no llevan existencia.
  → Toda diferencia de existencia tiene un movimiento que la explica. Un doble clic no descuenta dos veces
  y dos ventas a la vez no venden la última unidad dos veces.
- [ ] **B9-3 · Entradas de mercancía y costo promedio ponderado** (F8-06, F8-01): una carga de **varias
  líneas** (compra o reposición, con proveedor y factura opcionales) o de un producto suelto, cada línea
  con cantidad y costo en $, y conversiones de unidad (se compra la caja de 24, se vende la unidad). El
  margen de lo vendido sale del costo promedio. Sin insumos de cocina (después del piloto, M-15).
  → El costo tras dos compras a precios distintos coincide con el cálculo del contador; comprar por caja
  y vender por unidad cuadra.
- [ ] **B9-4 · Salidas y ajustes con motivo de lista cerrada y 🔐, y conteo físico** (F8-07): merma o
  daño, consumo interno, regalo y devolución al proveedor; se cuenta, se ve la diferencia y se ajusta con
  autorización.
  → Ningún ajuste sin motivo ni asiento. El conteo deja la existencia igual a lo contado.
- [ ] **B9-5 · Alertas de stock crítico** con antelación por producto (F8-08), en Inicio y en el
  inventario.
  → Avisa antes de quedarse sin producto.

### Etapa 6 · Restaurante en el servidor (en el piloto desde M-15, que cierra D-RES)

- [ ] **B6-1 · Mesas, plano y carta** persistidos (F6-01 a F6-03). Se borra `src/demo/restaurante.ts`.
- [ ] **B6-2 · Pedidos del mesero y comanda impresa** ([ADR-022](adr/022-cocina-con-comanda-impresa.md), F6-06,
  F6-07 y F6-09, sin F6-08): el pedido confirmado en la tablet crea su trabajo de impresión en la
  impresora de comandas; la comanda queda «enviada» e «impresa», y si falla, la tablet del mesero y la caja
  lo avisan y se reimprime. Se retiran la estación de cocina (KDS) y los estados «en fuego» y «listo».
  → Ningún pedido confirmado se queda sin comanda sin que alguien lo vea.
- [ ] **B6-3 · Cuenta de mesa**, vinculación de pulseras y división (F6-05, F6-12, F6-14), con los
  productos del mesero descontando existencias (ADR-023).
- [ ] **B6-4 · Recetas e insumos de cocina** (F8-03, F8-04, F8-09): **después del piloto** (M-15, V-7); no
  cuenta en la ruta. ADR-023 supersede la descarga al marcar LISTO de ADR-012: su disparador será otro ADR.

### Etapa 10 · Eventos: cumpleaños (M-15, V-10)

- [ ] **B10-1 · Reservas con agenda y anticipo**: fecha y horario, cliente (del directorio de familias),
  número de niños invitados y paquete (el alquiler como servicio y los productos que incluye) con su
  precio; cada paquete lo carga administración con su **mínimo y máximo de invitados** (nunca por encima
  del aforo). El **anticipo es el 50 % del paquete**, configurable (D-EVT), y se cobra en la caja contra la **cuenta del evento** (en el libro y con su venta) y
  el saldo queda para el día. Parque → Eventos; Inicio y la apertura del turno avisan «Hoy hay un evento».
  → Un anticipo cobrado sale en el turno en que se cobró; devolverlo es anular su cobro (DEC-24).
- [ ] **B10-2 · El día del evento**: los invitados entran con pulseras a la cuenta del evento (cuentan en
  el aforo), el paquete descuenta sus productos (ADR-023) y el saldo se cobra en la caja; la cuenta del
  evento sale en los pendientes del cierre hasta cobrarse.
  → Un evento de punta a punta en el sistema real: reserva, anticipo, entrada de invitados y saldo.

### Etapa 7 · Staging en VPS

- [ ] **B7-1 · VPS con Docker, HTTPS y dominio**; despliegue reversible y migraciones ensayadas antes
  (F1-15, §10.3).
- [ ] **B7-2 · Datos maestros reales** cargados con semillas (`pnpm db:seed`) (F0-04, F1-16).
  **Bloqueado por el cliente.**
- [ ] **B7-3 · Medición con red real**: carga, error y degradación con latencia de verdad (RIE-13); la
  app en el teléfono de la monitora, la tablet del mesero y la laptop de caja reales, también por el 4G
  de respaldo (T-5, M-15); los 12 tamaños otra vez.
- [ ] **B7-4 · Respaldos**: volcado diario cifrado fuera del VPS y una **restauración ensayada**
  (F10-04, F10-05).
- [ ] **B7-5 · Revisión de seguridad** contra PLAN §7 y auditoría de dependencias (F10-06, F10-09).

### Etapa 8 · Producción

- [ ] **B8-1 · La red del local** ([ADR-021](adr/021-servidor-en-la-nube.md), D-INF decidido en M-15): internet
  principal y router 4G de respaldo con conmutación automática, UPS en router, módem y WiFi, y los equipos
  del local aprobados (F10-03).
  → Con el enlace principal desconectado, la caja cobra y la sala se actualiza por el 4G.
- [ ] **B8-2 · Runbooks, contingencia en papel, manual y capacitación por rol** (F10-10, F11-02,
  F11-03, F11-08). Incluye los formularios de papel y su procedimiento para cuando caigan los dos
  enlaces (la carga es B3-7).
- [ ] **B8-3 · Operación en paralelo** con el método anterior, piloto de un turno y ajustes (F11-04 a
  F11-06).
  → Los totales de los dos sistemas coinciden todos los días del período.
- [ ] **B8-4 · Puesta en marcha con plan de reversión** (F11-07). **Es la versión 1.0.0** (M-10).

---

## 4. Lo que bloquea y quién lo desbloquea

**Decide el cliente**

| # | Decisión | Propuesta | Hace falta antes de |
|---|---|---|---|
| ~~D-INF~~ | Producción solo en un VPS, o servidor en el local | **Decidido el 2026-09-28 (M-15, ADR-021):** un solo VPS, con internet de respaldo 4G y UPS en el local; si caen los dos enlaces, papel (B3-7) | B8-1 |
| ~~D-JOR~~ | Lo abierto de la jornada (JORNADA §7) | **Decidido el 2026-09-28:** una cuenta que no se puede cobrar se marca **incobrable** con motivo y 🔐 de supervisión (sale en las excepciones y deja cerrar la jornada; nada se borra); en el **relevo** la que sale retira lo vendido y deja solo el fondo, que la que entra declara al abrir; la diferencia en bolívares se lleva a dólares **con la tasa del turno** y cuenta contra un solo umbral de $ 1,00. Queda abierta la carga del papel (B8-2) | B3-5 |
| ~~D-RES~~ | ¿El piloto incluye el restaurante en el sistema? | **Decidido el 2026-09-28 (M-15):** sí, sin pantalla de cocina (ADR-022) | Etapa 6 |
| F0-04 | Datos maestros reales: tarifas, carta, precios y personas | Los editores ya existen para cargarlos | B7-2 |
| F0-03 | Medidas reales del local para el plano | — | B6-1 |
| ~~D7~~ | Quién asigna los puestos de trabajo | **Decidido el 2026-09-28:** salen del rol y del equipo aprobado (`PUESTO_DE_ROL`), sin pantalla de asignación | B1-5 |
| ~~D9~~ | Un niño que sale sin su representante | **Decidido el 2026-09-28:** la salida pregunta «Lo recoge: su representante u otra persona» y, si es otra, su nombre; no bloquea, pero queda constancia. Y una estancia es **huérfana** si sigue abierta desde un día anterior o lleva más de 8 horas: no cuenta en el aforo y la dirección la cierra con motivo, sin tiempo de más | B4-3 |
| ~~D13~~ | Número de orden continuo o diario | **Decidido el 2026-09-28:** continuo, por sucursal (como está) | B3-4 |
| — | Informes del panel ejecutivo (F9-01 a F9-07) | Después del piloto; Inicio ya enseña el día | — |
| ~~F-12~~ | ¿El teléfono entra en el objetivo? | **Sí (M-15):** la monitora trabaja en un teléfono | B4-5 |
| F0-09 | Firma formal del alcance | Las 29 decisiones están cerradas | B8-3 |
| ~~D-CORD~~ | Umbral de cordura de la tasa automática (M-8) | **Decidido el 2026-09-28 (V-14):** sin umbral; la del BCV se aplica siempre, y si la API falla se carga a mano | B5-1 |
| ~~D-FER~~ | Calendario de feriados bancarios de Venezuela | **Decidido el 2026-09-27:** se carga por año desde el panel copiando el calendario de SUDEBAN (cambia cada año: Carnaval, Semana Santa y feriados trasladados) | B2-4 |
| ~~D-INV~~ | Alcance del inventario en el piloto | **Decidido el 2026-09-28 (M-15, V-7):** lo que se vende tal cual y los servicios, con costo promedio; lo que no hay no se vende; insumos y recetas después del piloto | B9-2 |
| ~~D-DESC~~ | ¿Se suman dos descuentos? ¿Tope del manual de supervisión? | **Decidido el 2026-09-28:** uno por cuenta, el mayor (quien autoriza puede elegir otro); tope de supervisión 20 %, configurable | B3-6 |
| ~~D-EVT~~ | Anticipo e invitados de un cumpleaños | **Decidido el 2026-09-28:** anticipo del 50 % del paquete, configurable; mínimo y máximo de invitados por paquete, que carga administración con lo que incluye | B10-1 |
| ~~D-PUL~~ | Formato de las pulseras y lector Bluetooth | **Decidido el 2026-09-28:** el formato se fija con el primer lote (hasta entonces, cualquier código legible); se empieza con la cámara y el lector se compra si hace falta | B4-5 |
| ~~D-GAV~~ | ¿La impresora de caja lleva gaveta de dinero? | **Decidido el 2026-09-28:** no; la gaveta es manual y B5-3 sale de la ruta | — |
| ~~D-AUT~~ | ¿Supervisión puede autorizarse a sí misma un 🔐? | **Decidido el 2026-09-28:** sí en la caja (con PIN y motivo, en la auditoría); no en tasas ni en ajustes de inventario. Como lo aplicó B3-4 | B3-4 |

**Confirma el contador** (lo fiscal queda fuera, pero esto cambia lo que se cobra)

- ~~**IGTF sobre el vuelto (C13).**~~ **El cliente decidió no cobrar IGTF por ahora** (2026-09-28, V-13): se
  programa al 0 %. Si vuelve, esta pregunta se le hace al contador antes de encenderlo.
- USDT a la par con el dólar para el cobro y para el IGTF.
- Alícuotas vigentes: IVA general 16 % y exento; el reducido no se usa en el local (v0.30.1); IGTF al 0 %
  por decisión del cliente (V-13). Con B2-2 se
  cambian sin desplegar.

**Trabajo de campo:** probar la cámara del teléfono con las pulseras reales y, si lo compran, calibrar el
lector Bluetooth (umbrales de 55 y 45 ms) (B4-5); probar la impresora y la gaveta reales (B5-2); instalar la
app en el teléfono, la tablet y la laptop (B7-3, necesita HTTPS); y probar el paso al 4G (B8-1).

---

## 5. Deuda y errores ya vistos

**Deuda registrada**

| Qué | Se salda en |
|---|---|
| `text-base` pinta también `--color-base` (Tailwind 4): para 16 px se usa `text-[16px]` | Al pasar por cada pantalla |
| Un código TOTP se puede reutilizar dentro de su ventana de 30 s (elevar y aprobar equipos) | T-4 (se retira el TOTP, ADR-020) |
| El primer administrador y sus credenciales solo se crean por consola (`pnpm credenciales`): una base vacía no arranca sin ella | T-4 (instalación inicial y enlace de alta, M-12) |
| La IP es la última de `x-forwarded-for`: correcto con UN proxy delante; con dos (p. ej. Cloudflare + Caddy) hay que contar saltos. En desarrollo, sin proxy, se puede falsear | B7-1 |
| La medición de interfaz vive fuera del repo (`C:/tmp/pw_test`) | B7-3 (`pnpm audit:ui`) |
| Sin Storybook; sin `apps/printer-agent` (DEC-8: la impresora es de red) | Fuera de la Ruta A |
| La zona horaria es `America/Caracas` en el código | B4-4 |
| Con el IGTF al 0 % (V-13, programado el 2026-09-29) la caja y el recibo enseñan su línea en cero | B3-6 |
| Los feriados de cada año los carga el cliente a mano desde el calendario de SUDEBAN; si se olvida, ese día exige la tasa a mano | Operación (runbook, B8-2) |
| Una pendiente traída antes de B2-1c no tiene `held_back`: no sale como alerta (solo afecta a bases con datos viejos) | Base limpia antes del piloto |
| El motivo de una retenida es el del momento en que se trajo: si al volver a mirarla cambia (p. ej. de SOLO_TERCERO a PRIMERA), el texto de la alerta no lo dice | Cuando haga falta |
| La billetera USDT del local no se configura ni se le enseña al cliente | Cuando el cliente la pida (F0-04) |
| Los medios no se reordenan ni se renombran desde el panel (la base lo admite) | Cuando haga falta |
| El importe de la carta de la mesa llega de la pantalla (el del parque ya lo pone el servidor, B4-2), y lo que se mueve del parque a una mesa también | B6-1 (carta y mesas) |
| La estación de cocina (KDS) y los estados «en fuego» y «listo» siguen en la app, sobre el bus del navegador | B6-2 (ADR-022) |
| El teléfono no lee pulseras con la cámara (solo lectores en modo teclado), y un código ya usado puede volver a entrar | B4-5 |
| «Vincular a una mesa» (ficha del niño) y el salón viajan por el bus de un navegador; cargar el parque a una mesa desde la salida no existe | Etapa 6 (D-RES) |
| Un niño sin nombre sale en la tarjeta de la sala con su pulsera dos veces (título y subtítulo) | Al pasar por la sala |
| El umbral de las huérfanas (8 horas) está en el dominio, no en los ajustes del local | B4-4 |
| La tasa se enseña redondeada a dos decimales: un importe en bolívares calculado con la tasa completa puede no coincidir al céntimo con multiplicar a mano por la que se ve | Aceptado (pedido del cliente, v0.27.1) |
| Una venta de mostrador vaciada consume su número de orden (queda en la base, sin salir en la cola) | Aceptado: sus versiones dicen qué se quitó y quién |
| Anular una parte intermedia de una cuenta dividida y volver a cobrarla puede dejar el total a un céntimo del documento (el reparto va por índice de parte) | Cuando el cliente cobre dividido con anulaciones (F6-12) |
| El descuento (`cuenta.descuento`, 🔐 en la matriz) no existe en la caja: ni pantalla ni tarea del PLAN | Cuando el cliente lo pida (va al servidor con `exigirPermisoOAutorizacion`) |
| Devolver en efectivo lo que entró por otro medio (Pago Móvil, punto) saca de la gaveta un efectivo que el libro no apunta: el arqueo lo verá como faltante | Un asiento de salida de caja en el libro, cuando el cliente lo necesite |
| El ticket de corte no se imprime (el Z queda sellado y se ve en pantalla) | B5-2 |
| El umbral del arqueo ($ 1,00) está en el dominio, no en los ajustes del local | B4-4 |
| El resumen del día no separa lo vendido del parque y del restaurante (JORNADA §5) | Cuando el cliente lo pida |
| Los pendientes del cierre no traen mesas ni comandas del restaurante (una mesa abierta sale como cuenta) | Etapa 6 |
| La venta guarda el documento del cliente enmascarado: una factura fiscal necesitará el completo | F3 (fuera por M-3) |
| Lo que cambia solo con el reloj no produce evento: una estancia que pasa a huérfana a las 8 horas se ve con el siguiente cambio de la sala o al navegar (el estado de cada niño y la tasa del día sí se calculan en la pantalla) | B4-4 |
| `outbox_event` crece con cada asiento; purgar lo publicado de más de unos días (con el migrador) no está escrito | Runbook (B8-2) |
| En `pnpm dev`, turbo para todo si una tarea se cae: sin Valkey el worker no arranca y la web tampoco queda | Aceptado (en producción son dos procesos) |
| El bus del restaurante declara nombres de quien autoriza o ve una anulación (`pedido.*`), como antes | B6-2 |

**Inventario de lo provisional y lo simulado (M-11).** Lo que queda al 2026-09-26. Cada fila sale de
aquí en el paso que la sustituye, y T-2 comprueba que no quede ninguna.

| Qué | Dónde | Se va con |
|---|---|---|
| Ajustes del local guardados en el navegador | `src/demo/sucursal.ts`, `SucursalProvider` | B4-4 |
| Plano y carta del restaurante guardados en el navegador | `src/demo/restaurante.ts`, `PlanoProvider`, `CartaProvider` | B6-1 |
| Puestos deducidos del rol (`PUESTO_DE_ROL`) | `features/identity/operador.ts` | D7 |

**Trampas del código.** Ninguna la caza `pnpm typecheck`; todas se ven abriendo la pantalla.

- `can()` devuelve una palabra (`PERMITIDO`, `REQUIERE_AUTORIZACION` o `DENEGADO`), no un booleano. Se
  compara siempre así: `can(...) !== "DENEGADO"`. Escribir `actor ? can(...) : false` da cierto para
  cualquiera. Mejor crear un ayudante con nombre, como `alcanza(actor, accion)`.
- `MoneyDisplay` pinta unidades **mayores** (`toMajor`). Si recibe unidades menores, «$ 5,00» sale
  como «500».
- Para nombrar a un niño se usa `nombreVisible` o `nombreDeEstancia`, nunca `kid.nickname ?? kid.name`,
  porque el nombre es opcional desde DEC-28.
- Nada de `parseFloat` ni `toFixed` sobre dinero o tasas. Nada de `require()` en un componente de
  cliente. Los relojes (`useAhoraLocal`) no deben colgar del pintado de un proveedor. Un dato se decide
  con una bandera, no leyendo el texto.
- Las raíces de pantalla necesitan `min-h-0` para que desplace la lista y no toda la zona.
- **El documento no desplaza nunca desde 768 px.** Las dos cáscaras (panel y estación) van con
  `md:fixed md:inset-0` y `html`/`body` con `overflow: hidden`: solo desplazan sus zonas. Una
  pantalla nueva NO pone `h-dvh` ni `min-h-screen` propios; reparte su alto dentro de la zona de
  contenido (`min-h-0` + `overflow-y-auto` donde toque). Sin esto, cualquier cosa colgada de
  `<body>` (una extensión del navegador, p. ej.) daba doble barra y se llevaba el menú.
- La web guarda la conexión con `@l2/application` en `globalThis`: tras añadir un caso de uso o un
  método, **reiniciar `pnpm dev`**, o sale «Cannot read properties of undefined».
- Un dato provisional de `src/demo` que se valida contra un contrato (p. ej. el monitor lleva una
  tasa) revienta al abrir la pantalla si el contrato cambia: `pnpm typecheck` no lo ve.
- Una prueba que depende del día (la tasa, el día de negocio) corre con **reloj fijo**; con la hora real
  da otra cosa según el día de la semana (la del viernes vale el sábado).
- Una fracción de `@l2/domain-rates` está **reducida** (229,05 = 4581/20): para escribir una tasa se usa
  el valor capturado con `formatTasaVE`, nunca el numerador.
- Un CHECK con `columna IN (...)` sobre una columna que admite nulos **deja pasar el nulo** (`NULL IN`
  es desconocido, y un CHECK desconocido pasa). Se escribe `columna IS NOT NULL AND columna IN (...)`.
- **Dentro de una transacción, nunca dos consultas a la vez.** Tiene una sola conexión: `pg` avisa
  («Calling client.query() when the client is already executing a query», en el registro y en el
  aviso de Next) y en `pg@9` será un error. Dos formas de provocarlo: `Promise.all` con `tx` (la regla
  `transaccion-sin-consultas-a-la-vez` de `pnpm lint` lo caza) y un **`include` con tres relaciones al
  mismo nivel**, que Prisma 7 resuelve en paralelo (el lint no lo ve): con dos, o con una anidada, no
  pasa. La tercera relación va en su propia consulta (así `estancias()` en el parque).
- `$queryRaw` de Prisma no sabe leer una columna `void`: `SELECT pg_advisory_xact_lock(...)` revienta
  al volver. Se castea (`::text`).
- El servidor del BCV manda incompleta su cadena TLS: su lector añade el intermediario de Sectigo
  (`certificado-bcv.ts`, vence en 2036). Nunca se apaga la verificación.

---

## 6. Estado por fase (resumen)

| Fase | Estado | Qué falta para cerrarla |
|---|---|---|
| F0 · Decisiones | 29 decisiones cerradas | Datos maestros, relevamiento y firma (§4) |
| F1 · Cimientos | Monorepo, tipos, fronteras, tokens, contratos, escáner y PWA hechos | Docker, Prisma, CI, observabilidad, staging y semillas (Etapas 0 y 7) |
| F2 · Identidad | **Hecha en el servidor** (Etapa 1, más M-7), con el canal en vivo autorizado en el apretón de manos (B5-1) | — |
| F3 · Dinero | **Hecha en el servidor** (Etapa 2): tasas automáticas y en vivo, impuestos con vigencia, libro de pagos, día de negocio y feriados | **Sin F3-08** (M-3) |
| F4 · Caja | **En el servidor** (Etapa 3): turno, medios, cobro mixto, ventas, cortes X y Z, arqueo a ciegas, relevo, jornada e incobrables | Descuentos (B3-6), carga desde papel (B3-7) y ticket de corte impreso (B5-2) |
| F5 · Parque | **En el servidor** (B4-1 a B4-3): estancias, directorio, cronómetro, recarga, salida con D9 y huérfanas | Ajustes (B4-4), el teléfono y las pulseras (B4-5) y eventos (Etapa 10) |
| F6 · Restaurante | Interfaz completa (DEC-22); **en el piloto, sin pantalla de cocina** (M-15) | Etapa 6 (B6-1 a B6-3) |
| F7 · Fiscal | **Fuera** (M-3) | — |
| F8 · Inventario | **Catálogo de productos en el servidor** (B9-1) | Existencias, entradas con costo, salidas y alertas (B9-2 a B9-5); recetas después del piloto (B6-4) |
| F9 · Panel | Inicio con el día del libro (B3-5) y en vivo, con quién está en cada puesto (B5-1) | Los informes, después del piloto |
| F10 y F11 | Sin empezar | Etapas 7 y 8: VPS con internet de respaldo en el local (ADR-021) |

---

## 7. Registro

Una línea por sesión que cambie el rumbo. El historial anterior está en la bitácora retirada:
`git show e250c54:docs/BITACORA.md`.

- **2026-09-26** · Se consolida la documentación en este archivo y se retira la orquesta con Gemini
  (M-2). El frontend queda congelado (M-1), lo fiscal queda fuera (M-3) y se fija la ruta local → VPS
  (M-4). Empieza la Etapa 0.
- **2026-09-26** · Etapa 0 hecha en local (B0-1 a B0-5): Docker, Prisma con RLS forzada, logs con
  redacción, lint y CI, y el tarifario como primera escritura real. B0-4 queda a falta de ver el CI
  en GitHub.
- **2026-09-26** · Pedido del cliente: fuera el modo demo y el simulador (M-6) y todo el backend según
  la ruta. Se retiran; queda el bus de operación. ADR-018: sesión propia en vez de Better Auth.
- **2026-09-27** · Etapa 1: auditoría (B1-1), equipos y sesiones (B1-3, B1-4), elevación con TOTP
  (B1-2) y personas/permisos/accesos/autorización (B1-5, falta el navegador).
- **2026-09-26** · B1-5 comprobado en el navegador: Etapa 1 cerrada. B2-1: tasas en la base con
  fecha valor; la caja cobra solo con la del día confirmada.
- **2026-09-26** · M-7: el alta de equipos sigue buenas prácticas (aprobar desde el propio equipo con
  credenciales de administración, código de emparejamiento, caducidad y topes). Se corrige la IP de
  la auditoría, que se podía falsear.
- **2026-09-26** · Una sola barra de desplazamiento en todo el proyecto; fuera los datos inventados de
  sala, familias, turno e Inicio; la tasa se trae del BCV (B2-1b) y la del viernes cubre el fin de
  semana. Evolución del plan a pedido del cliente: tasa automática y en vivo (M-8, ADR-019), el
  inventario vuelve (M-9, Etapa 9), versionado semántico visible (M-10, desde 0.13.0), cero código
  simulado (M-11, T-2), definición de hecho de un paso y orden de ejecución.
- **2026-09-27** · Base local vaciada y sembrada de cero (las tasas de prueba tapaban la del BCV).
  T-1: la versión se ve en el acceso y en Configuración (v0.14.0), con CHANGELOG y etiquetas.
  B2-1c con el código hecho (la tasa del BCV se aplica sola con salvaguardas, sondeo de 60 s, la caja
  congela la tasa del cobro); falta verlo en el navegador.
- **2026-09-27** · B2-1c comprobado en el navegador y entregado (v0.15.0): el aviso de tasa cambiada
  pasa a la franja fija de la caja con «Mantener» y «Usar la nueva». Sigue B2-2.
- **2026-09-27** · B2-2 entregado (v0.16.0): los impuestos se programan con fecha en Configuración →
  Impuestos y la caja cobra con los del instante. Sigue B2-3.
- **2026-09-27** · B2-3 entregado (v0.17.0): el libro de pagos en el servidor, idempotente y con la
  reversión como asiento; la caja lo usará en B3-3 (alcance acordado con el cliente). Sigue B2-4.
- **2026-09-27** · Decisiones del cliente: B3-1 antes que B2-4 (el turno fija el día de negocio), los
  feriados se cargan desde el panel (D-FER) y el acceso se rediseña (T-3). B3-1 entregado (v0.18.0):
  sin turno abierto no se cobra, y el punto de cobro es el equipo.
- **2026-09-27** · B2-4 entregado (v0.19.0): se cierra la Etapa 2. Feriados bancarios desde el panel y
  el día de negocio del turno en cada asiento; la tasa sigue el calendario (ADR-009 aclarado). Sigue T-3.
- **2026-09-27** · T-3 entregado (v0.20.0): el acceso da protagonismo a «L2 Control» y el admin
  registra y aprueba un equipo nuevo desde la primera pantalla. La ruta pasa a 46 pasos. Sigue B3-2.
- **2026-09-27** · Pedido del cliente: producción arranca vacía y sin apps de terceros (M-12). Se
  decide ADR-020 (llaves de acceso en vez de TOTP, códigos de recuperación, instalación inicial y
  credenciales desde el panel) y se añade T-4 antes de staging. La ruta pasa a 47 pasos.
- **2026-09-27** · B3-2 entregado (v0.21.0): los medios de pago son un catálogo de la base (se añade
  uno sin desplegar), los datos del local y los de cada pago van cifrados, y el libro rechaza una
  referencia ya cobrada. Sigue B9-1.
- **2026-09-27** · Tres rondas de preguntas con el cliente sobre la jornada: el día completo en cuatro
  momentos queda en JORNADA.md (M-13). Menú por operación con «Ajustes» abajo, una sola sección
  Turno, relevo con corte, arqueo a ciegas con firma por umbral y ninguna jornada cerrada con
  pendientes. Nuevo paso T-6, que va antes de B9-1; la ruta pasa a 48 pasos.
- **2026-09-27** · Sin día simulado (decisión del cliente): lo abierto de la jornada se pregunta cuando
  llega su paso. T-6 entregado (v0.22.0): menú por operación con Ajustes al pie y la caja en Cobrar |
  Turno, con las ventas dentro de Turno. Sigue B9-1.
- **2026-09-27** · Handoff (v0.22.0): subidos a GitHub `main` y las etiquetas v0.1.0…v0.22.0.
- **2026-09-27** · B3-3 empezado en la rama `feat/b3-3` con el alcance «todas las cuentas» (decisión
  del cliente): dominio de la cuenta, margen de la tasa, contrato y base hechos; faltan la
  aplicación, la web y el navegador (lista en la casilla de B3-3).
- **2026-09-27** · B9-1 entregado (v0.23.0): el catálogo de productos es de la base, con el precio
  programado por día (nace `@l2/domain-inventory`); la caja vende de él, cada línea copia su precio y
  su IVA, y cambiar un precio no altera lo vendido. Sigue B3-3.
- **2026-09-28** · B3-3 hecho (v0.24.0): todas las cuentas en la base, cobro y anulación contra el
  libro en una transacción. Se corrige que Next escribiera en su registro los argumentos de las
  acciones (PIN y referencias).
- **2026-09-28** · B3-4 hecho (v0.25.0): la venta de cada cobro, su impresión, su anulación y la
  cortesía en el servidor; fuera `src/demo/usuarios.ts` y los PIN «1970». D-AUT y D13 aplicados con su
  propuesta, a confirmar con el cliente. Sigue B3-5.
- **2026-09-28** · D-JOR decidido con el cliente. B3-5 empezado en `feat/b3-5`: dominio, contrato,
  base y el caso de uso del corte escritos; faltan sus pruebas, la web y el navegador. Handoff.
- **2026-09-28** · El cliente pide el parque funcional con urgencia (M-14): B3-5 en pausa y el parque
  delante de B5-1. B4-1 y B4-2 hechos (v0.27.0): estancias, familias y cronómetro en el servidor; la
  entrada, la sala, la salida y la caja trabajan sobre la misma base desde equipos distintos. B4-3 a
  medias (recarga y huérfanas). Lo hecho de B3-5 entra en `main` con él.
- **2026-09-28** · Tasa con dos decimales en todas las pantallas (v0.27.1, pedido del cliente). D9 y el
  umbral de las huérfanas decididos con el cliente. B4-3 hecho (v0.28.0): recarga, a quién se entrega
  el niño, huérfanas cerradas por la dirección y el nombre opcional en la entrada. Sigue B3-5.
- **2026-09-28** · Base local limpia para probar de cero (las cuentas de prueba, incobrables). El menú
  del panel ya deja plegar Ajustes estando dentro (v0.28.1). Handoff.
- **2026-09-28** · B3-5 hecho (v0.29.0): cortes X y Z, arqueo a ciegas, relevo, cierre de la jornada sin
  pendientes, incobrables y el día en Inicio; se cierra la Etapa 3. Las pruebas cazaron cinco fallos del caso de
  uso. Al comprobarlo en el navegador se selló por error el turno de «PC admin» del cliente (§1).
- **2026-09-28** · Visita técnica (M-15): teléfono para la monitora con pulseras preimpresas de un solo
  uso, laptop en caja, tablet del mesero, cocina con comanda impresa, una impresora en caja, restaurante
  en el piloto, inventario mínimo y real, descuentos configurables, cumpleaños con anticipo, todo en
  tiempo real y un solo VPS con internet de respaldo. ADR-021 a ADR-023; la ruta pasa a 56 pasos.
- **2026-09-28** · Respondidas todas las preguntas abiertas (D-DESC, D-EVT, D-PUL, D-GAV, D13, D-AUT, D7,
  D-CORD e IGTF): sin gaveta (B5-3 fuera, 55 pasos), sin IGTF por ahora y la tasa de la API siempre. Handoff.
- **2026-09-29** · B5-1 hecho (v0.30.0): todo en tiempo real por un outbox que escribe la auditoría y un
  worker con Socket.io y Valkey (ADR-025); fuera los sondeos y el bus entre pestañas; la tasa del BCV sin
  umbral de salto (ADR-024). Sigue B4-4.
- **2026-09-29** · Con el cliente: IGTF al 0 % en su base (V-13) y fuera el IVA reducido de las pantallas y
  del catálogo (v0.30.1), porque el local no lo usa. Handoff.

---

## 8. Handoff

**Cuando el usuario escribe «handoff»:**

1. Se actualizan §1 (dónde estamos), las casillas de §3 y una línea en §7.
2. Si hubo código, se pasa `pnpm verify`. Después se hace commit; el push solo si se pide.
3. Se reescribe el bloque de abajo y se entrega en el chat, listo para copiar y pegar en una sesión
   nueva. Tiene como mucho 15 líneas y responde a: dónde quedó, el paso siguiente con su criterio, qué
   quedó a medias y con qué hay que tener cuidado.

**Último handoff (2026-09-29, v0.30.1 en `main`, sin subir a GitHub):**

```text
Proyecto L2 Control. Lee docs/MAESTRO.md (§1, §2 M-15 con V-1 a V-14, §3 con su DoD y orden, §4, §5), docs/JORNADA.md y CLAUDE.md. Español.
Rol: full-stack senior; programas tú todo. main: v0.30.1 · 30 de 55 pasos, en verde. Nada subido a GitHub (main ~27 commits por delante).
HECHO: B5-1 = todo en tiempo real: outbox_event lo llena un disparador de audit_log en la misma transacción; apps/worker (Socket.io + Valkey,
  ticket HMAC en el apretón de manos, latido de sesiones, bus del restaurante, consulta del BCV) publica TEMAS; la web relee con useAlCambiar
  o router.refresh() (ADR-025). V-14: la tasa del BCV sin umbral (ADR-024). Con el cliente: IGTF al 0 % en su base; fuera el IVA reducido (v0.30.1).
SIGUIENTE: B4-4 (ajustes de la sucursal en la base y su pantalla en Ajustes: nombre, RIF, dirección, horario, formato de hora, residuo, servicio,
  umbral del arqueo $ 1,00, umbral de huérfanas 8 h y zona horaria, hoy en el código); se borra src/demo/sucursal.ts. Luego B4-5 (teléfono y pulseras).
Pendiente con el cliente: contarle que el turno de «PC admin» se selló por error con un Z de prueba (§1).
Base local CON DATOS DEL CLIENTE («PC admin» y su turno del 28/09 abierto): un guion solo toca lo que se llama «Prueba …» y revoca sus equipos.
Arrancar: Docker Desktop → pnpm infra:up → pnpm db:migrar → pnpm dev (web :3000 + worker :3001; si uno cae, turbo tumba los dos).
Entrar: /acceso → equipo → «Soy de administración» → abby-kingdom-desarrollo + `pnpm totp` (o `pnpm equipos aprobar`) → PIN 1970.
Cuidado: DoD de §3; en una transacción nunca dos consultas a la vez (§5); toda acción auditada nueva exige su fila en TEMAS_DE_ACCION;
  migración aplicada no se edita; heredocs grandes fallan (Write + python / commit -F). Playwright: comun.cjs y vivo1..5.cjs en el
  scratchpad de la sesión b6cf4f88. Merge a main solo con verify:db verde. Push solo si se pide.
```
