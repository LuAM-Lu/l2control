# L2 Control — documento maestro

> **El único documento vivo del proyecto.** Actualizado: **2026-10-08**.
>
> Aquí están el estado, la ruta hasta producción, lo que bloquea y el handoff. Nada de esto se escribe
> en otro sitio. Hay cuatro referencias que **no se editan** y se citan por sección:
>
> - [PLAN.md](PLAN.md): la especificación. ADRs, decisiones del cliente (DEC-n) y tareas `Fn-nn` con su
>   criterio de aceptación en §12. Sus casillas y sus enlaces a documentos retirados están congelados.
> - [FLUJOS.md](FLUJOS.md): cómo se mueven personas, pedidos y dinero en el local. El código lo cita.
> - [JORNADA.md](JORNADA.md): el día completo en cuatro momentos (primer encendido, apertura, jornada y
>   cierre), con lo decidido el 2026-09-27 (M-13). Se corrige cuando un paso resuelve algo suyo.
> - [adr/](adr/): las decisiones de arquitectura, una por archivo (29; ADR-018 supersede la biblioteca
>   de ADR-013, ADR-019 cambia la confirmación de la tasa automática de §5.2, ADR-020 cambia el TOTP
>   de ADR-018 por llaves de acceso, ADR-021 supersede la topología de ADR-003, ADR-022 retira la
>   pantalla de cocina de DEC-19, ADR-023 supersede ADR-012, ADR-024 retira el límite de cordura de
>   ADR-019, ADR-025 concreta el tiempo real de ADR-008 y ADR-026 lleva la impresión al local con un agente,
>   en lugar de la conexión directa del servidor de ADR-015, y ADR-027 limita ADR-017 y ADR-010 con una excepción única:
>   la hora real de lo anotado en papel, dentro de la ventana del corte; ADR-028 decide cómo se actualiza el sistema
>   y ADR-029 añade el equipo de confianza y la app de autenticación a ADR-020).
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

**Versión 0.86.1 · 86 de 92 pasos · M-27, M-28, M-29 y M-31 entregados enteros; B8-2 a medias: lo escrito, hecho, y la
capacitación, en B8-3. M-32 entregado: B3-10, la caja más clara.** M-28 y M-29
(decididos el 2026-10-08; once pasos, v0.74.0 a v0.84.0, en el orden de §3, punto 8): el catálogo sin existencias y su conteo inicial
(B9-7), la semilla con casillas para la corrida limpia (B7-7), los respaldos con carpeta, fijados e integridad (B7-6),
la sección Reportes con las ventas, el inventario al momento y los movimientos, cada uno con su PDF (B11-1 a B11-3,
la Etapa 11 entera), Ajustes en 12 secciones con pestañas (T-18), la cuenta de soporte (T-17), el conteo a ciegas con
su informe de diferencias (B9-10), editar en lote (B9-9) y duplicar productos con sus sabores (B9-8).
**M-31 entregado:** B3-9, el punto de cobro y la entrada desde la caja. **T-8c hecho:** el agente de impresión se
actualiza solo (ensayado en una PC con Windows). **B8-2, lo escrito, hecho:** la hoja del procedimiento en papel y los
runbooks del técnico (la capacitación cierra B8-2 en B8-3). **M-32 entregado:** B3-10, el buscador de la carta de la
caja, lo que no se vende al final y el pie de la cuenta compacto con «Cobrar $ …». **Desde aquí ya no se programa nada
para la 1.0.0. En el local:** B7-3 (con T-8c en
la laptop real), B8-1, B8-3 (con la capacitación) y B8-4, que es la 1.0.0. **Para decidir:** D-REL (qué entra en la
1.0.0, §4), antes de B8-4.

- **Hecho:** la Ruta A entera corre contra el servidor: identidad y auditoría, dinero (tasas del BCV en vivo,
  impuestos con vigencia, libro de pagos), caja (turno, cobro mixto, cortes, descuentos, papel), parque (entrada,
  sala y salida en el teléfono, pulseras de un solo uso), inventario (existencias, entradas en lote, salidas, conteo,
  mínimos), restaurante (plano, carta, pedido del mesero con comanda impresa), cumpleaños con anticipo, tiempo real
  e impresión por un agente en la laptop de caja. Con M-27 (v0.61.0 a v0.73.0): varias cuentas por mesa y de pie,
  pausa por comida, entrar sin pulsera, medias, cortesía y anular desde la sala, ayuda con recorridos guiados, roles que
  se pueden dar, cobrar con el teclado y el recibo a elección, «Mi cuenta» y el acceso con teclado, la operación de un
  vistazo, la escala de texto e iconos, reportar un problema con captura y la atención en el salón. Con M-28 y M-29
  (v0.74.0 a v0.84.0): Reportes en PDF (ventas, inventario al momento y kárdex), Ajustes en 12 secciones con pestañas,
  la cuenta de soporte, el catálogo en hoja sin cantidades con su conteo inicial, el conteo a ciegas con su informe,
  editar en lote, duplicar con sabores, la semilla con casillas y los respaldos con carpeta, fijados e integridad. Con
  M-31 (B3-9): el punto de cobro (fuera de él, el turno se abre con el PIN de administración y queda avisado) y la
  entrada al parque desde la caja. Con M-32 (B3-10): un buscador en la carta de la caja, lo que no se vende al final y
  el pie de la cuenta en una fila, con «Cobrar $ …». El detalle de cada paso está en su casilla de §3 y en `CHANGELOG.md`.
- **Staging:** `https://217-216-48-54.sslip.io` (Etapa 7). Se pone al día solo con cada versión publicada (T-8b),
  hace un respaldo cifrado cada noche que baja una PC del local (B7-4) y pasó la revisión de seguridad (B7-5).
  **Pendiente de administración allí:** preparar la PC de los respaldos (Ajustes → Sistema → Respaldos), cargar la
  semilla (Ajustes → Sistema → Semilla del local) y los feriados (Ajustes → Tasas de cambio → Feriados); y del usuario, poner `L2_SMTP_URL` y `L2_CORREO_SOPORTE` para que los
  reportes de problemas avisen por correo (T-11).
- **M-27 (2026-10-07) entregado entero:** los 19 pedidos de la primera visita (P-1 a P-19, §2), en 13 pasos. Quedan
  por confirmar con el cliente las propuestas de fábrica de P-1, P-3, P-5, P-6 y P-14.
- **M-28 y M-29 (2026-10-08) entregados enteros:** los once pasos, de v0.74.0 a v0.84.0, sin pedir el sí entre uno y
  otro (lo pidió el usuario). Para usarlos en el staging: la cuenta de soporte se marca en Ajustes → Personas y equipos
  (y allí sí abre turnos y cobra); la corrida limpia de producción es base nueva más la semilla con casillas (B7-7).
- **Después, para producción:** B7-3 en el local, con los equipos reales (y T-8c comprobado en la laptop de caja); y la Etapa 8 (red del local con 4G,
  runbooks del técnico, el procedimiento en papel y la capacitación (M-30: el manual es el de la app), operación en
  paralelo y puesta en marcha, que es la 1.0.0).

La historia de esta sección (qué decía al entregar cada paso y lo que se probó en la base local) está en §9.

- **Infraestructura local:** `pnpm infra:up` (PostgreSQL 17 en el 5433, Valkey 8), `pnpm db:migrar`,
  `pnpm db:semilla` (local, equipo con PIN 1970, credenciales de Abigail, tarifario).
- **Servidor:** `@l2/database` (RLS forzada, solo-agregar, auditoría y outbox), `@l2/application` (los casos de uso
  de cada dominio, en la transacción del tenant), `@l2/observability` (logs redactados, entorno validado),
  `apps/worker` (canal en vivo, outbox, tasa del BCV y el aviso por correo de los reportes de problemas) y
  `apps/printer-agent` (la impresora del local). La web lee la
  sesión de cookies `httpOnly` y recibe el actor COMPLETO del servidor, recalculado en cada petición.
- **Entrar en local:** navegador nuevo → «Pedir registro» en `/acceso` → `pnpm equipos aprobar "<nombre>"` → persona →
  PIN 1970. Para confirmar identidad, la administración usa su contraseña y la app de autenticación, la llave o un
  código de recuperación (ADR-029); el enlace de alta lo imprime `pnpm db:semilla` (o `pnpm credenciales "Abigail
  Karam"`). Siempre por `http://localhost:3000`: la llave va atada a la dirección. Tope: 10 solicitudes por hora
  desde la misma dirección.
- **Pruebas:** `pnpm verify:db` en verde en `main` (la cuenta de cada paquete la da el propio comando). El CI la corre
  en cada PR y `main` está protegido (M-20).

---

## 2. Decisiones de esta etapa (2026-09-26)

| # | Decisión | Consecuencia |
|---|---|---|
| **M-1** | **Se congela el frontend.** No se construyen más pantallas sobre datos de ejemplo | Las tres que faltaban (apertura de turno, impuestos, impresoras) se hacen **directamente contra el servidor**, en su etapa. Así cada pantalla se construye una sola vez. El inventario (tanda D) pasa a después del piloto, porque está fuera de la Ruta A. Los hallazgos de la antigua Ola 5 se corrigen al pasar por cada pantalla (§5), y la medición final se hace en staging (B7-3) |
| **M-2** | **Claude programa todo.** Se retira la orquesta con Gemini | Se borran `scripts/obrera.mjs`, ORQUESTA y los encargos. Los comentarios del código que dicen «escrito por la obrera» se quedan: son historia |
| **M-3** | **Nada fiscal por ahora** | F7 queda fuera, igual que el hito M1 (F3-08, las 20 facturas), la máquina fiscal y la nota de crédito. El recibo es **no fiscal**. IVA e IGTF **se siguen calculando** en el ticket, porque ya están hechos y cambian lo que se cobra |
| **M-4** | **Entornos: primero local (Docker), luego VPS** | ⚠ **Choca con ADR-003**, que pide un servidor en el local y usa la nube solo como réplica. Con solo un VPS, un corte de internet detiene los cobros y la cocina. **Propuesta:** el VPS sirve de staging y para el piloto en paralelo, donde el método anterior hace de respaldo (F11-04). La topología final (D-INF, §4) se decide antes de retirar ese método. El servidor se empaqueta en Docker para que la misma imagen corra en el VPS o en un mini-PC sin cambios. **Resuelto por M-15 ([ADR-021](adr/021-servidor-en-la-nube.md)):** un solo VPS, con internet de respaldo en el local |
| **M-5** | **Un solo documento vivo y handoff a petición** | Este archivo. El protocolo está en §8 |
| **M-6** | **Fuera el modo demo y el simulador** (2026-09-26), y **todo el backend según esta ruta** | Se retiran el chip «DEMO», su panel, los escenarios, el reloj acelerado, `NEXT_PUBLIC_DEMO` y `L2_FUENTE_DE_DATOS`: la app corre siempre contra su servidor. Queda el bus de eventos (`features/operacion`), que no era simulado y en B5-1 viaja por el servidor. Lo que aún no tiene backend usa datos provisionales de `src/demo`; **cada paso borra el suyo** (tabla en su README). Cambio de alcance sobre F1-19 (DEC-22), pedido por el cliente |
| **M-7** | **Alta de equipos con buenas prácticas** (2026-09-26, pedido del cliente) | Amplía F2-02. El primer equipo de un local, o el que sustituye a uno perdido, se aprueba **desde él mismo con la contraseña y el TOTP** de quien gestiona personas (nunca con un PIN, y sin enseñar nombres en un equipo no aprobado); la consola `pnpm equipos` queda como puerta de emergencia. Cada equipo enseña un **código de emparejamiento** que quien aprueba compara. Una solicitud **caduca a las 24 h** y se renueva desde el equipo. Tope de 10 solicitudes por hora y dirección y de 20 pendientes por sucursal. Regla de operación (runbook, B8-2): **siempre dos equipos de administración aprobados** |
| **M-8** | **La tasa del BCV se aplica sola y llega en vivo a todas las pantallas** (2026-09-26, pedido del cliente, [ADR-019](adr/019-tasa-automatica.md)) | Cambia §5.2 y F3-04 (confirmación humana de toda tasa automática). Salvaguardas: solo se aplica sola la de la web oficial del BCV con TLS verificado; si salta más del 10 % respecto de la vigente, si es la primera o si solo respondió un tercero, **no** se aplica y sale alerta crítica; si dos fuentes discrepan para el mismo día, no se captura. Todo queda auditado como «Aplicada automáticamente». La carga manual de administración también se aplica al guardarla (supervisión sigue con 🔐). En vivo: sondeo de 60 s hasta B5-1, push después. Un cobro en curso conserva su tasa y avisa si cambió (ADR-005) |
| **M-9** | **El inventario vuelve al plan** (2026-09-26, pedido del cliente; revierte esa parte de M-1) | Nueva **Etapa 9** (catálogo de productos, movimientos de solo-agregar, compras con costo promedio, ajustes con motivo y 🔐, alertas y conteo físico). Su primer paso, el catálogo, va antes del cobro en servidor (B3-3), que lo necesita. Recetas, descarga al marcar LISTO y merma (F8-03, F8-04, F8-09) van con el restaurante (B6-4), porque dependen de las comandas |
| **M-10** | **Versionado semántico visible** (2026-09-26, pedido del cliente) | SemVer 2.0.0. **MAJOR** 0 hasta producción; **1.0.0 = puesta en marcha** (B8-4). **MINOR** +1 por cada paso de la ruta entregado: la versión dice cuántos van. **PATCH** +1 por cada corrección entre pasos. Staging publica `-rc.N`. Fuente única: `version` del `package.json` raíz; `CHANGELOG.md` por versión (Keep a Changelog, en español) y etiqueta git `vX.Y.Z` en cada entrega. Se ve en el acceso y en Configuración con su etapa: «v0.14.0 · Etapa 2 · Dinero». La etapa es la del trabajo en curso (la del siguiente paso de la ruta), no la del último paso entregado (aclarado el 2026-10-05: tras B2-5 decía «Etapa 2 · Dinero»). Punto de partida: **0.13.0** |
| **M-11** | **Cero código demo o simulado en producción** (2026-09-26, pedido del cliente) | Todo lo provisional o simulado está inventariado en §5 con el paso que lo borra, y un paso no está hecho si deja simulado algo suyo. Antes del staging, **T-2** lo impone en CI: `src/demo` borrada, sin datos de negocio en `sessionStorage`/`localStorage`, sin PINs literales ni listas inventadas |
| **M-12** | **Puesta en marcha sin consola y sin apps de terceros** (2026-09-27, pedido del cliente; [ADR-020](adr/020-llaves-de-acceso.md)) | Producción arranca vacía: el primer administrador y su equipo se crean desde el navegador con un código de instalación de un solo uso. El segundo factor pasa de TOTP a **llaves de acceso** (Windows Hello, el bloqueo del teléfono), dos por administrador, más diez códigos de recuperación impresos. Las credenciales de administración se dan desde el panel con un enlace de alta (QR). Paso **T-4**, antes de staging |
| **M-13** | **La app se ordena por la jornada** (2026-09-27, pedido del cliente; [JORNADA.md](JORNADA.md)) | El objetivo es operar el parque y el restaurante con un camino feliz. El menú pone arriba lo que se opera (Inicio, Parque, Restaurante, Caja) y abajo, en «Ajustes», lo que se configura (impuestos, feriados, medios, tasas, tarifas, carta, plano, personas, equipos). Turnos y Ventas del turno son **una sección, Turno**. Primer uso con asistente corto y «Puesta a punto» en Inicio; la cajera abre el turno y el sistema comprueba; relevo con corte, arqueo a ciegas, Z por umbral ($ 1,00, firma de supervisión por encima) y **ninguna jornada se cierra con pendientes**; ticket de corte impreso y resumen del día en Inicio. Nuevo paso **T-6**; la ruta pasa a 48 pasos |
| **M-14** | **El parque primero** (2026-09-28, pedido del cliente: «hacer funcional parque, urgente») | B3-5 queda en pausa a medias (dominio, contrato, base y caso de uso, sin pruebas ni pantalla) y el parque (B4-1 a B4-3) pasa delante, **sin esperar a B5-1**: la sala llega a los demás equipos por sondeo de 5 s, como las cuentas desde B3-3, y B5-1 la empujará en vivo. Las estancias, las familias y el precio del parque salen del navegador |
| **M-15** | **Lo decidido en la visita técnica** (2026-09-28, con el cliente) | Dispositivos, pulseras, cocina, impresión, inventario, descuentos, eventos, tiempo real y servidor: detalle abajo (V-1 a V-12). Cierra D-INF, D-RES, D-INV y F-12; cambia DEC-8 (en parte), DEC-18 y DEC-19; ADR-021, ADR-022 y ADR-023. La ruta pasa a **55 pasos**: entran B4-5, B3-6, B3-7, la Etapa 6 (B6-1 a B6-3, sin recetas) y la Etapa 10 (B10-1 y B10-2), y sale B5-3 (no hay gaveta electrónica, D-GAV) |
| **M-16** | **El inventario se ve por su stock** (2026-09-30, pedido del cliente; amplía V-7) | Productos se rediseña con el stock como protagonista: vista de resumen + tabla o de tarjetas (sin foto). Cada producto: **SKU automático** (prefijo de su categoría y correlativo, no se edita), **código de barras** opcional y único, **presentación** y **tipo** (PRODUCTO, PREPARADO o SERVICIO; sustituye la casilla «Lleva existencia»). **Stock mínimo** por producto con estado y avisos (B9-5 entra ya). La **entrada de mercancía crea productos** con una ficha corta (nombre, categoría, código, presentación y precio). El código se **escanea** en la caja (vende), las entradas, el conteo y Productos. Nuevo paso **B9-6**; la ruta pasa a 56 |
| **M-17** | **Ajustes con un mismo patrón** (2026-10-01, pedido del cliente tras ver Impresoras en v0.39.2) | Las pantallas de Ajustes siguen el patrón de Impresoras: cabecera compacta con la acción principal; **resumen** de 2 a 4 cifras que llevan a su sitio (color + icono + texto); **pestañas** que separan lo que se configura de lo que se consulta; alta y edición en **hoja lateral** y confirmación en diálogo para lo irreversible; las listas que crecen, **por páginas en el servidor** (10/20/50) con filtros y su cuenta, «Limpiar filtros», tabla en el escritorio y tarjetas en tableta y teléfono. Sin desplazar la página a 1366×768, 1280×800 ni 800×1280. Carta y precios y Plano del local lo estrenan en **B6-1** (se rehacen contra el servidor ahí); Roles y accesos, Usuarios, Dispositivos, Descuentos, Tasas de cambio y Tarifas y paquetes, en el paso nuevo **T-7**, justo después. La ruta pasa a 57 |
| **M-18** | **Cambios en la mesa y salida antes de tiempo** (2026-10-03, preguntas del cliente) | (1) Una mesa sin nada que cobrar (no pidieron, o todo se anuló o se regaló) la **libera el mesero sin PIN**, con registro de quién y cuándo; la cuenta en $ 0 se cierra «sin consumo», no como incobrable → **B6-5**. (2) Anular un plato ya enviado saca un **papel «ANULAR»** en la impresora de comandas, y el inventario va **según el motivo**: lo que la cocina no preparó vuelve al estante; lo preparado sale como merma con su costo → **B6-6**. (3) **Prepago:** el paquete se cobra entero y no se devuelve (la entrada lo avisa); **cuenta abierta:** al salir se cobra el paquete más barato que cubre el tiempo real → **B4-6**. No entran por ahora: anular plato por plato en la pantalla (el servidor ya lo admite), un botón «Cambiar» y la ronda adicional en la comanda. La ruta pasa a 60 |
| **M-19** | **Datos reales y precios con el IVA incluido** (2026-10-05, pedido del cliente antes de T-2) | Se vacía el movimiento y el catálogo de la base local y se cargan el menú infantil, las tarifas del parque y los paquetes de cumpleaños reales (con dos precios: lunes a viernes, y fin de semana o feriado, como dos paquetes). El precio del menú es lo que paga el cliente: **el total es siempre la suma de los precios, al céntimo**, y el IVA se saca de dentro → paso nuevo **B2-5**. Lo que no tiene precio no se vende (Sandwiches, Proteínas, bebidas y golosinas hasta el inventario). El consumo del cumpleaños sobre la marcha (lo que gasta, anotado a su cuenta hasta que se paga) queda pendiente de cuando haya inventario de esos artículos. La ruta pasa a 61 |
| **M-20** | **Actualizaciones y trabajo entre dos** (2026-10-05, decisión del usuario antes del VPS, con una persona más en el equipo que hace lo mismo que él) | **Actualizaciones ([ADR-028](adr/028-actualizaciones.md)):** en producción decide administración desde Ajustes → Sistema (ahora, al cierre o más tarde; «ahora» sin turnos abiertos ni niños en sala), cada actualización hace respaldo, migra, comprueba y vuelve sola atrás si falla; el personal no decide nada: su pantalla se recarga sola al estar libre y no cobra si el servidor ya no acepta su versión; el agente de impresión se actualiza solo con la cola vacía → paso nuevo **T-8**, antes de B7-1. **Trabajo entre dos:** todo entra a `main` por PR con el CI en verde (`main` protegido en GitHub); la versión y su etiqueta se ponen al fusionar, y cada rama escribe lo suyo en «Sin publicar» del CHANGELOG; cada casilla en curso de §3 dice quién la lleva; nadie recibe la base ni las claves del cliente (se trabaja con `pnpm db:semilla` y un `.env` propio). La ruta pasa a 62 |
| **M-21** | **Tema claro, predeterminado, por equipo** (2026-10-06, pedido del usuario; no estaba en el plan) | Inspirado en «Light Blue» de L2Lab: fondo `#f0f8ff`, tarjetas blancas, marca azul `#2563eb`, texto azul marino. Es un bloque de tokens bajo `html[data-tema="claro"]`; el oscuro son los tokens de siempre. La preferencia va **por equipo** (cookie `httpOnly` `l2_tema`, sin base ni auditoría: no es un dato del negocio) porque los equipos del local son compartidos; sin preferencia sale el claro. En el claro, los avisos rojos y amarillos son **sólidos** (rojo con letra blanca; amarillo `#eab308` con letra azul marino, porque el blanco sobre él da 1,9:1), sin contorno, y los tintes de zona (opacidad /25 y /35) quedan en pastel. No cuenta como paso de la ruta: es v0.52.2 |
| **M-22** | **T-8 en dos partes y el staging sin dominio comprado** (2026-10-06, decisión del usuario; el VPS ya está contratado) | **T-8 se parte:** **T-8a** (contenedores de la web y del worker, publicación por etiqueta y despliegue que hace respaldo, migra, comprueba la salud y vuelve solo atrás) va **antes de B7-1**, que lo usa; **T-8b** (Ajustes → Sistema con la decisión de administración, la recarga de las pantallas viejas y la autoactualización del agente) va en paralelo con B7-1 a B7-5 y **antes de B8-3**: sin nadie cobrando en staging, eso no hace falta para tener el sistema en internet. Lo que decide ADR-028 no cambia, solo el orden. **Sin dominio comprado:** las llaves de acceso (ADR-020) no funcionan con una IP (el navegador exige un nombre) y la cámara del teléfono exige HTTPS, así que staging se abre por un nombre gratuito que apunta a la IP del VPS (`<ip-con-guiones>.sslip.io`) con el certificado de Let's Encrypt. Depende de un servicio de terceros: **antes de B8-3 se decide un dominio propio** (§4); cambiar de nombre es cambiar `L2_URL_PUBLICA`, pero las llaves quedan atadas al nombre y cada persona vuelve a crear la suya. La ruta pasa a 63 |
| **M-23** | **Confirmar identidad desde cualquier equipo** (2026-10-07, decisión del usuario al instalar el staging: «lo más fácil, ágil y eficaz para la administración de Abby») | Ni la laptop (Windows sin PIN de Hello) ni una tableta Android pudieron crear la llave de acceso que ADR-020 exigía para instalar y confirmar identidad. [ADR-029](adr/029-equipo-de-confianza-y-app-de-autenticacion.md): **equipo de confianza** (en el equipo propio de cada persona de administración, confirmar es solo la contraseña), **app de autenticación** (TOTP, el código de 6 cifras, que no se acepta dos veces) como factor universal, y la llave sigue para quien la tenga. Instalar y el enlace de alta ya no exigen llave: el equipo de la instalación queda de confianza. Paso nuevo **T-9**, antes de seguir con la Etapa 7. La ruta pasa a 64 |
| **M-24** | **La semilla del local y el inventario en lote** (2026-10-07, decisiones del usuario al revisar el staging recién instalado) | El staging nació vacío: ni el plano, ni la carta con sus precios, ni los cumpleaños, ni las tarifas y paquetes que ya estaban en la base del local, ni categorías. **B7-2 se desbloquea:** una **semilla** se descarga de un local (Ajustes → Semilla) y se carga en otro, que solo **añade lo que le falta** y nunca pisa lo que ya tiene; lleva los ajustes de la sucursal, tarifas y paquetes, la carta con sus categorías y precios, el plano y los cumpleaños, y nada más (ni personas, ni medios de pago, ni impuestos, ni existencias: el inventario se carga a mano en el local). La misma semilla sirve después para producción. **Inventario, tras una auditoría** (paso nuevo **T-10**): la línea de una entrada es **flexible** (unidades sueltas o bultos de N; el costo por unidad, por bulto o el total de la línea de la factura) y recuerda el último costo; la entrada es una **tabla** que se llena con el teclado, admite **pegar una lista copiada de Excel o Google Sheets** y tiene un modo **«inventario inicial»** para la existencia de arranque; las **categorías son una lista propia** (crear, renombrar, unir) que nace con unas de arranque y viaja en la semilla. Y el **icono de la app instalada** es el logo de L2 en Android, sin el cuadrado oscuro. Todo en una sola entrega. La ruta pasa a 65 |
| **M-25** | **T-8b en dos: el panel ahora, el agente después** (2026-10-07, decisión del usuario: empezar T-8b «para ver cómo se comporta en producción») | El agente de impresión se actualiza en la laptop de caja real, con permiso de administrador de Windows, y eso se prueba en el local. Se parte: **T-8b** (Ajustes → Sistema, el actualizador del VPS, staging al día con cada versión publicada, la vuelta atrás avisada en el panel y las pantallas que se ponen al día solas) va ya y se ve en el staging; **T-8c** (el agente se actualiza solo, con su huella y su vuelta atrás) va con B7-3, en el local. Los dos, antes de B8-3. La web solo **pide** la actualización (una fila en la base, auditada); la ejecuta un actualizador del VPS que comprueba que no haya turnos abiertos ni niños en sala: la web no toca Docker. La ruta pasa a 66 |
| **M-26** | **Los respaldos los baja una PC del local** (2026-10-07, decisión del usuario para B7-4, frente a Backblaze B2 o Google Drive) | Sin terceros ni cuentas nuevas: el VPS hace cada noche un volcado **cifrado con una clave pública** (la privada no está en el servidor) y una tarea programada de Windows en una PC del local lo descarga por HTTPS con su usuario y contraseña, comprueba su huella y guarda la escalera (diarios, semanales, mensuales). El servidor anota cuándo lo bajó la PC, y el panel avisa si el respaldo no se hizo o si la PC no lo bajó: una copia que dejó de salir no puede pasar en silencio. El riesgo aceptado: si esa PC pasa días apagada, la única copia es la del VPS. Con un volcado diario, lo que se puede perder es hasta un día (PLAN §10.4 pide 15 minutos con WAL continuo: queda en §5) |
| **M-27** | **Lo pedido en la primera visita con el sistema** (2026-10-07, el cliente lo vio funcionar en el local) | Diecinueve pedidos (P-1 a P-19, abajo) que se vuelven **13 pasos nuevos**: B3-8, B4-7 a B4-10, B6-7, B6-8 y T-11 a T-16. Se construyen del más complejo al más simple y, si uno espera una decisión, se sigue con el siguiente que no la espera (regla del usuario). Cambia I-05: una mesa admite varias cuentas abiertas (B6-7). Dos decisiones nuevas, D-SERV y D-SOP (§4). La ruta pasa a **79** |
| **M-28** | **Soporte oculto, catálogo sin existencias y duplicar productos** (2026-10-08, pedido y decisión del usuario) | (1) La cuenta de soporte del desarrollo es una persona de Administración con la marca «soporte»: **no sale en «¿Quién entra?»**, entra con su nombre de usuario y su PIN desde su equipo aprobado (como todos), sin plazo; no abre turnos; se ve como «Soporte» en Usuarios, la auditoría e Inicio, y administración la desactiva cuando quiera. Lo sensible sigue pidiendo contraseña y llave. (2) El catálogo se carga sin existencias y el stock se cuenta otro día: estado «Sin inventario inicial», distinto de «Agotado», que **no se vende** hasta su conteo. (3) «Duplicar» un producto y «Duplicar con otros sabores», cada uno con su propio código de barras. Tres pasos: B9-7, T-17 y B9-8. La ruta pasa a **82** | B9-7, T-17, B9-8 |
| **M-29** | **Ajustes más cortos, respaldos con control, una corrida limpia, el inventario en lote y Reportes** (2026-10-08, decisiones del usuario) | (1) Ajustes se unifica: **Personas y equipos** (usuarios, roles y dispositivos), **Tasas** con sus feriados, **Sistema** (versión, respaldos y semilla) y la **carta dentro de Inventario → Productos** (un solo sitio para el precio): de 18 secciones a 12 (T-18). (2) Respaldos: **elegir la carpeta** de la PC (disco externo o carpeta en la nube, regla 3-2-1), **fijar** un respaldo para que la escalera nunca lo borre, y su **integridad a la vista** con un ensayo de restauración automático cada semana (B7-6). (3) La corrida limpia de producción no saca partes de un respaldo (rompería la integridad): base nueva y la **semilla con casillas**, que además lleva medios de pago, descuentos, impuestos e impresoras (B7-7). (4) La cuenta de soporte no mueve dinero en producción; en staging sí, con una copia de la base, para reproducir errores (T-17). (5) Inventario: **editar en lote** (B9-9) y la **hoja de conteo a ciegas con su informe de diferencias** (B9-10). (6) Una sección **Reportes** para administración y supervisión (`reportes.verSucursal`), de solo lectura, que sale de los asientos y cuadra con los cierres: **ventas** del día o de un rango, **inventario al momento** y **movimientos** (kárdex); cada uno en **PDF** con su vista de impresión (sin Excel, decisión del usuario); excepciones y lo demás de F9, después del piloto (Etapa 11). Ocho pasos nuevos; la ruta pasa a **90** | T-18, B7-6, B7-7, T-17, B9-9, B9-10, B11-1 a B11-3 |
| **M-30** | **B8-2 sin manual aparte** (2026-10-08, decisión del usuario) | La ayuda dentro de la app (T-12: el manual de cada pantalla y los recorridos guiados) **es** el manual por rol, y el soporte (T-11, T-17) cubre avisar de un error: B8-2 no escribe otro manual. Queda lo que la app no puede cubrir cuando no está: (1) **el procedimiento en papel**, una hoja impresa junto a la caja que dice cuándo se pasa al papel, quién anota qué y cómo se carga al volver (los formularios ya existen, B3-7); (2) **los runbooks del técnico**, juntos y completos (restaurar un respaldo, volver atrás una actualización, aprobar el equipo que sustituye a uno perdido, cambiar la impresora, los feriados de cada año), partiendo de `infra/produccion/README.md`; (3) **la capacitación por rol**, hecha durante la operación en paralelo (B8-3) con los recorridos de la app, sin material aparte | B8-2 |
| **M-31** | **Un solo punto de cobro y la entrada desde la caja** (2026-10-08, decisiones del usuario) | (1) **El punto de cobro (opción A, con salida de emergencia):** cada equipo lleva la marca «Punto de cobro» (Ajustes → Personas y equipos → Dispositivos); solo los marcados abren turno como hoy; en uno sin marcar, abrir turno pide el PIN de administración y un motivo, queda en la auditoría e Inicio lo avisa mientras siga abierto. Descartadas: un solo turno por local (impide una segunda caja y bloquea si la laptop se daña con su turno abierto), un tope numérico (no dice cuál equipo), solo avisar (llega tarde) y quitarles el permiso a supervisión y administración (deja sin cubrir la caja). (2) **La entrada desde la caja:** vender la entrada de uno o varios niños sin salir de la caja, reutilizando lo de Entrada (se actualiza, no se rediseña): pulsera leída, tecleada o «sin pulsera»; solo prepago; los invitados de un cumpleaños, la cuenta abierta y la carga desde papel siguen en Entrada. (3) El aviso de «sin pulsera» en Inicio, **descartado por ahora** (no es viable ni oportuno). Los dos se adaptan a todo lo que ya existe (ayuda y recorridos, atajos, soporte y `data-privado`, cuenta de soporte, tiempo real, auditoría, permisos, Inicio, Reportes, temas y escala): queda como punto 10 de la definición de hecho, para todo paso nuevo. Primero dos pasos (B3-9 y B4-11); el mismo día el usuario los juntó en **uno solo**, que se termina de punta a punta de forma automática: la ruta pasa a **91** | B3-9 |
| **M-32** | **La caja más clara** (2026-10-08, decisiones del usuario, con las capturas de la caja tras vaciar el inventario) | (1) **La carta de mostrador** (venta directa y «Añadir ítems»): con el catálogo en hoja (B9-7) aparecen todos los productos y la lista se pierde hacia abajo. Lleva **un buscador** arriba que filtra al teclear en toda la carta (nombre, SKU o código de barras), sin importar la categoría abierta; con la búsqueda vacía vuelve la categoría que estaba; Intro añade el primero. La tecla «/» busca en lo que está a la vista: la carta si está abierta, la cola si no. **Los que no se venden ahora** (sin contar, agotados) van al final, atenuados, bajo un título con cuántos son y cada uno con su motivo. La rejilla desplaza dentro de su tarjeta: el panel nunca se sale de la pantalla. (2) **El pie de la cuenta, compacto:** los ítems que se le cobran a la persona son lo que más se tiene que ver. «Factura a», «Descuento» y «Dividir» pasan a **una fila de tres botones** que dicen su estado («Consumidor final» o el nombre, «−10 %», «Entre 3»); dividir abre un menú de 2 a 6 con «Sin dividir». Subtotal e impuestos en un renglón chico y el total, grande. Las reglas no cambian. (3) **«Cerrar cobro» pasa a «Cobrar $ 13.00»**, con el monto que se cobra (el de la parte, si está dividida). (4) **Los botones de categoría, de 44 px** (pedido del usuario durante el paso): con muchas categorías cada renglón cuenta; es una excepción a los 56 px del POS (§8.4), que se queda para todo lo demás de la caja. Descartados por ahora: más columnas en pantallas anchas, una pestaña «Más vendidos» y las categorías en una sola fila que desliza. La ruta pasa a **92** | B3-10 |

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
| **V-5** | **Una sola impresora térmica, en la caja, por red** (TCP 9100): recibo, ticket de corte y comandas. Con el servidor en la nube, la alcanza un agente en la laptop de caja ([ADR-026](adr/026-impresion-por-agente-local.md)) | ~~B5-2~~ |
| **V-6** | **El restaurante entra en el piloto** (cierra D-RES): mesas, carta, pedidos del mesero y cuenta de mesa en el servidor | B6-1 a B6-3 |
| **V-7** | **Inventario mínimo y real** (cierra D-INV): lo que se vende tal cual (refrescos, golosinas, juguetes) y servicios sin existencia (alquiler por cumpleaños, paquetes). Entradas de **varias líneas de una vez** o de un producto, con **costo promedio** y margen. **Lo que no hay no se vende** ([ADR-023](adr/023-existencia-al-entrar-en-la-cuenta.md)). Insumos y recetas de cocina, después del piloto | B9-2 a B9-5 |
| **V-8** | **Todo sincronizado en tiempo real**: sala, cuentas, existencias, turnos y pendientes, comandas, reservas, tasa, catálogo, medios y equipos | B5-1 |
| **V-9** | **Descuentos configurables** por administración (porcentaje o monto; a toda la cuenta, al parque, al restaurante o a categorías; con vigencia), **siempre antes del IVA**. Por **medio de pago** (p. ej. Zelle): la caja lo propone y se aplica solo con la 🔐 de supervisión o administración, y solo si **toda la cuenta** va por ese medio. **Cliente VIP**: administración marca a la familia con su porcentaje. **Manual** con motivo de lista cerrada y 🔐. **Administración** aplica cualquiera con su PIN y un motivo escrito. Todos, en el recibo y en las excepciones | B3-6 |
| **V-10** | **Cumpleaños: reserva con fecha y anticipo.** Horario, cliente, **niños invitados** (sus pulseras cuentan en el aforo), **paquete con productos** (descuenta existencias el día del evento), anticipo al reservar y saldo el día. Sin política de cancelación: devolver un anticipo es anular su cobro (DEC-24) | B10-1, B10-2 |
| **V-11** | **Un solo servidor en la nube (VPS)** con **internet de respaldo 4G** y UPS en la red del local ([ADR-021](adr/021-servidor-en-la-nube.md), cierra D-INF; supersede la topología de ADR-003 y DEC-4/DEC-10 en lo que pedían un equipo en el local) | B7-1, B8-1 |
| **V-12** | **Papel**: si caen los dos enlaces, se anota en formularios; al volver, **la cajera lo carga en su turno**, marcado «desde papel» con la hora real anotada, y **supervisión lo revisa** en el cierre (cierra JORNADA §7.4) | B3-7 |
| **V-13** | **No se cobra IGTF por ahora** (el cliente, 2026-09-28): se programa al 0 % en Ajustes → Impuestos y el motor se queda para cuando vuelva. Con el IGTF al 0 %, la caja y el recibo no enseñan su línea. Cambia lo que M-3 decía del IGTF; el IVA sigue | ~~Ajustes~~ (hecho el 2026-09-29); ~~B3-6~~ (la línea) |
| **V-14** | **La tasa del BCV es siempre la que trae la API**: se retira el umbral de salto de ADR-019 (D-CORD). Si la API falla, administración (o supervisión con 🔐) la carga a mano en Ajustes → Tasas y se aplica al guardarla, como ya hace; en dólares se cobra siempre. Cuando la API trae la del día, la reemplaza | B5-1 |


**M-27 en detalle.** Lo que se vio, lo que se hará y en qué paso. Donde dice **propuesta**, se construye así y se
confirma con el cliente al verlo (como D-AUT o D13); lo que de verdad espera una decisión está en §4.

| # | Lo que se vio | Lo que se hará | Paso |
|---|---|---|---|
| **P-1** | Niños con capacidades especiales que no toleran la pulsera | **Propuesta:** entran **sin pulsera**. La entrada lo marca por niño; el nombre pasa a ser obligatorio y se puede añadir una seña («camisa roja»). El servidor le da un código interno que ningún lector puede producir, y en la sala, la salida y la caja se le encuentra por nombre o por su representante, con el chip «Sin pulsera». Aforo, tiempo y cobro, como cualquiera | B4-8 |
| **P-2** | Clientes que no están en una mesa: de pie, haciendo pedidos | El mesero abre desde la tablet una **cuenta de pie** con un nombre o una seña y le pide como a una mesa; su comanda sale «DE PIE · nombre» y se cobra en la caja como cualquier cuenta | B6-7 |
| **P-3** | Mesas compartidas: familias distintas en la misma mesa por el aforo | **Propuesta:** **varias cuentas en una mesa**, una por familia y con su nombre. El mesero elige a cuál pide, la comanda dice «Mesa 3 · Familia Pérez», y cada una se cobra, se vincula y se libera por separado; la mesa queda libre cuando no le queda ninguna. Cambia I-05. La ocupación del plano pasa a salir del servidor (las cuentas abiertas), lo que salda la deuda del bus (§5) | B6-7 |
| **P-4** | Una sección para que el personal reporte problemas y reciba ayuda: captura, errores reconocidos, ayuda que resuelve, manual y un recorrido con spotlight | **Reportar** desde cualquier pantalla (y desde cada error) con la captura y el contexto que el sistema pone solo; una bandeja con estados que quien reporta sigue, y los reportes del mismo error agrupados («ya está reportado»), en T-11. **Ayuda** de la pantalla en la que se está, manual por rol con búsqueda, la solución de cada error conocido y **recorridos guiados**, en T-12. **Recomendación sobre el recorrido:** automático la primera vez que cada persona abre cada pantalla de operación (corto, de 3 a 5 pasos, se puede saltar) y a petición desde el botón de ayuda; lo visto se guarda por persona en el servidor, porque los equipos del local son compartidos. El canal hasta el desarrollo y lo «inteligente», D-SOP | T-11, T-12 |
| **P-5** | ¿Imprimir o no el ticket de caja? | **Recomendación:** un interruptor «Imprimir recibo» en el cobro, a la vista y con su tecla, que arranca con lo que diga un ajuste de la sucursal (de fábrica, imprimir; hasta B3-8 el cobro no imprimía solo: había que abrir el recibo y pulsar «Imprimir»). Sin imprimir, el recibo se saca después desde Ventas. El corte Z y las comandas se imprimen siempre | B3-8 |
| **P-6** | Medias: quien no las trae las paga | **Propuesta:** un ajuste de la sucursal elige el producto «Medias» del inventario; la entrada pregunta por cada niño «Trae medias» (sí, de fábrica) y, si no, carga el par a la cuenta de la familia. Sale del inventario y, sin existencia, no se vende (ADR-023): la monitora lo ve | B4-9 |
| **P-7** | Recepción: los botones de tiempo (30 min, 1 hora…) cortan el texto; administración quiere dar cortesía o eliminar una pulsera | Los paquetes, como tarjetas con un icono que dice la duración (un arco de reloj; el pase libre, infinito), el nombre entero y el precio debajo (T-15). Desde la sala, administración (supervisión con 🔐) **regala el tiempo** de un niño con un motivo o **anula su entrada** registrada por error: sale sin cobro y deja el aforo; nada se borra (B4-10) | T-15, B4-10 |
| **P-8** | La pulsera se tiene que poder escribir a mano en el parque, la caja y la tablet | El lector admite **escribir el código** (botón «Escribir», con la misma validación) en la entrada, la sala, la salida, la caja y la tablet del mesero | T-15 |
| **P-9** | «Por cobrar» corta los nombres | Un nombre que no cabe se desliza solo (marquesina) y se queda quieto si el equipo pide menos movimiento | T-15 |
| **P-10** | Medios de pago: el icono primero y el nombre debajo | Icono arriba, grande; el nombre debajo, entero | T-15 |
| **P-11** | Un camino de solo teclado para cobrar más rápido | Cobrar sin ratón: la cuenta, el medio, el monto, el recibo y confirmar, con los atajos a la vista | B3-8 |
| **P-12** | En la carta de la caja el precio doble se ve apretado | Selector «$ · Bs · Ambos», recordado por equipo (como el tema) | T-15 |
| **P-13** | En el acceso, usar el teclado: una tecla por persona y el PIN escrito | Con teclado físico, cada persona lleva su tecla (1 a 9 por orden; con más, se escribe su inicial); el PIN se escribe o se pega; Intro entra, Retroceso borra y Esc vuelve | T-14 |
| **P-14** | Pausa del tiempo de una pulsera cuando el niño sale a comer: máximo 10 min, luego corre solo, una sola vez por pulsera | **Una pausa por visita, de hasta 10 minutos** (ajuste de la sucursal, 10 de fábrica): el reloj se detiene y vuelve a correr solo al cumplirse, o antes si la monitora la termina. **Propuesta:** el niño sigue contando en el aforo (su sitio está guardado) | B4-7 |
| **P-15** | Roles: a una persona creada con un rol se le suben los permisos y no cambia nada (p. ej., darle a supervisión el inventario inicial y todo el inventario) | **Fallo encontrado** (no es una caché: el servidor recalcula el permiso en cada operación): dar de alta productos y categorías, y el inventario inicial con productos nuevos, exigen `catalogo.modificar`, que es **intocable**: no se ajusta por rol ni se concede por persona y además pide confirmar identidad. Acción nueva `inventario.catalogo`, ajustable; cada sección del menú contra lo que exige su servidor; y la prueba de que un cambio de permisos llega en vivo | T-13 |
| **P-16** | Un estudio de jerarquía: títulos, subtítulos, iconos y tamaños | La escala de texto y de iconos en tokens, con su porqué, aplicada a las piezas comunes | T-16 |
| **P-17** | Cada persona cambia su PIN desde su propia configuración | «Mi cuenta» en el menú de la persona: el PIN actual y el nuevo dos veces, con sus reglas y su bloqueo | T-14 |
| **P-18** | Inicio usa todo el ancho; las demás secciones dejan márgenes a los lados | Todas las secciones del panel con el ancho de Inicio | T-16 |
| **P-19** | Administración quiere medir la atención en las mesas: cuánto llevan sentados, cuánto esperaron un pedido, y quién está sin atender | Por cuenta del salón: sentada desde, sin pedir desde y esperando desde, con aviso de las que pasan del umbral y el resumen del día. Medir la espera de un pedido exige saber cuándo se sirvió, y ADR-022 retiró «listo/entregado»: D-SERV | B6-8 |

**Auditoría del pedido (2026-10-07).** Lo que el texto no decide y cómo se leyó, para que se corrija si no es así:
«eliminar una pulsera» se lee como anular una entrada registrada por error (no como borrar: regla 5); «asignar una
tecla a usuario» se lee como tecla automática por orden, no elegida en un panel; «copiar el pin con teclado», como
escribirlo o pegarlo; «sección inteligente» y «manual inteligente», sin IA de terceros mientras D-SOP no diga otra
cosa; «Botones de Tiempo… estamos el monitor de parque» se lee como que el monitor de parque trabaja con ellos en el
teléfono, así que T-15 los mide también a 390 px; la pausa «máxima 10 min» se hace ajuste con 10 de fábrica, y «una
pausa por pulsera» es una por visita (la pulsera ya es de un solo uso, V-1).

---

## 3. Ruta a producción

El orden es por dependencia: **nada cobra sin identidad y auditoría debajo** (H-06). Cada paso cuenta
como hecho solo si su criterio se cumple y se puede demostrar, y se marca aquí en el mismo commit.
Los paquetes nuevos siguen el mapa de PLAN §9.2 (`database`, `application`, `auth`, `observability`,
`hardware` y `apps/worker`), y `pnpm arch` incorpora sus fronteras al crearlos.

**Quién lleva cada paso (M-20).** Al empezar un paso, su casilla pasa a `[~]` con «a cargo: <persona>» y la rama; así dos personas no hacen lo mismo. Se marca `[x]` al fusionar en `main`.

**Definición de hecho de un paso de backend.** Un paso cuenta como hecho solo si cumple todo esto:

1. **Contrato** Zod de entrada y salida en `@l2/contracts`. El servidor revalida lo que llega (ADR-017)
   y nada del navegador declara identidades ni instantes.
2. **Dominio** puro con sus pruebas. Las reglas de negocio viven ahí, no en la acción ni en la pantalla.
3. **Caso de uso** en `@l2/application`, dentro de la transacción del tenant: `exigirPermiso…` antes de
   tocar nada, `auditar()` en la misma transacción y rechazos auditados.
4. **Base:** migración versionada y nunca editada una vez aplicada, de expandir y contraer (la versión anterior funciona con la base nueva, ADR-028), `l2_aislar_por_tenant`, solo-agregar
   donde haya dinero, stock o historia, CHECKs, FK compuestas con el tenant, sin `Float` e índices con
   el tenant primero.
5. **Dinero:** clave de idempotencia en toda escritura de dinero y tasa congelada en el asiento (ADR-005).
6. **Pruebas:** unitarias del dominio, `*.test-db.ts` contra la base con reloj fijo si depende del día,
   y negativas de permiso y de aislamiento.
7. **Web:** lectura en `*.servidor.ts` con `connection()`, escritura en `*.acciones.ts` (`unknown` →
   `Resultado`) y el proveedor adopta lo que devuelve. Nada de negocio en el almacenamiento del navegador.
8. **Limpieza:** se borra lo provisional o simulado del paso, tanto el archivo de `src/demo` como su
   fila de §5 (M-11).
9. **Navegador:** el flujo real, con Playwright, a 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas; sin
   errores de consola; estados de carga, vacío y error visibles.
10. **Integración (M-31):** lo nuevo se suma a lo que ya existe y no queda aparte. La **ayuda**: la entrada del manual
    de su pantalla (`ayuda/manual.ts`) y, si cambia el flujo de un puesto, su recorrido guiado (`ayuda/recorridos.ts`);
    una tecla nueva, en la ayuda de atajos. El **soporte**: lo privado con `data-privado` (la captura de un reporte de
    problema no lo lleva), los errores visibles con su aviso (de ahí se reporta) y lo que la **cuenta de soporte** puede o
    no en producción. El **tiempo real** (su tema se relee solo), la **auditoría** (cada acción con su asiento y su tema),
    los **permisos** (por pestaña si vive en una), Inicio y la **Puesta a punto** si avisa o pide algo, **Reportes** si
    cambia lo que cuentan, y los dos temas con la escala de texto, la marquesina y los objetivos táctiles.
11. **Cierre:** `pnpm verify:db` en verde, versión +1 MINOR con su entrada en `CHANGELOG.md` y su
    etiqueta (M-10), y la casilla de este archivo marcada en el mismo commit.

**Orden de ejecución.** Es el camino crítico, y no coincide con el número de etapa:

1. ~~Limpiar la base local → T-1 → B2-1c → B2-2 → B2-3 → B3-1 → B2-4 (se cierra Dinero) → T-3~~.
   B3-1 se adelantó a B2-4 el 2026-09-27 (decisión del cliente): el día de negocio lo asigna el turno
   (ADR-009), así que el turno tenía que existir antes.
2. ~~B3-2 → T-6 → B9-1~~ (catálogo, que el cobro necesita) →
   ~~B3-3 → B3-4 → B3-5~~ (se cierra Caja).
3. ~~B4-1 → B4-2 → B4-3 → B3-5 → B5-1~~ (todo en tiempo real, V-8) → ~~B4-4~~ → ~~B4-5~~ (la monitora en el
   teléfono; se cierra Parque). M-14 adelantó el parque a B3-5 y a B5-1: mientras no haya tiempo real, la
   sala viaja por sondeo de 5 s.
4. ~~B9-2~~ → ~~B9-3~~ → ~~B9-4~~ → ~~B9-5~~ → ~~B9-6~~ (se cierra Inventario) → ~~B3-6~~ (descuentos) → ~~B5-2~~ (impresión y comandas).
5. ~~B6-1~~ (con Carta y Plano en el patrón de M-17) → ~~B6-2~~ (comanda impresa) → ~~T-7~~ (el resto de Ajustes en ese
   patrón) → ~~B6-3~~ (restaurante, en el piloto por M-15) → ~~B6-5~~ → ~~B6-6~~ → ~~B4-6~~ (M-18) → ~~B10-1~~ → ~~B10-2~~ (eventos). B6-2 va antes que T-7 porque el
   cliente ya prueba el restaurante y la comanda no sale en papel hasta B6-2 (2026-10-01).
6. ~~B3-7~~ (carga desde papel) → ~~B2-5~~ (IVA incluido, M-19) y los datos reales del local → ~~T-2~~ (cero simulación) → ~~T-4~~ (instalación inicial y llaves de acceso)
   → ~~T-8a~~ (publicar y desplegar, M-22) → ~~B7-1~~ (VPS) → ~~T-9~~ (confirmar identidad desde cualquier equipo, M-23) → ~~B7-2 y T-10~~ (la semilla del local y el inventario en lote, M-24) → ~~T-8b~~ (actualizaciones desde el panel, M-25) → ~~B7-4~~ (respaldos, M-26) → ~~B7-5~~ (seguridad), y B7-3 con **T-8c** (el agente se actualiza solo) en el local
   → Etapa 8 (producción, 1.0.0); T-8b tiene que estar antes de B8-3.
7. **M-27** (lo pedido en la primera visita), del más complejo al más simple, saltando lo que espera una decisión:
   ~~B6-7~~ (varias cuentas por mesa y de pie) → ~~B4-7~~ (pausa) → ~~B4-8~~ (sin pulsera) → ~~T-12~~ (ayuda y recorridos) →
   ~~B4-10~~ (cortesía y anular desde la sala) → ~~B4-9~~ (medias) → ~~T-13~~ (roles) → ~~B3-8~~ (cobrar con el teclado) → ~~T-14~~ (mi PIN
   y el acceso con teclado) → ~~T-15~~ (la operación de un vistazo) → ~~T-16~~ (jerarquía y ancho). **B6-8** espera D-SERV y
   **T-11**, D-SOP: decididas el 2026-10-07 (las dos como se propusieron); ~~T-11~~ → ~~B6-8~~: M-27 cerrado. B7-3 y T-8c siguen cuando haya visita al local.
8. **M-28 y M-29**, del más complejo al más simple: ~~B9-7~~ (catálogo sin existencias y su conteo inicial) → ~~B7-7~~ (la
   semilla con casillas) → ~~B7-6~~ (respaldos con carpeta, fijados e integridad) → ~~B11-1~~ (Reportes y las ventas) → ~~T-18~~
   (Ajustes unificados) → ~~B11-3~~ (movimientos) → ~~B11-2~~ (inventario al momento) → ~~T-17~~ (cuenta de soporte) → ~~B9-10~~ (conteo
   a ciegas y su informe) → ~~B9-9~~ (editar en lote) → ~~B9-8~~ (duplicar productos).
9. **M-31**: ~~B3-9~~ (el punto de cobro y la entrada desde la caja): una sola tarea, de punta a punta, sin pedir el sí
   entre sus partes (el usuario, 2026-10-08).
10. **Hacia la 1.0.0**, lo que no necesita el local: ~~T-8c~~ (se programa y se prueba en una PC con Windows como la de
   caja; en la laptop real se comprueba con B7-3) → **B8-2** (~~lo que se escribe~~: la hoja del procedimiento en papel y
   los runbooks del técnico; la capacitación se da en B8-3, y ahí se cierra). Después, en el local: B7-3, B8-1, B8-3 y
   **B8-4 = 1.0.0**, con D-REL decidido.
11. **M-32**: ~~B3-10~~ (la caja más clara), con el sí del usuario. Antes de B8-3: la operación en paralelo y la
   capacitación se hacen con la caja como va a quedar.

Fuera de la cuenta de 92: B5-3 (retirado, D-GAV) y B6-4 (recetas e insumos de cocina), después del piloto (M-15, V-7).

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
- [x] **T-4 · Instalación inicial y llaves de acceso** (M-12, ADR-020), antes de B7-1.
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
  *Hecho el 2026-10-06 (aemorandin-coder):*
  *· **Servidor:** migración `20261030000000_llaves_de_acceso` (solo expande: `passkey`, `recovery_code`, `enrollment_link`,
  `auth_challenge`, `installation`); `identidad/llaves.ts` (WebAuthn con SimpleWebAuthn, desafío de un solo uso, códigos de
  recuperación), `elevacion.ts`, `enlaces.ts` (ALTA o LLAVE, 24 h, el secreto en el fragmento de la dirección),
  `instalacion.ts` (código con bloqueo, todo en una transacción) y `sucursal/puesta-a-punto.ts`; contratos en
  `contracts/credenciales.ts`; `checkNewPassword` en el dominio; `otpauth` retirado. `test:db` de aplicación, 534 en verde.*
  *· **Web:** `L2_URL_PUBLICA` obligatoria; el diálogo de elevación y el alta de equipo piden contraseña + llave, o un
  código de recuperación (`SegundoFactor.tsx`, `llave.cliente.ts`); «Instalar L2 Control» en `/acceso` en cuatro pasos
  cortos (`InstalacionScreen.tsx`); `/alta` (`AltaScreen.tsx`); los códigos se enseñan una vez y se imprimen solos
  (`CodigosDeRecuperacion.tsx`); credenciales de cada persona y enlace con QR en Ajustes → Usuarios
  (`CredencialesDePersona.tsx`, `Qr.tsx` con `qrcode-generator`); Puesta a punto en Inicio (`PuestaAPunto.tsx`).*
  *· **Consola:** `pnpm credenciales "<nombre>" [llave]` y `pnpm db:semilla` imprimen un enlace de alta; se retira `pnpm totp`.*
  *· **Lo que apareció al abrirlo con la base vacía:** el layout exigía un tarifario publicado y ni el acceso abría: ahora
  `tarifarioVigente()` admite «sin publicar», la entrada lo dice y el editor publica el primero desde un borrador que no
  cobra nada por su cuenta. Al completar la instalación el servidor repintaba el acceso y se llevaba los códigos antes de
  poder guardarlos: la pantalla de instalación es ahora la puerta del acceso y los conserva. La Puesta a punto daba
  «Medios de pago» por hecho en un local nuevo (contaba el USDT, que nace encendido): cuenta solo Pago Móvil, Zelle y el
  punto. El worker fallaba al guardar la tasa de un local sin instalar: espera en silencio y la trae al instalarse.*
  *· **Comprobado en el navegador** (Chromium con autenticador virtual, a 1366×768, 1280×800 y 800×1280, sin desplazar el
  documento, sin botones cortados y sin errores de consola): con la base vacía, código equivocado y PIN trivial rechazados
  junto a su campo, instalación completa, diez códigos, entrada al panel, Puesta a punto con 0 de 13 y el acceso que ya no
  ofrece instalar; con el local de desarrollo, alta con enlace, enlace usado que ya no vale, equipo aprobado con
  contraseña + llave y con un código, elevación con llave y con código (y el mismo código rechazado la segunda vez),
  «Reponer credenciales» con su confirmación, «Añadir otra llave» con QR y una segunda llave en otro autenticador. Las
  pruebas de navegador se corrieron a mano: el repositorio sigue sin suite de Playwright (JORNADA §8).*
  *· **En la base local de quien lo probó:** tres locales de prueba «Parque de Prueba T4» (cada uno con su tenant, aislados
  por RLS) y los equipos «Prueba T4 …», revocados. Las credenciales de Abigail Karam quedaron atadas a un autenticador
  virtual que ya no existe: se reponen con `pnpm credenciales "Abigail Karam"`.*
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
- [x] **T-7 · Ajustes con un mismo patrón** (M-17, pedido del cliente el 2026-10-01; la ruta pasa a 57), después
  de B6-2.
  → **Roles y accesos, Usuarios, Dispositivos, Descuentos, Tasas de cambio y Tarifas y paquetes** siguen el
  patrón de Impresoras (v0.39.2) con las piezas comunes que B6-1 sube a `@l2/ui`: resumen arriba, pestañas,
  hoja lateral para alta y edición, confirmación de lo irreversible, y las listas que crecen (historial de
  tasas, cambios de equipos, versiones de tarifas, lo que haga falta al medirlas) **paginadas en el servidor**
  con filtros, conteos y «Limpiar filtros», tabla en el escritorio y tarjetas en tableta y teléfono. Ninguna
  regla de negocio cambia: si una pantalla necesita leer por páginas, su caso de uso lo hace con su
  `*.test-db.ts`. Cada una, en el navegador a 1366×768, 1280×800 y 800×1280 sin desplazar la página, y en
  teléfono; sin errores de consola. Medios de pago, Impuestos, Feriados y Sucursal (listas cortas) quedan como
  están salvo que el cliente las pida.
  *Hecho el 2026-10-02 (v0.42.0). **Dispositivos:** `dispositivos.pagina` (filtro por estado y «con sesión», búsqueda
  por nombre o código, orden pendientes→nuevos); 6 pruebas nuevas (`dispositivos.test-db.ts`). **Tasas:**
  `tasas.pagina` (en qué quedó cada tasa — aplicada, por confirmar, no usada — y por par); 4 pruebas nuevas
  (`tasas-paginas.test-db.ts`). **Tarifario:** `tarifario.versiones` con `cambiosDeTarifario` (compara cada versión
  con la anterior: paquetes nuevos, retirados o con otro precio o duración, reglas del parque); 1 prueba nueva.
  Dispositivos, Usuarios y Accesos no tenían caso de uso por página propio: la lista corta la trae el caso de uso
  existente y la pantalla filtra y pagina en memoria (Usuarios, Accesos) o usa un hook compartido (`usePaginas`) sobre
  el nuevo caso de uso (Dispositivos, Tasas, Tarifario). Confirmar identidad para ver sigue en Usuarios, Accesos y
  Dispositivos (sin cambios). Navegador a 1366×768, 1280×800 y 800×1280 sin desplazar la página, y en teléfono; sin
  errores de consola (detalle en §1).*
- [x] **T-2 · Cero simulación** (M-11), antes de B7-1.
  → ~~La carpeta `src/demo` ya no existe y se retira la regla `demo-solo-desde-las-rutas`~~ (hecho con B6-1, que
  borró lo último). Falta que `pnpm lint` sume la regla `sin-simulacion`: rechaza datos de negocio en el almacenamiento del navegador, PINs
  literales y listas de ejemplo en `features/`. El CI sale en rojo con una violación.
  *Hecho el 2026-10-06 (aemorandin-coder): `sin-simulacion` en `scripts/lint-reglas.mjs`, con tres caras bajo un solo
  nombre (almacenamiento del navegador en la web; un PIN literal fuera de las pruebas; y, en la web, una lista de
  datos del contrato escrita a mano, un nombre de demostración o una importación desde una carpeta `demo`) y cuatro
  pruebas que demuestran que muerde y que no salta con las opciones de una pantalla. El código pasa sin violaciones;
  la única excepción, con su motivo, es la vista de Inventario que cada navegador recuerda. **Visto en rojo en
  GitHub:** el PR #6 (rama `prueba/ci-en-rojo`, cerrado sin fusionar) guardaba la sala en `localStorage` y
  `pnpm lint` lo rechazó en el check «pnpm verify:db». En el equipo de quien lo hizo no había Node ni Docker: la
  regla se comprobó en el CI.*

- [x] **T-8a · Publicar y desplegar** (M-20, M-22, [ADR-028](adr/028-actualizaciones.md)), antes de B7-1.
  → La web y el worker tienen su imagen (Next en `standalone`, el worker con Node sin compilar) y un `compose` de
  producción con PostgreSQL, Valkey y Caddy (HTTPS automático) que se prueba en local. Una etiqueta `vX.Y.Z` en
  `main` construye y publica las imágenes y el ejecutable del agente con su huella (SHA-256). Un despliegue hace
  respaldo → migraciones → versión nueva → comprobación de salud (web, worker y base) y, **con la comprobación
  forzada a fallar, vuelve solo a la versión anterior** sin tocar datos. El CI construye la versión de producción.
  *Hecho el 2026-10-06 (LuAMi), v0.53.0:*
  *· **Imágenes** (`infra/docker/Dockerfile`, una receta y tres destinos): `web` con Next `standalone` (`output` y
  `outputFileTracingRoot` en `next.config.ts`; 41 MB de servidor), `worker` y `migrar` desde un workspace recortado con
  `turbo prune` (el worker, 398 MB con Node). Todas como `node`, sin secretos; OpenSSL en la base antes de instalar para que
  Prisma elija su motor, y `migrar` sin la caché de efectos de pnpm. La descarga del agente ya no traza el proyecto entero
  (`turbopackIgnore`) ni lee el package.json raíz (no está en la imagen): su versión es la incrustada.*
  *· **Salud:** `/salud` en la web (versión y si la base contesta, sin sesión y sin datos del negocio) con `salud.comprobar`
  en `@l2/application` (`sistema/salud.ts`, con su `test-db`); el worker ya tenía la suya.*
  *· **Servidor** (`infra/produccion`): `compose.yml` (solo Caddy abre puertos; cada servicio recibe solo sus variables),
  `Caddyfile` (`/tiempo-real` y `/impresion/vincular` al worker), `entorno.ejemplo`, `desplegar.sh` (`--claves`, `--estado`,
  `L2_FORZAR_FALLO_SALUD=si` para ensayar) y su README. El guion de roles de PostgreSQL acepta `L2_BASES` y
  `L2_MIGRADOR_CREA_BASES` (en el servidor, solo `l2control` y el migrador sin CREATEDB).*
  *· **Publicación:** `.github/workflows/publicar.yml` (la etiqueta tiene que ser la versión; agente en Windows con su huella
  en el «release» con las novedades del CHANGELOG; imágenes en `ghcr.io/luam-lu/l2control-*`). El CI construye las tres
  imágenes dentro del check «pnpm verify:db».*
  *· **Ensayo** en esta PC con Caddy en `https://localhost`, base nueva y `L2_REGISTRO=local`: instalación de la 0.52.3 (el
  acceso ofrece «Instalar L2 Control» y el registro trae el código); la 0.53.0 con la comprobación forzada a fallar → vuelta
  a la 0.52.3; una «0.54.0» que respondía otra versión → vuelta a la 0.52.3; la 0.53.0 sin forzar → en marcha. Cada paso
  con su respaldo y su línea en `historial.log`. El acceso desplegado se vio en Chromium a 1366×768. La publicación por
  etiqueta corre por primera vez con la etiqueta de esta versión.*
- [x] **T-9 · Confirmar identidad desde cualquier equipo** (M-23, [ADR-029](adr/029-equipo-de-confianza-y-app-de-autenticacion.md)), antes de B7-2.
  → Se instala L2 Control desde un equipo sin llave de acceso (sin Windows Hello, una tableta sin Google) y ese
  equipo queda de confianza: confirmar identidad en él pide solo la contraseña. En otro equipo, la contraseña y
  el código de la app de autenticación (configurada con un QR desde la propia sesión; un código ya aceptado no
  vale otra vez), una llave o un código de recuperación; al confirmar se puede marcar «Confiar en este equipo».
  La confianza es por persona y equipo, se ve y se retira en Ajustes → Usuarios y cae al revocar el equipo.
  Aprobar un equipo desde sí mismo acepta también la app. El enlace de alta no exige llave. Todo auditado y
  visto en el navegador en los dos temas.
  *Hecho el 2026-10-07 (LuAMi), v0.55.0:*
  *· **Servidor:** migración `20261031000000_confianza_y_app` (`trusted_device`, `totp_credential`, solo expande);
  `identidad/app.ts` (TOTP con `otpauth`, ventana de ±1 intervalo y sin repetir: se guarda el último aceptado),
  `factores.ts` (configurar, confirmar y quitar la app; retirar confianza), `elevacion.ts` (opciones, sin factor en el
  equipo de confianza, «confiar», la app al aprobar un equipo), instalación y alta con la llave opcional. `pnpm verify:db`
  en verde (544 de aplicación; 8 nuevas en `factores.test-db.ts`).*
  *· **Web:** `SegundoFactor`, diálogo de confirmación (lo que vale en ese equipo, lo más cómodo primero), instalación,
  alta, Ajustes → Usuarios (QR de la app, equipos de confianza) y Puesta a punto (`otros_equipos`). La puerta de una
  sección protegida ya no promete «con tu contraseña» en un equipo que pide además la app.*
  *· **Navegador**, desde una instalación limpia con las imágenes de la rama en `https://localhost` (`desplegar.sh` con
  `L2_REGISTRO=local`): instalar sin llave (el equipo queda de confianza y la Puesta a punto pide la app); confirmar con
  solo la contraseña; configurar la app con su clave (un código malo se rechaza junto al campo); en un teléfono, registrar
  y aprobar el equipo con la app; el mismo código otra vez, rechazado; el siguiente con «Confiar en este equipo»; retirar la
  confianza (vuelve a pedir la app) y revocar el equipo (la confianza cae con él); alta de una segunda administración por
  enlace sin llave. A 1366×768 y 390×844, en claro y en oscuro; cada paso en la auditoría con el factor usado. Salieron
  y se corrigieron: en el teléfono, el nombre del equipo de confianza (y el de una llave) quedaba en una letra; quien
  entra por un enlace de alta no tiene equipo de confianza y el aviso le hablaba de él; `/alta` no estiraba la marca
  hasta el pie (desde T-4).*
- [x] **T-8b · Actualizaciones desde el panel** (M-20, M-22, M-25, [ADR-028](adr/028-actualizaciones.md)), antes de B8-3.
  → Staging se actualiza solo con cada etiqueta. En producción, Ajustes → Sistema enseña la versión en marcha,
  la disponible y sus novedades, y administración elige «Actualizar ahora» (solo sin turnos abiertos ni niños en
  sala), «Esta noche al cierre» o «Más tarde», con su 🔐 y auditado; la actualización usa el despliegue de T-8a y
  lo que vuelve atrás se avisa en el panel. Con una versión nueva en marcha, una pantalla abierta se recarga sola al
  quedar libre, y una con la versión vieja que el servidor ya no acepta no cobra hasta recargarse (prueba en el
  navegador con dos versiones). *El agente pasó a T-8c (M-25).*
  *Hecho (v0.58.0, LuAMi): `system_release` y `system_update` (una activa a la vez, por índice) y `setup_postponement`,
  con RLS; `@l2/application` `actualizaciones` (ver, pedir con elevación, cancelar con la condición en el `where`;
  «ahora» se niega con turnos sin Z o niños en sala que no sean huérfanos) y `puestaAPunto.posponer`; las acciones
  `sistema.actualizar`, `sistema.cancelar`, `sistema.resultado` (tema `sistema`) y `puesta.posponer`/`puesta.retomar`.
  «Más tarde» es no pedirla: la versión sigue ofrecida. `infra/produccion/actualizador.sh` (cron cada minuto, con
  cerrojo): versiones de los «release» de GitHub cuyas tres imágenes ya están en ghcr.io (cada 5 min), la pedida sola
  en staging (una que falló no se repite), la regla de operación otra vez en SQL, `git pull` + `desplegar.sh` y el
  resultado con su asiento. Las pantallas (`PuestaAlDia` y `puesta-al-dia.ts`): con otra versión en `/salud`, el canal
  en vivo deja de repintar (Next recargaría de golpe y se perdería un borrador) y la pantalla se recarga al quedar libre
  (`useSinGuardar` en el pedido del mesero y el editor del plano). Visto en el navegador, en el ensayo local con la
  0.58.0 y una 0.58.1 construidas en la PC, en claro y en oscuro: pedir «ahora», puesta en 6 s con respaldo, Sistema e
  Inicio recargadas solas y Sucursal (cursor en un campo) con el aviso hasta soltarlo; con un turno abierto, «ahora»
  desactivado y «al cierre» esperando sin poner nada hasta cancelarla; en staging, una 0.58.2 que respondía otra
  versión volvió a la 0.58.1 con el motivo en el panel y no se volvió a pedir. Salió en el ensayo: tras el despliegue,
  el canal en vivo pide su ticket con una acción que la versión nueva ya no reconoce (404), así que no volvía y la
  pantalla tardaba 30 s (el modo degradado) en enterarse; ahora un ticket que no llega lleva a preguntar a `/salud`
  enseguida. Y el modo degradado ya no repinta contra un servidor que no contesta (dejaba la página de error del
  navegador).*
- [x] **T-8c · El agente de impresión se actualiza solo** (M-25, [ADR-028](adr/028-actualizaciones.md) punto 5): se
  programa y se prueba en una PC con Windows antes de la visita, y se comprueba en la laptop de caja real con B7-3; antes
  de B8-3.
  → El agente dice su versión al servidor; con una nueva y la cola vacía, la descarga del propio servidor, comprueba su
  huella (SHA-256 publicada con la versión), rechaza un ejecutable con la huella equivocada, se cambia sin papel
  pendiente y, si la versión nueva no arranca, la tarea de Windows vuelve a la anterior. Ajustes → Impresoras enseña la
  versión del agente y la disponible, con «Actualizar ahora». Probado en la laptop de caja real.
  *Hecho el 2026-10-08 (v0.86.0), en `feat/t-8c`; la comprobación en la laptop de caja real pasa a B7-3.*
  *· Base: `20261114000000_agente_se_actualiza` (solo expande): en `print_agent`, la versión que dice, «Actualizar ahora»
  pedido y el resultado de su último cambio (con sus CHECK: versión acotada; resultado, versión y hora juntos).*
  *· Contrato: `VersionDelAgenteSchema` (versión, SHA-256 y si se pidió), `NotaDeActualizacionSchema` y
  `ResultadoDeActualizacionSchema` (ACTUALIZADO, HUELLA_EQUIVOCADA, NO_ARRANCA, NO_ARRANCO, ERROR); el agente del panel
  con su versión, lo pedido y su última actualización; la orden `ACTUALIZAR_AGENTE`; el tema `agente`.*
  *· Aplicación: `abrirAgente(…, version)` anota la versión que dice al conectarse y, si cambió, el cambio («Se
  actualizó») y resuelve lo pedido; `actualizacionDe` (para la web, por la credencial); `anotarActualizacion` (lo que
  no salió, al panel y a la auditoría); «Actualizar ahora» con `catalogo.modificar` e identidad confirmada. Asientos
  `agente.version`, `agente.actualizar` (tema `agente`) y `agente.actualizacion`. 2 pruebas contra la base.*
  *· Worker: la versión en el apretón de manos, el evento `actualizacion` del agente y `revisar-version` hacia la
  sucursal cuando se pide; la vinculación devuelve la dirección de la web. 1 prueba.*
  *· Web: `/descargas/agente/version` y `/descargas/agente/archivo` con la credencial del agente (`Bearer`); la versión
  empaquetada sale de `l2-impresion.exe.version` (que escribe `empaquetar.mjs` y sube «Publicar»). Ajustes →
  Impresoras → Agente: su versión frente a la disponible, «Actualizar ahora», lo pedido y su último cambio; la entrada
  del manual de Impresoras con sus tres avisos.*
  *· Agente (`actualizacion.ts`): revisa al conectarse, cada 30 min y con `revisar-version`; con la cola vacía
  descarga, comprueba la huella y que el ejecutable diga su versión; el cambio lo hace otra tarea de Windows, «L2
  Control - Impresion (cambio)», que vuelve al anterior si el nuevo no queda vivo en 90 s. No reintenta solo una
  versión que falló; un servidor que volvió atrás no lo arrastra. 8 pruebas.*
  *· Salió en el ensayo: lanzado como hijo del agente, el guion del cambio moría con la tarea (Windows cierra juntos
  los procesos de una tarea): por eso el cambio va en su propia tarea. Y el guion se escribe con BOM: PowerShell 5.1
  lee como ANSI un archivo sin él.*
  *· Ensayado en esta PC con Windows (sin ser administrador: la tarea del agente, a nombre del usuario, con los mismos
  ajustes), contra la base de pruebas: la 0.85.0 instalada se cambió sola a la 0.85.1; con «Actualizar ahora», una
  0.85.2 con la huella equivocada no se instaló; una 0.85.3 que no arranca se puso y Windows volvió a la 0.85.1 en
  90 s, con «La 0.85.3 no arrancó: volvió la anterior» en el panel; una 0.85.4 se instaló. El panel, a 1366×768,
  1280×800, 800×1280 y 390 px en los dos temas, sin errores de consola. Un agente instalado antes de la 0.86.0 no sabe
  actualizarse: se reinstala una vez.*
- [x] **T-10 · Inventario en lote** (M-24), con B7-2.
  → Una entrada se llena como una hoja de cálculo: una fila por producto (buscado por nombre, SKU o código, o nuevo
  con su ficha corta), Tab entre campos e Intro para la siguiente. Cada línea dice la cantidad en unidades sueltas o en
  bultos de N, y el costo por unidad, por bulto o el total de la línea; propone el último costo de ese producto. Una
  lista copiada de Excel o Google Sheets (producto, cantidad, costo y, para los nuevos, categoría y precio) se pega,
  se revisa y entra en la tabla. «Inventario inicial» trae todos los productos que se cuentan para escribir su
  existencia de arranque con su costo, y queda como tal en el historial. Las categorías son una lista propia que se
  administra en Inventario → Productos (crear, renombrar, unir, retirar una vacía), nace con unas de arranque, y un
  nombre que solo cambia en mayúsculas o espacios es la misma. Todo con su auditoría, visto en el navegador en los
  dos temas.
  *Hecho el 2026-10-07 (LuAMi), v0.57.0, con B7-2:*
  *· **Base:** `20261101000000_categorias_e_inventario_inicial` (solo expande): `product_category` (vigente única sin
  contar mayúsculas ni espacios; se retira, no se borra), rellena con las categorías que ya usaban los productos y las de
  arranque (con la RLS de `product` y `tenant` suspendida solo mientras rellena), y `stock_entry.kind` admite `INICIAL`
  (sin proveedor ni factura). El producto sigue guardando el nombre de su categoría: la versión anterior funciona igual.*
  *· **Dominio:** `STARTER_CATEGORIES`, `categoryProblem`, `cleanCategory`, `findCategory`; la línea de entrada lleva su
  costo `{ per: UNIT | PACK | LINE }` y `packCostOf` da lo que costó un bulto registrado.*
  *· **Aplicación:** `categorias.ts` (crear, renombrar con sus productos, unir, retirar una vacía; `catalogo.modificar`) y
  `lista-de-categorias.ts` (`asegurarCategoria`: el alta y la edición de un producto dejan la categoría como está en la
  lista o la añaden, con su asiento); el catálogo trae la lista con sus conteos y el último costo de cada bulto; la
  entrada acepta el costo por unidad, por bulto o total y el inventario inicial, hasta 300 líneas. **Corregido de B9-6:**
  una entrada con varios productos nuevos en la que uno no valía dejaba creados los anteriores (el rechazo se devolvía y
  la transacción se confirmaba); ahora se deshace entera. `crearLocal` nace con las de arranque.*
  *· **Web:** Productos → Categorías (hoja con crear, renombrar, unir y retirar); la entrada es una tabla en una hoja ancha
  (buscador de producto con flechas e Intro, «producto nuevo» con su ficha bajo la fila, cantidad en unidades o bultos de
  N, costo por unidad, por bulto o total, total y costo por unidad de cada fila, Intro en el costo pasa a la siguiente,
  el lector suma o abre la fila); «Pegar desde Excel» (tabuladores o «;», títulos saltados, cada fila marcada conocida,
  nueva, con algo que completar o que no entra); «Inventario inicial» trae todos los que se cuentan en unidades al costo
  de una y salta los que quedan sin cantidad o en cero; la Puesta a punto abre ese modo; las fichas sugieren las
  categorías de la lista.*
  *· **Navegador**, en el ensayo con las imágenes de la rama en `https://localhost`: crear, renombrar, unir a «Golosinas»;
  pegar cinco filas (tres nuevas completas, una sin precio completada en la tabla, una de un preparado rechazada) y
  registrarlas; una compra con 2 bultos de 24 a $ 13,20 el bulto ($ 26,40, $ 0,55 c/u) y 3 unidades por $ 2,00 en total;
  el último costo propuesto; el inventario inicial con «Traer todos»; a 1366×768 y 390×844, en claro y en oscuro. Salieron
  y se corrigieron: el inventario inicial proponía bultos (10 eran 240 unidades) y la hoja de categorías cortaba los
  nombres con tres botones.*

- [x] **T-11 · Reportar un problema** (M-27, P-4; D-SOP decidida).
  → Desde cualquier pantalla, y desde cada error, la persona cuenta qué pasó; el sistema adjunta la captura, la
  pantalla, la versión, el equipo, su rol y los últimos errores, sin datos de cobro ni PIN (PLAN §7.6). El reporte
  queda en el servidor con sus estados (nuevo, visto, en curso, resuelto en la versión X), que quien lo envió sigue
  en «Mis reportes»; los que traen el mismo error se agrupan y quien reporta ve que ya se conoce.
  *Hecho el 2026-10-07 (LuAMi), v0.72.0, con D-SOP como se propuso.* **Base** (`20261108000000_reportes_de_problemas`,
  solo expande): `support_report` (correlativo por local, quién, rol, equipo, pantalla, versión, texto, código y huella
  del error, últimos errores), `support_report_capture` (aparte, JPEG o PNG, con tope), `support_report_status` (la
  historia: el estado es el último paso) y `support_report_notice` (los intentos de aviso); las cuatro con RLS y solo
  agregar. **Dominio:** `soporte.gestionar` (administración de fábrica, ajustable). **Aplicación**
  (`sistema/soporte.ts`): reportar (quién, rol y equipo salen de la sesión; la captura se comprueba por sus primeros
  bytes; el asiento no lleva el texto), mis reportes, la bandeja, la captura (quien la envió y el soporte), el estado
  (resuelto exige versión) y, para el worker, los pendientes de aviso con reintento y espera (10 min, doblando, 5
  intentos). Los del mismo error se agrupan por su huella: el código del error conocido o el último error sin cifras ni
  tildes; quien reporta ve cuántos antes y cómo va el más avanzado. Tema nuevo «soporte». 6 pruebas contra la base y 3
  de la huella. **Worker** (`soporte.ts`): con `L2_SMTP_URL` y `L2_CORREO_SOPORTE`, un correo por reporte con el
  número, la versión, la pantalla y el enlace a la bandeja, nunca el texto ni la captura; sale en cuanto entra el reporte
  (outbox) y en una vuelta cada 2 minutos; si no sale se anota el tipo de fallo, sin la respuesta del servidor
  (nodemailer 10.0.12). Variables documentadas en `.env.example`, `infra/produccion/entorno.ejemplo` y el compose.
  **Web:** «Reportar un problema» al pie de la ayuda (F1), «¿No se resolvió? Repórtalo» en la ayuda de un error
  conocido y «Reportar» en el aviso de un error que el manual no conoce; la captura se toma con la ayuda ya cerrada
  (html-to-image 1.11.13), sin los campos de PIN ni lo marcado `data-privado` (los datos de un pago), con vista previa
  y se puede quitar; «Mis reportes» en la ayuda, en vivo; Ajustes → Soporte con cifras, filtros, el reporte entero con
  su captura (servida solo con sesión por `/soporte/captura/[id]`, sin caché), su historia y los botones de estado; el
  manual tiene su página. **Cuenta de soporte del desarrollo:** administración la da de alta como una persona más con
  rol de administración (no pide turno). Visto en el navegador en la base de pruebas, en los dos temas, con un servidor
  SMTP falso: una pulsera desconocida en la caja → «Reportar» → captura de 1366×768 (100 KB) → reporte n.º 1; la
  bandeja lo muestra con su captura; «En curso» y «Resuelto en v0.72.0» llegan a «Mis reportes» sin recargar; el
  correo sale en el mismo segundo y sin el texto; el segundo reporte del mismo error dice que ya quedó resuelto.*
- [x] **T-12 · Ayuda dentro de la app y recorridos guiados** (M-27, P-4).
  → Un botón de ayuda en cada pantalla abre lo que dice el manual de esa pantalla para el rol de quien la usa, con
  búsqueda en todo el manual; cada error conocido trae su solución. La primera vez que una persona abre una pantalla
  de operación ve un recorrido corto con spotlight (se salta y se vuelve a pedir desde la ayuda); lo visto se guarda
  por persona en el servidor. El manual por rol se escribe una vez y lo reutiliza B8-2.
  *Hecho el 2026-10-07 (LuAMi), v0.64.0, sin IA (D-SOP sigue abierta).* **Manual** (`features/ayuda/manual.ts`): una
  entrada por pantalla (acceso, entrada, sala, salida, cobrar, turno, mesas, Inicio, inventario, ajustes) con su
  propósito, cómo se usa y sus problemas frecuentes, cada uno con su solución y las palabras del aviso que lo reconocen;
  búsqueda que puntúa por palabras y raíces. **Ayuda:** botón en la barra de las estaciones y en el pie del panel, y F1
  en cualquier pantalla; la hoja enseña la pantalla actual, busca en todo el manual y, abierta desde un aviso, empieza
  por «Lo que pasó» y su solución. **Errores:** `avisar.error` de `@l2/ui` pone «Cómo se resuelve» cuando la app
  reconoce el mensaje (`registrarAyudaDeErrores`; la interfaz no sabe qué errores existen). **Recorridos:** `Recorrido`
  en `@l2/ui` (velo con hueco sobre el elemento, tarjeta siempre entera en la pantalla, teclado, sin animación si se pide
  menos movimiento, salta lo que no está en pantalla); cinco recorridos (entrada, sala, salida, caja, mesas) sobre marcas
  `data-recorrido`; el de una pantalla sale solo la primera vez que cada persona la abre y a petición desde la ayuda.
  **Servidor:** `user_tour_seen` (migración `20261106000000_recorridos_vistos`, solo expande; una fila por persona,
  recorrido y versión; solo-agregar), `casosRecorridos` (vistos y marcar, auditado `ayuda.recorrido`, sin tema); 3
  pruebas contra la base. Visto en el navegador en la base de pruebas: el recorrido de la sala solo la primera vez y no
  al recargar, F1, la búsqueda coloquial («pulsera usada», «no imprime»), «Cómo se resuelve» en un error real de las
  mesas, y el recorrido de las mesas entero a 1366×768, 800×1280 y 390 px.*
- [x] **T-13 · Roles que se pueden dar** (M-27, P-15).
  → Acción nueva `inventario.catalogo` (alta y ficha de productos y categorías; cambiar el precio de lo que existe
  sigue en `catalogo.modificar`), ajustable por rol y por persona y sin confirmar identidad: con ella, supervisión
  da de alta productos y carga el inventario inicial. Cada sección del menú pide lo mismo que su servidor (escrito en
  una prueba); Roles y accesos dice por qué una celda no se ajusta; un cambio de permisos llega a la sesión abierta
  sin volver a entrar (visto con dos equipos).
  *Hecho el 2026-10-07 (LuAMi), v0.67.0.* **Causa:** no era una caché (el servidor recalcula el permiso en cada
  operación y el tema «personal» refresca la sesión abierta): dar de alta un producto o una categoría, y cargar el
  inventario inicial con productos nuevos, exigían `catalogo.modificar`, que es intocable y pide confirmar identidad;
  ningún ajuste lo abría. **Dominio:** `inventario.catalogo` en la matriz (administración de fábrica; ajustable), con su
  decisión en `matriz-del-plan.test.ts`. **Aplicación:** categorías, alta y ficha de productos y las entradas con
  productos nuevos piden `inventario.catalogo` y no confirmar identidad; programar un precio y la carta siguen en
  `catalogo.modificar` con elevación. **Web:** una sección puede abrirse con varias acciones (`acciones`): Productos
  la ve quien da de alta, carga entradas o ajusta; Entradas, quien carga entradas (antes colgaba de «ajustar»); la
  ficha esconde el precio a quien no puede cambiarlo; Roles y accesos explica bajo «Modificar carta y tarifas» que no
  se regala y que el inventario se da con «Dar de alta y editar productos y categorías». Prueba de la web
  (`visibilidad.test.ts`, 11): cada sección pide lo que pide su servidor, y un permiso dado por rol o por persona la
  abre. Visto en el navegador en la base de pruebas: con supervisión dentro, se ajusta su rol con el mismo caso de
  uso que usa Roles y accesos (desde un guion, no desde un segundo equipo) y «Nuevo producto» aparece sin volver a
  entrar; al retirarlo, desaparece. Roles y accesos, en los dos temas.*
- [x] **T-14 · Mi PIN y el acceso con teclado** (M-27, P-13, P-17).
  → «Mi cuenta» cambia el PIN propio (el actual y el nuevo dos veces, con sus reglas y su bloqueo, auditado). En el
  acceso, con teclado físico, cada persona tiene su tecla, el PIN se escribe o se pega, Intro entra y Esc vuelve.
  *Hecho el 2026-10-07 (LuAMi), v0.69.0.* **Aplicación:** `sesiones.cambiarPin` (la persona sale de SU sesión): el PIN
  actual cuenta para el mismo bloqueo que el acceso (un error aquí es un intento más, y bloqueada no cambia ni entra);
  el nuevo pasa `checkNewPin` y no puede ser el actual; Argon2id, historial de la persona (`PIN`, «Cambió su PIN desde
  Mi cuenta») y `usuario.pin` en la auditoría, sin el PIN; 4 pruebas contra la base (`mi-pin.test-db.ts`). **Web:**
  tocar el propio nombre (pie del panel o barra de la estación) abre «Mi cuenta»: PIN actual, nuevo y repetido, con
  sus reglas a la vista. En el acceso, con teclado: cada persona lleva su tecla en una insignia sobre su inicial (1 a 9
  por orden; de la décima en adelante, su inicial; una inicial compartida enfoca la siguiente e Intro la abre); en el
  PIN, los números, Retroceso, Intro entra, Esc vuelve y pegar vale. Las teclas se ven donde hay puntero fino o en
  cuanto se pulsa una. Visto en el navegador en la base de pruebas, en los dos temas: con 2 y Esc vuelve; el PIN pegado
  y Intro entran; «Mi cuenta» cambia el PIN y lo devuelve; desde la barra de la caja a 1366 y 800 de ancho.*
- [x] **T-15 · La operación se lee de un vistazo** (M-27, P-7, P-8, P-9, P-10, P-12).
  → Paquetes de tiempo con icono y el nombre entero; el código de la pulsera se escribe a mano en la entrada, la sala,
  la salida, la caja y la tablet; «Por cobrar» con marquesina para los nombres largos; medios de pago con el icono
  arriba y el nombre debajo; la carta de la caja en $, en Bs o con los dos, recordado por equipo. Ningún texto
  cortado a 1366×768, 1280×800, 800×1280 ni a 390 px, en los dos temas.
  *Hecho el 2026-10-07 (LuAMi), v0.70.0.* **@l2/ui:** `Marquesina` (un renglón que no cabe se desliza hasta su final y
  vuelve, con pausa en cada extremo; mide con `ResizeObserver`; con movimiento reducido no se mueve y se parte en
  renglones), que también usa `StatusCard` en su título; `ScannerField` con «Escribir»: el código a mano pasa por el
  mismo camino que una lectura (misma validación, misma pantalla), y en una columna estrecha se queda en su icono;
  animaciones `l2-marquesina` y `l2-anillo` en los tokens, anuladas con movimiento reducido. **Web:** cada paquete
  lleva su reloj (un anillo que se llena según dura, lleno a las dos horas, con «30'», «1h», «2h» dentro; el pase libre,
  el infinito) que se dibuja al elegirlo, y el nombre entero; «Por cobrar», la cabecera de la cuenta, la factura y las
  tarjetas de la sala con marquesina; los medios con el icono arriba, el nombre debajo y la moneda debajo, y la letra
  del atajo en su esquina; la carta de la caja en «$», «Bs» o «$ · Bs», guardado en la cookie del equipo (`l2_precios`,
  como el tema: no es un dato del negocio); en «Bs» sin tasa se ve el precio en dólares. Visto en el navegador en la
  base de pruebas: la caja a 1366×768, 1280×800, 800×1280 y 390×844 en los dos temas, sin textos cortados ni
  desplazamiento; la entrada (con un código escrito a mano) y la sala a 800 y 390 en los dos temas; la vista de precios
  cambia al momento y sigue al recargar.*
- [x] **T-16 · Jerarquía tipográfica y ancho completo** (M-27, P-16, P-18).
  → La escala de texto (título de página, de sección y de tarjeta, subtítulo, cuerpo, etiqueta, cifra) y la de
  iconos por superficie, en tokens y con su porqué en el README de `@l2/ui`, aplicada a las cabeceras y piezas
  comunes; todas las secciones del panel con el ancho de Inicio.
  *Hecho el 2026-10-07 (LuAMi), v0.71.0.* **Tokens:** nueve escalones de texto con nombre de trabajo (`text-pagina` 28,
  `seccion` 18, `tarjeta` 16, `subtitulo` 15, `cuerpo` 14, `detalle` 13, `nota` 12, `etiqueta` 11 con su espaciado,
  `cifra` 24), al menos un 12 % entre uno y el siguiente; y la escala de iconos por superficie (`--icono-pos` 20,
  `tablet` 18, `admin` 16, `texto` 14, `etiqueta` 12), con `TAMANO_ICONO` en @l2/ui para el `size` de un icono. El
  porqué, en el README de @l2/ui. **Aplicada** a `PageHeader` (el título baja de 32 a 28 px), las capas (`Dialog`,
  `Sheet`, `Confirmacion`), `StatTile`, `StatusCard`, `EmptyState`, `Input` y la cabecera de Inicio. **Ancho:**
  `Container` `panel` pasa de 1180 a 1600 px, el de Inicio: al navegar el contenido ya no encoge ni deja márgenes
  vacíos. **De paso:** el pie de la barra lateral en dos renglones (la persona con todo el ancho, debajo ayuda, tema y
  salir): «Abi… Ad…» ya no se corta. Visto en el navegador en la base de pruebas: a 1920×1080 Inicio, Productos y
  Sucursal miden 1600 px y el título de página 28 px, en los dos temas; el pie a 1366, 1100 y 800 de ancho.*
- [x] **T-17 · Cuenta de soporte** (M-28).
  → Una persona de Administración con la marca «soporte» no sale en «¿Quién entra?»: entra por «Acceso de soporte»
  con su nombre de usuario y su PIN, desde su equipo aprobado (como todos), con el mismo bloqueo; sin plazo. No abre
  turnos ni cuenta como personal del local. Se ve como «Soporte» en Usuarios, en la auditoría y en Inicio mientras está
  conectada; administración la marca, la desactiva o le repone el PIN. Configuración, precios y personas siguen
  pidiendo contraseña y llave (F2-04). En producción no abre turnos ni cobra; en staging sí, para reproducir un error
  con una copia de la base restaurada del respaldo (M-29).
  *Hecho el 2026-10-08 (v0.81.0), en `feat/t-17`.*
  *· Base: `20261112000000_cuenta_de_soporte` (solo expande): `staff_user.support_login` (solo de Administración, en
  minúsculas y único en el tenant, por CHECK e índice) y los cambios `SOPORTE` y `SOPORTE_FIN` en `staff_user_change`.*
  *· Dominio (`revisarCambio`, sexta puerta): la marca la pone y la quita la administración, nadie sobre sí misma, solo a
  una persona de Administración activa; la cuenta de soporte no cuenta como administración del local (no se marca a la
  única que queda) y no se le cambia el rol con la marca puesta. 4 pruebas.*
  *· Contrato: `UsuarioDeSoporteSchema`, los comandos `SOPORTE` (con su usuario) y `SOPORTE_FIN`, `soporte` en el
  directorio y en las sesiones en curso.*
  *· Aplicación: `equipo.cambiar` marca y quita (usuario único, su asiento `usuario.soporte` y su historia);
  `sesiones.personas` no la lista; `sesiones.entrarSoporte` la busca por su usuario y entra por el mismo camino que todos
  (equipo aprobado, bloqueo, PIN temporal); un usuario que no existe responde como un PIN errado. Firma «(soporte)» en
  cada asiento y papel (`nombreDe`); la Puesta a punto no la cuenta. `turnos.abrir` y `cuentas.cobrar` la rechazan salvo
  con `soporteOpera`, que la web enciende fuera de producción (`L2_ENTORNO`). 7 pruebas contra la base.*
  *· Web: «Acceso de soporte» en el acceso (usuario y después el PIN, como todos); en Personas y equipos, «Cuenta de
  soporte» y «Quitar soporte» con su usuario, la insignia «Soporte · usuario» y la cifra de activas que la cuenta
  aparte; Inicio la enseña como «Soporte» mientras está conectada, sin ocupar el puesto de nadie. El manual del acceso,
  al día.*
  *· Decidido al construir: el usuario de soporte es un nombre aparte (no el de la persona), en minúsculas y sin espacios;
  firmar «Nombre (soporte)» es lo que hace que se vea en la auditoría, en los turnos y en los papeles. Desarrollo cuenta
  como staging (la cuenta opera).*
  *· Comprobado: en el navegador, contra la base de pruebas: alta de «Prueba T17 Soporte» (Administración), marcarla con
  «prueba.t17», que no salga en la lista del acceso, entrar por «Acceso de soporte» desde otro equipo con el PIN
  temporal y elegir el suyo, e Inicio con «Soporte»; a 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas, sin
  desbordes ni errores de consola.*
- [x] **T-18 · Ajustes unificados** (M-29).
  → **Personas y equipos** (usuarios y permisos, roles y accesos, dispositivos), **Tasas** con su pestaña de feriados,
  **Sistema** (versión y actualizaciones, respaldos, semilla) y la **carta dentro de Inventario → Productos** (pestaña
  «En la carta»: un solo sitio para el precio). Las rutas viejas llevan a las nuevas; el manual y los recorridos, al día.
  *Hecho el 2026-10-08 (v0.78.0), en `feat/t-18`.*
  *· Navegación: una sección puede tener pestañas (`Seccion.pestanas`, cada una con su permiso; la sección se ve con
  cualquiera de ellos). Ajustes pasa de 18 secciones a 12; Productos gana «En la carta» (y `catalogo.modificar` la
  deja ver). La pestaña va en la dirección (`?pestana=…`, `rutaPestana`, `pestanaPedida`): se enlaza, se recarga y el
  servidor lee solo lo de la pestaña abierta. Las siete rutas viejas (`ajustes/usuarios`, `accesos`, `dispositivos`,
  `feriados`, `respaldos`, `semilla` y `carta`) y las que ya apuntaban a ellas llevan a su pestaña.*
  *· Web: `MarcoDeSeccion` pone las migas, el nombre de la sección y sus pestañas (las que el permiso alcanza; si la
  pedida no, va a la primera que sí) y `EncabezadoDePagina` deja en cada pantalla su descripción y sus acciones; las
  diez pantallas no cambian por dentro. Inicio, la Puesta a punto, «En vivo», los textos que nombraban las secciones
  viejas y el manual (Ajustes en 12 secciones, la carta en Productos y la entrada nueva de Reportes), al día. Los
  recorridos guiados son de las estaciones: ninguno nombraba estas secciones.*
  *· Comprobado: 14 pruebas de visibilidad (3 nuevas: cada pestaña deja ver su sección, supervisión ve Tasas sin los
  feriados, Ajustes en 12 y las rutas viejas). En el navegador, contra la base de pruebas: las 12 secciones, las siete
  rutas viejas en su pestaña, las pestañas de Personas y equipos, Sistema y Tasas con la identidad confirmada, la carta
  dentro de Productos y supervisión con solo «Tasas»; a 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas, sin
  desbordes ni errores de consola.*

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
- [x] **B0-4 · CI en GitHub Actions** con `pnpm verify` y un lint que sí haga algo: `toFixed` fuera de
  `@l2/ui`, colores literales y `parseFloat` sobre dinero (F1-14).
  → Un PR con una violación sale en rojo.
  *Hecho en local el 2026-09-26: `.github/workflows/ci.yml` (acciones fijadas por hash, Node 24,
  mismo `docker-compose.yml`, `pnpm verify:db`) y `pnpm lint` con 5 reglas y 9 pruebas que demuestran
  que muerden: `toFixed` fuera de `@l2/ui`, `parseFloat`, colores literales, reloj en el dominio y
  emojis en pantalla. Excepciones solo con `lint-permitido: <regla> — <motivo>`. **Visto en verde en
  GitHub el 2026-09-26** (primer push, `verify:db` completo con la base en el runner). **Visto en rojo el
  2026-10-06** con el PR #6, una violación a propósito de `sin-simulacion` en una rama de prueba que no se fusionó
  (T-2).*
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

- [x] **B2-5 · Precios con el IVA incluido** (M-19).
  → Con el ajuste de la sucursal «Precios: IVA incluido», lo que dice el menú es lo que paga el cliente: el total es
  la suma de los precios (menos el descuento) al céntimo, con cualquier combinación de platos, y el IVA se saca de
  dentro por alícuota. Apagado de fábrica; no se cambia con turnos abiertos.
  *Hecho el 2026-10-05 (v0.50.0): `computeDocument` con `pricesIncludeTax` (base = suma × 100 / (100 + alícuota), IVA =
  la diferencia; `taxIncluded` en el resultado; 6 pruebas), `preciosConIva` en los ajustes (de fábrica, apagado) y
  `ivaIncluido` en la venta; el cobro, los pendientes, la incobrable, la caja, el recibo y el ticket lo usan. Ajustes
  → Sucursal: «IVA incluido | IVA aparte». 5 pruebas contra la base (tres alitas de $ 6,00 = $ 18,00, con $ 2,48 de IVA
  dentro).*

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

- [x] **B3-6 · Descuentos configurables** (M-15, V-9; `cuenta.descuento`, que ya estaba en la matriz).
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
  *Hecho el 2026-10-01 (v0.38.0), en `feat/b3-6`. Decisiones del paso, a confirmar con el cliente: el VIP **no pide
  PIN** (la marca de administración lo ampara; la matriz dice 🔐 para la caja); una familia VIP lo es por **una regla
  VIP** (así «su porcentaje» tiene alcance y vigencia); el descuento **se pone a la cuenta antes de cobrar** y el cobro
  lo consume (anular el cobro no lo devuelve: la cuenta vuelve a deberse entera); una cuenta **dividida no lleva
  descuento**; el **«de administración»** lo puede pedir la caja, pero solo lo autoriza administración; y el tope se
  mide sobre lo que se cobra antes del IVA.*
  *· Dominio: `@l2/domain-tax` admite un descuento con alcance (`lineIds`: porcentaje sobre sus líneas, monto sin
  pasar de ellas, prorrateo solo entre ellas). `@l2/domain-cash` (`descuento.ts`): `scopeLineIds`,
  `discountAmount`, `documentDiscountsOf`, `discountCandidates` (el mayor primero; el VIP solo a su familia),
  `applyDiscountProblem`, `exceedsSupervisionCap`/`needsAdministration`, `discountAtChargeProblem` y `withDiscount`;
  `markPaid` lo consume y `accountChangeProblem` rechaza ponerlo, quitarlo o dividir desde un «guardar». 18 pruebas.*
  *· Contrato (`descuentos.ts`): reglas, mando de crear y retirar, marca VIP, `DescuentoAplicadoSchema` en la cuenta,
  `AplicarDescuentoCommandSchema`, `DescuentosDeCuentaSchema` y el descuento de la venta; el recibo lleva su línea y
  los ajustes, `topeDescuentoSupervision` (2000 de fábrica). Tema en vivo nuevo: `descuentos`. 7 pruebas.*
  *· Base: `20261019000000_descuentos`: `discount_rule` (CHECKs de valor, alcance, medio y vigencia; se retira una
  vez, no se borra ni se reescribe) y `guardian_vip` (solo-agregar; solo una regla VIP vigente), las dos con RLS; la
  versión de una cuenta admite la causa DESCUENTO.*
  *· Aplicación: `caja/descuentos.ts` (`leer`, `crear`, `retirar` y `marcarVip` con `catalogo.modificar` y
  elevación; `deCuenta`; `aplicar` con `cuenta.descuento`: la regla rige hoy en el local, el VIP es el de esa familia,
  lo de administración lo autoriza administración —comprobado antes del PIN— y la 🔐 queda antes de tocar la cuenta;
  quitarlo no pide PIN). `cuentas.cobrar` calcula con el descuento, exige su medio, su regla vigente y el tope, y lo
  deja en la venta y en la auditoría; `cortes` lo pone en las excepciones del turno y del día; el directorio lleva la
  marca VIP. Auditoría `cuenta.descuento`, `cuenta.quitar_descuento`, `descuento.crear`, `descuento.retirar` y
  `familia.vip`, con su fila en `TEMAS_DE_ACCION`. 11 pruebas contra la base (incluido otro local y el mesero).*
  *· Web: Ajustes → Descuentos (alta con su formulario, vigentes y retirados, tope de supervisión), la marca VIP en
  Parque → Representantes, y en la caja la fila «Descuento» con «Aplicar» o «Quitar», el diálogo que propone el mayor
  (con motivo y quién autoriza; solo administración si pasa del tope) y la caja que se pone sola en el medio del
  descuento y avisa si un pago va por otro. Con el IGTF al 0 % ya no salen «+0 % IGTF» ni «+ IGTF $ 0,00» (V-13).*
  *· Comprobado en el navegador (Playwright, base local, datos «Prueba B36 …»): alta de tres reglas (con sus errores
  de formulario), marca VIP en el directorio, el diálogo con los tres candidatos ordenados (VIP sin PIN; el manual de
  25 % solo con administración en la lista), cobro con VIP, cambio de un manual por el de efectivo con Luis Guerrero,
  un pago en bolívares rechazado por la caja y el cobro en dólares, uno de administración con PIN malo rechazado, el
  recibo con su línea, las dos excepciones en el turno y en Inicio, y retirar las reglas. Ajustes → Descuentos, el
  diálogo y la caja a 1366×768, 1280×800 y 800×1280 sin desplazar el documento (el PIN a la vista); sin errores de
  consola.*
- [x] **B3-7 · Carga de lo anotado en papel** (M-15, V-12; JORNADA §4 y §7).
  → Tras un corte de los dos enlaces (ADR-021, N2), la cajera carga en su turno las entradas y los
  cobros anotados, cada uno marcado «desde papel» con la hora real que se anotó: la única hora que
  declara la pantalla, acotada a la ventana del corte y auditada (excepción explícita a ADR-017, con su
  ADR al construirla); el servidor guarda además cuándo se cargó. Los formularios salen impresos de la
  app. Los pendientes del cierre listan lo cargado sin revisar y supervisión lo revisa antes del Z.
  → Lo cargado desde papel se distingue en el turno, en Inicio y en la auditoría; ninguna jornada se
  cierra con cargas sin revisar.
  *Hecho el 2026-10-05 (v0.49.0, [ADR-027](adr/027-hora-real-de-lo-anotado-en-papel.md)), en `feat/b6-3`:*
  *· Decisión: la hora real de un registro cargado desde papel es la única hora que declara una pantalla; el servidor la
  acepta solo dentro de la **ventana del corte** de una carga abierta (desde < hasta, hasta no después de ahora, a lo
  sumo 24 h, y no más de 24 h antes de abrirse el turno), la comprueba en el dominio, en la transacción y con un
  disparador, y guarda además cuándo se cargó. Un registro es la operación de siempre con `ahora` igual a esa hora
  (así salen el tiempo, la tasa, el IVA, el precio y la existencia de entonces); `ahora` no viaja desde la web.*
  *· Dominio: `@l2/domain-cash` (`papel.ts`): `ventanaProblem`, `horaRealProblem` y los estados de una carga (`ABIERTA →
  CERRADA → REVISADA`, o `DESCARTADA` si no cargó nada; `bloqueaElCierre`, `sePuedeRevisar`, `estadoAlTerminar`);
  `@l2/domain-rates`: `localDateTimeOf` e `instantOfLocalDateTime` (la hora del reloj del local ↔ instante). 12 + 4
  pruebas. Permiso nuevo `papel.revisar` (supervisión y administración) y la superficie `papel`.*
  *· Contrato (`papel.ts`): `DesdePapel` (carga + hora real, lo único que declara la pantalla), abrir, terminar y revisar la
  carga, y la carga con sus registros (entrada, salida, cobro). `VentaCerrada.desdePapel`, `ventas.desdePapel` en el
  corte y el resumen, `papel` en los pendientes del cierre, `papelPorRevisar` en el resumen del día, la excepción
  `PAPEL` y el tema en vivo `papel`.*
  *· Base: `20261029000000_carga_desde_papel`: `paper_load` (con su ventana; avanza solo, sin borrar; una abierta por turno;
  disparadores) y `paper_load_item` (solo-agregar; el disparador exige carga abierta, hora dentro de la ventana y cuenta
  de la sucursal), las dos con RLS. 11 pruebas.*
  *· Aplicación: `caja/papel.ts` (`leer`, `abrir`, `terminar`, `revisar` con el PIN propio y sin revisar lo propio, y
  `entrar`, `salir`, `guardar` y `cobrar` desde papel) y `caja/papel-en.ts` (la puerta que comparten, dentro de la
  transacción). `parque.entrar`/`salir` y `cuentas.guardar`/`cobrar` aceptan lo anotado (sin contar el aforo; `guardar`
  solo ventas de mostrador); el corte Z se niega con cargas sin revisar del turno, y los pendientes del cierre, el
  resumen y las excepciones las cuentan. Auditoría `papel.abrir`, `papel.cerrar` y `papel.revisar`, y las demás con su
  `desdePapel`. 34 pruebas contra la base (otro local, la monitora, la hora fuera del corte, la tasa de esa hora, el
  Z, el doble clic).*
  *· Web: Caja → Papel (`/papel`): abrir la carga, registrar entradas y salidas en hojas laterales, «Cobrar lo anotado»
  (la misma caja en modo papel: cinta con la hora real, reloj fijo en esa hora, sin caer al cobro de ahora), terminar, y
  «Por revisar» para supervisión con su PIN. `/formularios-papel`: las dos hojas A4. «Desde papel» en las ventas del
  turno, el aviso y la cifra en Inicio y los pendientes del cierre.*
  *· Comprobado en el navegador (Playwright, base de pruebas, datos «Prueba …»): carga con corte de 3:00 a 4:30 pm, entrada
  a las 3:10, salida a las 3:50, cobro a las 3:12 y venta de mostrador a las 3:30; hora fuera del corte y sin hora
  rechazadas; la revisión con PIN; las hojas en pantalla y en PDF (2 páginas); a 1366×768, 1280×800 y 800×1280 sin
  desplazar el documento y sin errores de consola. `pnpm verify:db` en verde.*

- [x] **B3-8 · Cobrar con el teclado y el recibo a elección** (M-27, P-5, P-11).
  → Una cuenta se cobra de punta a punta sin el ratón: buscarla o leer su pulsera, el medio por su letra (los números
  son del monto), el monto, el recibo y confirmar, con los atajos a la vista. El interruptor «Imprimir recibo» arranca
  con el ajuste de la sucursal (de fábrica, imprimir); lo que no se imprimió se saca después desde Ventas. Medido con
  Playwright solo con el teclado.
  *Hecho el 2026-10-07 (LuAMi), v0.68.0.* **Antes:** el cobro nunca imprimía solo: el recibo salía si la caja abría
  «Ver recibo» y pulsaba «Imprimir». La mayor parte del camino con teclado ya existía (C5): faltaban el recibo, ver
  las letras de los medios y elegir con Intro en la búsqueda cuando hay más de un resultado. **Contratos:**
  `imprimirRecibo` en el cobro (sin decirlo, no imprime: lo de antes) y en los ajustes (`true` de fábrica; los
  publicados antes no lo traen: imprimir); `reciboNoImpreso` en la respuesta. **Aplicación:** el cobro que lo pide
  imprime en su misma transacción (`imprimirVentaEn`, la misma de «Imprimir» de Ventas: original, impresión anotada y
  su asiento); el doble clic no imprime dos veces; sin impresora de recibos el cobro se cierra igual y dice por qué no
  salió (un recibo no detiene un cobro); desde papel no se imprime. 2 pruebas contra la base. **Web:** un interruptor
  «Recibo / Sin recibo» con icono junto a «Cerrar cobro», con la tecla `*` (y en la chuleta), que arranca con el
  ajuste (apagado al cargar desde papel); la letra de cada medio en su botón; Intro en la búsqueda elige la primera
  cuenta encontrada; si el recibo no salió, un aviso con «Ver recibo»; Ajustes → Sucursal, «Recibo al cobrar: Se
  imprime / A pedido». Visto en el navegador en la base de pruebas, solo con el teclado tras entrar: `/`, «B67»,
  Intro, `E`, 5-0-0, Intro, `*` dos veces, Ctrl+Intro: cobrada en 6 s con el recibo a la impresora; una venta
  directa (N, Tab hasta el producto, Intro) cobrada «Sin recibo» y después en Ventas del turno con «Imprimir»; a
  1366×768 y 1280×800, en los dos temas, sin desplazamiento. De paso: la prueba de la instalación que buscaba el PIN
  «4826» suelto fallaba por azar cuando salía dentro de un UUID o un hash; ahora lo busca como valor.*
- [x] **B3-9 · El punto de cobro y la entrada desde la caja** (M-31; una sola tarea, de punta a punta).
  → **El punto de cobro.** Cada equipo lleva la marca «Punto de cobro» en Ajustes → Personas y equipos → Dispositivos (administración, con la
  identidad confirmada). En un equipo marcado, el turno se abre como hoy. En uno sin marcar, abrir turno pide el PIN de
  administración y un motivo («La laptop de caja no enciende»), queda en la auditoría e Inicio avisa «Turno abierto fuera
  del punto de cobro» mientras siga abierto. Al actualizar, los equipos que ya abrieron turno quedan marcados (ninguna
  caja se bloquea ese día) y la Puesta a punto pide uno si no hay ninguno. Un equipo, un turno (I-06) sigue igual, y el
  relevo, en el mismo equipo. La migración solo expande.
  Se adapta a lo que hay (punto 10 de la definición de hecho): el manual de Turno y de Dispositivos dice qué es el punto
  de cobro y qué hacer si la laptop falla; el aviso de Inicio, en vivo (tema `turno`); Reportes → Ventas marca el turno
  abierto fuera del punto de cobro; la auditoría dice quién autorizó; la cuenta de soporte pasa por la misma regla (y en
  producción sigue sin abrir turnos); la marca vive en la pestaña Dispositivos con su permiso.
  → **La entrada desde la caja.** En la caja, una pulsera que no está en la sala (o el botón «Entrada», con su tecla)
  abre un panel lateral sin salir de ella: cada pulsera leída suma un niño; si no se lee, se teclea su número; «Sin
  pulsera», con el nombre obligatorio. El paquete más común ya elegido, las medias si el local las vende y el teléfono
  del representante (la familia conocida se completa sola, DEC-27). «Registrar y cobrar» deja la cuenta elegida en la
  columna de cobro. El mismo registro del servidor que Entrada (aforo, pulsera de un solo uso, tarifario; la monitora los
  ve en la sala), sin migración. Solo prepago: los invitados de un cumpleaños, la cuenta abierta y la carga desde papel
  siguen en Entrada. La lógica de Entrada se separa en piezas que usan las dos pantallas: Entrada se ve y funciona igual
  (dos niños en menos de 90 s) y la caja no desplaza a 1366×768.
  Se adapta a lo que hay: el manual de la caja y su recorrido guiado suman la entrada desde la caja, y su tecla sale en
  la ayuda de atajos; el teléfono del representante lleva `data-privado`; un rechazo (aforo, pulsera usada, sin turno)
  se dice en el panel, con su aviso; la sala y la cola de la caja se releen solas; la cuenta de soporte en producción no
  cobra, tampoco desde aquí; registrar pide `parque.checkIn` y cobrar, el permiso de cobro.
  *Hecho el 2026-10-08 (v0.85.0), en `feat/b3-9`.*
  *· Base: `20261113000000_punto_de_cobro` (solo expande): `device.cash_point` y, en `cash_shift`, quién autorizó abrir
  fuera del punto, su nombre y el motivo (los tres o ninguno; el disparador de «solo avanza» tampoco deja reescribirlos).
  Al migrar, cada equipo que ya abrió un turno queda como punto de cobro (en la base de pruebas, los cinco que cobraban).*
  *· Dominio: la acción `turno.abrirFueraDelPunto` (administración ✅; supervisión y caja 🔐) y
  `SOLO_AUTORIZA_QUIEN_LO_TIENE`: la autoriza quien la tiene permitida, no supervisión (se pregunta por el permiso, no por
  el rol). Su fila en la matriz del plan, con su decisión.*
  *· Contrato: la marca `puntoDeCobro` del equipo y su orden `PUNTO_DE_COBRO`; `fueraDelPunto` en el turno y en el
  informe de ventas; `puntoDeCobro` (este equipo y cuáles lo son) en la comprobación de apertura; el punto
  `punto_de_cobro` de la Puesta a punto.*
  *· Aplicación: `turnos.abrir(ctx, entrada, autorizacion?, ahora?)`: fuera del punto, sin autorización se niega; con
  ella, `exigirPermisoOAutorizacion` con el PIN (administración confirma con el suyo) y el turno guarda quién y por qué,
  en su asiento (`authorizedBy`, `reason`). La cuenta de soporte en producción tampoco lo autoriza ni sale en la lista.
  `dispositivos.ordenar` marca y quita (`usuarios.gestionar` con la identidad confirmada; asiento
  `dispositivo.punto_de_cobro`, tema `equipos` y `turno`; en la auditoría y no en la historia del equipo, que una
  versión anterior no sabría leer). 9 pruebas contra la base; la preparación de las demás marca sus equipos aprobados.*
  *· Web: la apertura fuera del punto (aviso con cuál lo es, motivo y «Quién autoriza» con su PIN); «Fuera del punto de
  cobro» en la cabecera del turno, en Inicio (en vivo) y en Reportes → Ventas → Turnos; la marca y su botón en
  Dispositivos. La entrada: `useEntradaDeNinos` y `EntradaPiezas` (la lógica y las piezas de Entrada, que ahora las usa
  también la caja) y `EntradaDesdeCaja`, el panel lateral: «Entrada» (tecla A) o una pulsera que no está en la sala;
  «Registrar y cobrar» deja la cuenta elegida. Sin turno, el panel lo dice y no registra; en papel no se ofrece. El
  teléfono del representante lleva `data-privado` en las dos pantallas.*
  *· Ayuda: el manual de Turno, Cobrar, Inicio, Reportes y una entrada nueva de Personas y equipos; el recorrido de la
  caja pasa a la versión 2 con «Niños que llegan a la caja»; la tecla A en la ayuda de atajos.*
  *· Comprobado en el navegador, en la base de pruebas: en una tablet sin marca («Prueba B39 Tablet»), la apertura pide
  motivo y autorización, rechaza un PIN malo y abre con el de administración; Inicio avisa, Reportes lo marca;
  marcar y quitar el punto en Dispositivos. En la caja: la tecla A, dos pulseras, un niño sin pulsera y una familia
  nueva, registrado y cobrado con el teclado; una pulsera nueva leída en la cola abre el panel con ella; una que está en
  la sala se rechaza en el panel. Entrada igual: dos niños hasta la caja en 3,4 s. A 1366×768, 1280×800, 800×1280 y
  390 px, en los dos temas: la caja no desplaza y sin errores de consola.*
- [x] **B3-10 · La caja más clara: buscar en la carta y el pie compacto** (M-32).
  *Hecho el 2026-10-08, en `feat/b3-10`.*
  → **La carta de mostrador** (venta directa y «Añadir ítems» de una cuenta). Un buscador arriba filtra al teclear en
  toda la carta, por nombre, SKU o código de barras, sin importar la categoría abierta; con la búsqueda vacía vuelve la
  categoría que estaba e Intro añade el primero que aparece. La tecla «/» busca en lo que está a la vista: la carta si
  está abierta, la cola si no. Los productos que se pueden vender van primero; debajo, un título «No se venden ahora · N»
  y los sin contar y agotados, atenuados y cada uno con su motivo. Los botones de categoría, de 44 px (M-32, excepción a
  los 56 del POS). La rejilla desplaza dentro de su tarjeta: con 200
  productos la página no desplaza a 1366×768 ni a 1280×800, y en 800×1280 y 390 px la carta no empuja la cuenta fuera
  de su sitio.
  → **El pie de la cuenta.** «Factura a», «Descuento» y «Dividir» son una fila de tres botones que dicen su estado
  («Consumidor final» o el nombre, «−10 %», «Entre 3»); dividir abre un menú de 2 a 6 con «Sin dividir». Subtotal e
  impuestos (IVA por tasa e IGTF) en un renglón chico; el total, grande. Las reglas no cambian: con pagos no se divide ni
  se descuenta, y dividida dice «Parte x de y». Con una cuenta de 8 ítems, a 1366×768 se ven todos sin desplazar.
  → **El botón de cobro** dice «Cobrar $ 13.00», con el monto que se cobra (el de la parte, si está dividida);
  «Cobrando…» mientras va; Ctrl+Intro, igual.
  Se adapta a lo que hay (punto 10 de la definición de hecho): el manual de Cobrar con el buscador y el pie nuevo, el
  recorrido de la caja si cambian sus puntos, la ayuda de atajos con la «/» de la carta; los dos temas, la escala y
  56 px en el POS. Solo web: sin contrato, caso de uso ni migración.
  *· Carta (`CartaMostrador`): el buscador busca por nombre y categoría, cada palabra en cualquier sitio y sin tildes, y
  por SKU o código de barras desde su comienzo (un «155» no trae el SKU «PRU-0155»). Intro con un producto que no se
  vende dice por qué (el mismo aviso del lector, `avisarNoSeVende`); el Intro del lector de códigos sigue siendo suyo.
  Si la venta directa nace del buscador, su cuenta abre la carta con el cursor en el buscador. Con una cuenta abierta,
  la carta ocupa como mucho el 55 % de la tarjeta y los ítems, al menos 7,5 rem; en la venta directa, todo su alto (en el
  teléfono, el 70 % de la pantalla). Las filas de la rejilla miden lo que su tarjeta (`auto-rows-min`), y las columnas
  salen del ancho de la carta (`@container/carta`): dos si es angosta, tres desde 32 rem; antes, en la tablet, «Quedan N»
  se salía de la tarjeta.*
  *· Pie: `BotonDelPie` (etiqueta, estado y su tecla, que en una cuenta angosta se oculta); dividir y el descuento
  puesto se abren debajo de la fila. Los bloqueos dicen su porqué en el botón. El botón de cobro pasa el monto a otro
  renglón si no cabe («$ 1,234.56» en la columna angosta). Manual de Cobrar con dos problemas nuevos, recorrido de la
  caja v3 con el paso del pie, atajos con la «/» de la carta.*
  *· Comprobado en el navegador, en la base de pruebas, con 206 productos (180 «Prueba B310» por alta en lote, 30 con
  inventario inicial): la venta directa no desplaza la página y su rejilla desplaza por dentro; «/» va a la carta y, con
  ella cerrada, a la cola; buscar en una categoría pasa a «Todos» y al borrar vuelve; Intro sobre uno sin contar lo
  avisa; Intro «agua» crea la venta con el cursor en el buscador y «cafe con» (sin tilde) añade el segundo; ocho ítems
  con la carta cerrada se ven enteros a 1366×768; entre 3 dice «Parte 1 de 3» y bloquea el descuento con su motivo;
  cobrada con el teclado ($ 50 en efectivo, Ctrl+Intro). A 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas, sin
  desplazar la página (en el teléfono, sin desplazar a lo ancho), sin textos cortados ni que se salgan de su tarjeta y sin
  errores de consola.*

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
- [x] **B4-4 · Ajustes de la sucursal** persistidos: formato de hora, umbral de residuo, servicio y
  umbral de diferencia del arqueo ($ 1,00 o su equivalente, M-13) (F5-08b).
  *Hecho el 2026-09-30 (v0.31.0). Con lo que pedía el handoff: nombre, RIF, dirección, teléfono, horario, zona
  horaria y horas de una huérfana, hasta ahora en el código o en el navegador.*
  *· Base: `20261012000000_ajustes_de_la_sucursal`: `branch_settings_version` (versiones de solo-agregar como el
  tarifario, contenido revalidado con el contrato al leer, autor completo o ninguno, RLS). Y
  `…010000_umbral_del_arqueo_en_el_conteo`: el conteo guarda con qué umbral se decidió quién firma, y un CHECK
  impide asentar otra firma (los anteriores, en nulo, se decidieron con $ 1,00). 1 prueba nueva.*
  *· Contrato: `AjustesSucursalSchema` sin la sucursal (la pone el servidor), RIF, dirección, teléfono y horario
  que pueden faltar («sin declarar», F0-04: no se inventan), zona IANA que el motor conoce, residuo hasta $ 1,00,
  umbral del arqueo de $ 0,00 a $ 20,00 y huérfana de 2 a 16 horas; `AjustesPublicadosSchema` y
  `PublicarAjustesCommandSchema` con `versionBase`. El recibo lleva `local`. Tema `sucursal`.*
  *· Dominio: `orphanAfterMs`, `isOrphan` con las horas como argumento y `becomesOrphanAt` (el instante en que
  pasa a huérfana, por umbral o por cambio de día); `zSigner` sin umbral por defecto. Fuera `ORPHAN_AFTER_MS`,
  `COUNT_THRESHOLD`, `MAX_RESIDUO` y `ZONA_DEL_LOCAL`.*
  *· Aplicación `sucursal/ajustes.ts`: `leer` (sin persona: el acceso enseña la hora) y `publicar`
  (`catalogo.modificar` con elevación, CONFLICTO si otra versión llegó antes, la zona no cambia con un turno
  abierto ni niños en sala, auditado `sucursal.ajustar` con lo de antes y lo de después). Sin versión, los
  valores de fábrica con el nombre del local. `ajustesDe`/`zonaDe` dentro de la transacción de quien los usa:
  cobro (residuo y tasa del día), arqueo (umbral), turno (día de negocio), sala, entrada, salida, recarga y
  cierre de huérfanas, tasas, impuestos, catálogo e Inicio. 15 pruebas nuevas (13 de ajustes y 2 de umbrales en
  la caja: el arqueo firma con el del local y lo guarda; el residuo del cobro es el del local).*
  *· Web: `ajustes.servidor.ts` y `ajustes.acciones.ts`; `SucursalProvider` adopta la versión del layout (el tema
  `sucursal` lo repinta en vivo) y publica con elevación; `useReloj`/`useHora` pintan toda hora y fecha con el
  formato y la zona del local (`formatClock` ya no tiene valor por defecto ni usa la zona del navegador). La sala
  programa una relectura para el instante en que la primera estancia pasa a huérfana. Editor nuevo en tres
  tarjetas (el local, horario, cómo opera). Se borra `src/demo/sucursal.ts` y su `sessionStorage`.*
  *· Comprobado con Playwright: la pantalla a 1366×768, 1280×800 y 800×1280 sin desplazar el documento (en
  escritorio tampoco el contenido, con el horario declarado); un residuo de $ 1,50 se marca en su campo; cambiar
  la zona pide la identidad y se niega por el turno abierto del cliente; publicar 24 h llega al Inicio de otro
  equipo a los 868 ms del clic y se vuelve a 12 h; catorce pantallas y el acceso abren sin errores de consola. El
  recibo con el nombre y el RIF no se vio en el navegador (no se cobró nada en la base del cliente); lo cubre el
  tipado. El paso a huérfana en vivo lo cubren las pruebas (esperar horas no cabe en un guion).*
- [x] **B4-5 · La monitora en el teléfono y las pulseras de un solo uso** (M-15, V-1 y V-2).
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
  *Hecho el 2026-09-30 (v0.32.0); se cierra la Etapa 4. `verify:db` en verde (77 de base, 304 de aplicación).*
  *· Base: `20261013000000_pulsera_de_un_solo_uso`: índice único (tenant, sucursal, código) sobre TODAS las
  estancias; se retira el parcial de las activas. Aplicada a la base del cliente (no tenía repetidas).*
  *· Contrato: `FormatoPulserasSchema` (prefijo y longitud, `null` hasta el primer lote) dentro de los ajustes, con
  valor por defecto para las versiones publicadas antes; `ConsultarPulseraSchema` y `EstadoPulseraSchema`.*
  *· Dominio: `wristbandSeriesProblem` (PREFIJO o LONGITUD; sin serie, vale todo).*
  *· Aplicación: la entrada rechaza PULSERA_USADA y PULSERA_FUERA_DE_SERIE (la entrada entera, nada a medias);
  `parque.pulsera` dice LIBRE, ACTIVA, USADA o FUERA_DE_SERIE. Pruebas: la usada ayer no entra hoy, la serie, la
  consulta y sus permisos; las dos que decían «al salir el código se libera», al día.*
  *· Web: `leerCodigo` en `@l2/ui` (la cámara entra por el mismo bus que el lector de teclado);
  `features/lector/` con `decodificador.ts` (`BarcodeDetector` nativo o @zxing/library 0.23.0 de respaldo, JS
  puro, cargado solo si hace falta) y `LectorCamara`/`BotonCamara` en entrada, salida y sala. La entrada pregunta
  al servidor por cada pulsera al pasarla y quita la fila si no sirve. En el teléfono: estación fija a la ventana,
  entrada y salida en dos pasos con «← Pulseras» fuera de lo que desplaza, paquetes de la fila en 2×2 y la sala en
  baldosas de un renglón (`useMediaQuery` nuevo en `@l2/ui`), «Cumplido» en vez de «Tiempo cumplido».
  `interactive-widget=resizes-content`; «Turno sin abrir» solo a quien abre turno; la sala se bloquea por
  inactividad (fuera la pantalla de pared, DEC-18). Ajustes → Sucursal gana la tarjeta «Pulseras» (prefijo en
  mayúsculas, longitud y qué entra, con un código de ejemplo). La tarjeta de un niño sin nombre dice «Falta
  nombre» en vez de repetir la pulsera (deuda de §5).*
  *· Comprobado con Playwright, con una cámara falsa (vídeo Y4M con Code 39, `code39.py`): a 360×800 y a 390×844 la
  cámara (lector de respaldo) leyó dos pulseras en 2,4 s y la entrada de dos niños quedó registrada a los 4,2 s del
  primer toque; sala, ficha, salida y liquidación sin desplazar el documento ni errores de consola. Con la serie
  «PB45-» de 9 publicada, «ZZ-998877» se rechazó al pasarla («no es de la serie del local: las pulseras empiezan por
  PB45- y tienen 9 caracteres») y la serie se devolvió a sin fijar. Entrada (con dos filas), sala (con un niño con
  nombre y otro sin él), salida, liquidación y Ajustes → Sucursal a 1366×768, 1280×800 y 800×1280 sin desplazar el
  documento; en escritorio Sucursal tampoco el contenido (a 800×1280 desplaza su zona, una columna).*
  *Trabajo de campo (§4): la cámara nativa y los 90 s en el teléfono real, con HTTPS (staging), y la serie con el
  primer lote.*
- [x] **B4-6 · Salir antes de tiempo** (M-18). En **cuenta abierta**, la salida cobra el paquete más barato del
  tarifario que cubre el tiempo real (con la gracia), no el que se eligió en la entrada; si se pasó del elegido, se
  cobra como hoy (paquete y tiempo de más). El desglose lo dice («Elegido: 1 hora · Usado: 28 min · Se cobra: 30
  minutos»). En **prepago** no se devuelve nada, y la entrada lo avisa antes de cobrar.
  → Una familia en cuenta abierta paga lo que usó, y el recibo explica por qué.
  *Hecho el 2026-10-03 (v0.46.0). Decidido con el cliente: el pase libre también se cobra por uso; el paquete y sus
  recargas se cambian juntos por el más barato que cubre; si el niño está vinculado a una mesa, se ajusta en la cuenta
  de la mesa. **Dominio:** `paquetePorUso` (parque, 5 pruebas); `chargeByUsage` y `packagesOwed` con la marca `porUso`
  en la línea (caja, 3 pruebas): lo cambiado no se cobra, no se regala, no se mueve y no lo toca un «guardar».
  **Contratos:** `AccountLine.porUso`, `Estancia.porUso` (los paquetes del tarifario con que entró),
  `SettlementLine.porUso`. **Aplicación:** `salir()` en `park/parque.ts` asienta la línea `uso-<estancia>` en la
  cuenta de la familia o en la de la mesa vinculada; el desglose solo dice «por uso» si quedó asentado, y el reintento
  (`salidaHecha` → `porUsoAsentado`) devuelve el mismo. Pruebas en `parque.test-db.ts` (7: abierta 25 min → 30
  minutos, pase libre → 1 hora, gracia, prepago y tiempo de más sin ajuste, recarga → 2 horas, vinculado → mesa).
  **Web:** aviso en la entrada; la salida dice el paquete elegido (con sus recargas) tachado y el que se cobra; la caja
  pinta lo «cambiado por uso» tachado (`agruparFilas`). Navegador en la base de pruebas a 1366×768, 1280×800 y
  800×1280. El caso de la mesa se comprobó contra la base, no en el navegador.*

- [x] **B4-7 · Pausa por comida** (M-27, P-14).
  → La monitora pausa el reloj de un niño una vez por visita; a los 10 minutos (ajuste de la sucursal) vuelve a
  correr solo, o antes si ella lo reanuda. Una segunda pausa la niega el servidor; la salida y el tiempo de más
  cuentan sin la pausa; la sala enseña «En pausa» con lo que le queda. Solo-agregar.
  *Hecho el 2026-10-07 (LuAMi), v0.62.0.* **Dominio:** la estancia lleva `pause` (inicio, fin a mano o nulo, máximo);
  `pausedMs` y `pauseEndsAt` (lo que llegue antes: el fin a mano o el máximo); `computeSessionView` descuenta la pausa
  del tiempo en sala (también en tiempo abierto) y dice `paused` y `pauseRemainingMs`; `pauseProblem` (una por visita) y
  `resumeProblem` (sin pausa, o ya terminó); 7 pruebas. **Contratos:** `PausaSchema` en la estancia, `PausaCommandSchema`
  (PAUSAR o REANUDAR) y el ajuste `pausaMaximaMin` (1 a 30, 10 de fábrica; los ajustes de antes lo toman así). **Base:**
  `park_session_pause` (migración `20261105000000_pausa_por_comida`, solo expande): PAUSA con su máximo y REANUDA, una de
  cada por estancia por índice único (dos equipos a la vez dejan una), solo-agregar, RLS, y un disparador que solo deja
  pausar una estancia activa y reanudar una pausa que existe. **Aplicación:** `casosParque.pausa` con `parque.checkIn`,
  reintento por clave, auditado (`parque.pausar`/`parque.reanudar`, tema `sala`); la sala y la salida (tiempo de más y
  paquete por uso) miden sin la pausa; 12 pruebas contra la base. **Web:** «Pausa por comida» en la ficha del niño y
  «Terminar la pausa» mientras dura; la tarjeta dice «En pausa · 09:48» con el reloj quieto, y la ficha, la pausa en curso
  o usada; los botones de la ficha en dos columnas (con cuatro en fila el texto se partía); Ajustes → Sucursal tiene el
  máximo. Visto en el navegador en la base de pruebas: pausar, reloj quieto, terminar y que no se ofrezca otra, a 1366×768
  y en el teléfono en oscuro, sin desplazar la página ni errores de consola. **Propuesta a confirmar (P-14):** el niño en
  pausa sigue contando en el aforo.*
- [x] **B4-8 · Entrar sin pulsera** (M-27, P-1).
  → Un niño entra sin pulsera con su nombre (obligatorio) y una seña; el servidor le da un código interno que un
  lector no puede producir; se le encuentra por nombre en la sala, la salida y la caja, con el chip «Sin pulsera»;
  aforo, tiempo y cobro, como los demás.
  *Hecho el 2026-10-07 (LuAMi), v0.63.0.* **Dominio:** `WRISTBANDLESS_PREFIX` («SP-»), `isWristbandless`,
  `wristbandlessCode` y `nextWristbandlessNumber` (correlativo por sucursal sobre los ya usados); 2 pruebas. **Contrato:**
  cada niño de la entrada lleva su pulsera o `sinPulsera`, y sin pulsera su nombre es obligatorio (o un niño conocido de
  la familia). **Aplicación:** la entrada genera los códigos con el candado del parque (`SP-00001`…, nunca se repiten:
  cada uno es de una visita, V-1) y no les aplica la serie del local; una pulsera física con el prefijo se rechaza
  (`PULSERA_RESERVADA`) y consultarla lo dice; el resto (aforo, tiempo, salida, caja) los trata como a cualquiera.
  Sin migración: el prefijo reservado basta para reconocerlos. 7 pruebas contra la base. **Web:** «Sin pulsera» junto al
  lector en la entrada (el foco salta al nombre, que se pide obligatorio); la tarjeta de la sala lo dice con su icono; la
  salida tiene «Sin pulsera (N)» para elegirlos por su nombre. Visto en el navegador en la base de pruebas: sin nombre
  no entra, con nombre entra como SP-00001, la sala lo marca y la salida lo elige, sin errores de consola. **Propuesta a
  confirmar (P-1):** la seña («camisa roja») va en el apodo; no es un campo propio.*
- [x] **B4-9 · Medias en la entrada** (M-27, P-6).
  → Con el producto de medias elegido en Ajustes → Sucursal, la entrada pregunta por cada niño si trae medias; si
  no, la cuenta de la familia lleva el par y el inventario lo descuenta; sin existencia, la entrada lo avisa y no lo
  vende.
  *Hecho el 2026-10-07 (LuAMi), v0.66.0.* **Contratos:** el ajuste `productoMedias` (un producto del inventario, `null` de
  fábrica: los ajustes de antes no preguntan) y `sinMedias` en cada niño de la entrada. **Aplicación:** la entrada añade
  a la cuenta de la familia una línea del producto de medias por cada niño sin ellas (con su precio y su IVA de ahora;
  una venta, sin `sessionId`, así que no la toca regalar ni anular su tiempo) y la saca del inventario en la misma
  transacción; sin producto elegido (`SIN_PRODUCTO_DE_MEDIAS`), si no se vende o sin existencia, la entrada no se
  registra y no queda nada escrito; 3 pruebas contra la base. **Web:** en la entrada, por cada niño, «Las trae / No trae
  · $ 1,50» (las trae de fábrica); el total incluye los pares y avisa si no quedan; Ajustes → Sucursal elige el
  producto entre los que se cuentan. Visto en el navegador en la base de pruebas: un niño sin medias, $ 6,50 con el
  paquete, registrado. **Propuesta a confirmar (P-6):** «las trae» de fábrica.*
- [x] **B4-10 · La sala para administración: cortesía y anular una entrada** (M-27, P-7).
  → Desde la tarjeta del niño, administración (supervisión con 🔐) regala su tiempo con un motivo o anula su
  entrada registrada por error: sin cobro, fuera del aforo y su línea fuera de la cuenta si no se cobró. Queda en la
  auditoría y en las excepciones del turno; nada se borra.
  *Hecho el 2026-10-07 (LuAMi), v0.65.0.* **Matriz:** acción nueva `parque.anularEntrada` (administración ✅, supervisión
  🔐, el resto ❌), con su fila en `matriz-del-plan.test.ts`. **Dominio:** `annulEntry` (las líneas sin cobrar del niño
  quedan anuladas con su importe; su estancia cuenta como cerrada; sin nadie dentro y nada que cobrar, la cuenta queda
  sin consumo; con algo suyo ya cobrado, no se anula); 3 pruebas. **Contrato:** `AnularEntradaCommandSchema` (motivo de 5 a
  200) y el motivo de anulación `ENTRADA_POR_ERROR`. **Base** (migración `20261107000000_anular_entrada`, solo expande):
  cierre `ANULADA` con su motivo, causa `ANULAR_ENTRADA`, y el índice de un solo uso que no cuenta las anuladas (su
  pulsera vuelve a servir). **Aplicación:** `parque.anularEntrada` con PIN (de administración, o el suyo si es
  administración), auditado `parque.anular_entrada` (temas sala, cuentas y turno); 4 pruebas contra la base. **Web:** en la
  ficha del niño, para quien puede, «Regalar su tiempo» (la cortesía de la caja sobre todas sus líneas por cobrar, con una
  autorización) y «Anular la entrada» (motivo y PIN). Visto en el navegador en la base de pruebas: las dos, sin errores de
  consola. Salió al probarlo: la consulta de la pulsera decía «libre» con el niño dentro (trampa de Prisma, §5).*

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
  *· Contratos: `TemaSchema` (12 temas; 13 con `sucursal`, B4-4), `CambioSchema`, `TicketTiempoRealSchema`,
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
- [x] **B5-2 · Cola de impresión por TCP 9100** y plantillas de 58 y 80 mm, más la pantalla
  **Configuración → Impresoras** (contrato `impresoras.ts`) (F1-10, F1-12, ADR-015). Con M-15 (V-4 y V-5):
  una sola impresora, en la caja, por red, para el recibo, el **ticket de corte** (JORNADA §5) y las
  **comandas**; la **impresora de comandas** es un ajuste (hoy la de caja, mañana una en la cocina).
  → El recibo no fiscal sale en papel real en los dos anchos. Sin confirmación de impresión, nada avanza.
  *Hecho el 2026-10-01 (v0.39.0), en `feat/b5-2`, con [ADR-026](adr/026-impresion-por-agente-local.md): con el servidor
  en un VPS (ADR-021), el TCP 9100 lo abre un **agente en la laptop de caja**, no el servidor (decisión del equipo al
  llegar al paso; el modelo de la impresora aún no se sabe: ESC/POS estándar).*
  *· Dominio nuevo `@l2/domain-printing`: el documento y su composición a 32 o 48 columnas (`componer`, `comoTexto`),
  el ESC/POS con la página 850 (`escpos`), el sensor del papel (`PREGUNTA_PAPEL`, `problemaDePapel`), la cola
  (`reclamado`, `trasFallo` con 5, 10, 20 y 40 s, `sinRespuesta` a los 30 s, `reintentado`) y los formatos de
  importe, tasa y hora de la pantalla. 14 pruebas.*
  *· Contrato `impresoras.ts` rehecho (era un borrador): datos de la impresora con `recibos` y `comandas` (sale el
  «oficio» y el «sin impresora de cocina», que pedía el KDS de ADR-015), mandos (crear, editar, encender, retirar,
  vincular y retirar agente), el trabajo con su vista previa y los mensajes del agente. Tema en vivo `impresion`.*
  *· Base: `20261020000000_impresion`: `printer` (IP privada por CHECK, encendida solo con sus garantías, una
  encendida para recibos y otra para comandas por sucursal, una por dirección; no se borra, se retira),
  `print_agent` (código y credencial solo como huella; se vincula y se retira una vez) y `print_job` (lo impreso no
  cambia, el estado solo avanza como dice ADR-015, nada se borra), con RLS.*
  *· Aplicación `impresion/`: impresoras y agentes (`catalogo.modificar` con elevación; la prueba, sin elevación),
  la cola (`encolarEn` en la transacción de quien imprime; sin impresora encendida, se niega), las plantillas del
  recibo (desde la venta, con «COPIA»), del corte (lo vendido, por medio, gaveta, arqueo, firma y excepciones) y de
  la prueba; del agente, vincular, abrir, reclamar (FOR UPDATE SKIP LOCKED), responder, barrer y latido. Una
  impresora apagada solo imprime pruebas. `ventas.imprimir` encola el recibo; el Z encola su ticket sin depender de
  él; la apertura del turno avisa sin impresora. 11 acciones auditadas con su fila en `TEMAS_DE_ACCION`. 8 pruebas
  contra la base y las del recibo y el Z al día.*
  *· `apps/worker`: el espacio `/impresion` (credencial en el apretón de manos, sala por sucursal, `hay-trabajo`,
  `reclamar` y `resultado`), `POST /impresion/vincular` con tope, y cada 15 s el barrido y el latido que echa a los
  retirados. 4 pruebas con servidor y clientes de verdad.*
  *· `apps/printer-agent` (nuevo): `l2-impresion vincular | probar | iniciar`; imprime por TCP con la pregunta del
  papel y vacía la cola al avisarle y cada 30 s. `pnpm arch` le prohíbe la base y la aplicación. 4 pruebas contra
  una impresora falsa.*
  *· Web: Ajustes → Impresoras (alta, prueba, encender, editar, retirar, el agente con su código y la orden, y lo
  último que se mandó a imprimir); la cola en vivo (`ColaProvider`); el recibo y Turno enseñan cómo va la impresión
  con «Reintentar»; el Z sellado, su ticket; «N sin imprimir» en la barra de las estaciones y en Inicio. Fuera
  `window.print()`.*
  *· Comprobado en el navegador con una impresora falsa en TCP y el agente de verdad: alta con errores de
  formulario, prueba en cola sin agente, vincular con el código del panel, la prueba en papel y «Impreso» en vivo,
  recibo de #0037 en papel a 80 mm, la copia sin papel («Sin papel»), la alerta «1 sin imprimir» con su lista y
  «Reintentar», el ticket del Z solo y a 58 mm (32 columnas), y retirar el agente lo desconecta. Impresoras, la
  caja y Turno a 1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
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
- [x] **B9-2 · Existencias en tiempo real, de solo-agregar** (F8-05, I-10, [ADR-023](adr/023-existencia-al-entrar-en-la-cuenta.md)):
  la existencia es la suma de movimientos. La línea que entra en una cuenta (mostrador, mesa, evento) la
  descuenta en la misma transacción, y quitarla o anular lo no entregado la devuelve. **Sin existencia no
  se vende**, ni en la caja ni en la tablet del mesero; los servicios no llevan existencia.
  → Toda diferencia de existencia tiene un movimiento que la explica. Un doble clic no descuenta dos veces
  y dos ventas a la vez no venden la última unidad dos veces.
  *Hecho el 2026-09-30 (v0.33.0) en `feat/b9-2`; pasó a `main` con B9-3, porque sin entradas lo que lleva existencia
  no se vende.*
  *· Base: `20261014000000_existencias`: `stock_movement` (VENTA o DEVOLUCION con su cuenta y versión, cantidad
  entera distinta de cero, FK compuestas con el tenant a la sucursal, al producto y a la versión de la cuenta, única
  por cuenta, versión y producto), solo-agregar, RLS y un disparador que no deja la existencia bajo cero (la última
  línea). Aplicada a la base del cliente (solo añade la tabla). 1 prueba nueva.*
  *· Contrato: `ProductoSchema.existencia` (entera, nunca negativa, `null` si no lleva). Tema `catalogo`, que ahora
  dice también la existencia.*
  *· Dominio (`@l2/domain-inventory`): `unitsHeld` (cada línea de un producto es una unidad; la movida a otra cuenta
  ya no es de esta), `stockMovesOf` (la diferencia entre dos versiones, ordenada por producto, sin devolver más de
  lo que la cuenta sacó) y `stockShortfalls` (lo que no se sabe que hay, no hay). 9 pruebas.*
  *· Aplicación: `inventario/existencias.ts`: `comprobarExistencias` toma el candado de cada producto que sale, suma
  y rechaza «Sin existencia de … : no queda ninguno» señalando la línea, antes de escribir nada; `asentarExistencias`
  escribe los movimientos tras la versión de la cuenta, con su asiento `existencia.mover` (tema `catalogo`).
  `cuentas.guardar` los llama en su transacción (mostrador, mesa y familia). El catálogo lleva la existencia de la
  sucursal de quien lee. 9 pruebas contra la base: sin existencia no se guarda nada, tampoco en la tablet, lo que no
  lleva no mueve, venta y devolución con su movimiento, un reintento no descuenta dos veces, dos cajas a la vez por
  la última unidad (una sola la vende), cobrar no mueve, aislamiento y lo que entró antes de llevarse.*
  *· Web: la carta de la caja dice «Quedan N» y deja ver pero no tocar lo «Agotado»; el «+» de una fila no pide más
  de lo que queda; Inventario → Productos dice cuántas quedan. Anular un cobro deja las líneas por cobrar: lo no
  entregado vuelve al quitar su línea (ADR-023, situación en el código).*
  *· Comprobado en el navegador: la carta de la caja con los siete productos de la base que llevan existencia
  «Agotado» y deshabilitados, y Productos con «agotado: no se vende»; sin errores de consola. Vender lo que lleva
  existencia se comprueba con B9-3, que trae la entrada.*
- [x] **B9-3 · Entradas de mercancía y costo promedio ponderado** (F8-06, F8-01): una carga de **varias
  líneas** (compra o reposición, con proveedor y factura opcionales) o de un producto suelto, cada línea
  con cantidad y costo en $, y conversiones de unidad (se compra la caja de 24, se vende la unidad). El
  margen de lo vendido sale del costo promedio. Sin insumos de cocina (después del piloto, M-15).
  → El costo tras dos compras a precios distintos coincide con el cálculo del contador; comprar por caja
  y vender por unidad cuadra.
  *Hecho el 2026-09-30 (v0.34.0), con B9-2 en la misma rama.*
  *· Base: `20261015000000_entradas_de_mercancia`: `stock_entry` (COMPRA o REPOSICION, proveedor y factura que pueden
  faltar, clave de idempotencia única, solo-agregar, RLS) y en `stock_movement` el **valor al costo** (`value_minor`,
  la suma es el valor del inventario), la entrada y cómo se compró (`packs` × `pack_size` = unidades, CHECK); el tipo
  pasa a VENTA, DEVOLUCION o ENTRADA, cada uno con lo suyo, y hasta $ 100.000,00 por línea. 1 prueba nueva.*
  *· Permiso nuevo `inventario.entrada` (administración y supervisión, sin elevación: se recibe con el proveedor
  delante), en Roles y accesos como «Cargar entradas de mercancía». 3 pruebas.*
  *· Contrato: `RegistrarEntradaCommandSchema` (clave, tipo, proveedor y factura opcionales, de 1 a 60 líneas con
  bultos, unidades por bulto y costo del bulto en centavos, cada producto una vez), `EntradaSchema`/`EntradasSchema`;
  el producto trae `costoPromedio` (solo con existencia) y `ultimoBulto`. 3 pruebas.*
  *· Dominio (`costo.ts`): costo promedio ponderado perpetuo llevando el valor, con la aritmética de `@l2/domain-money`:
  `costOfUnits` (la venta se lleva su parte proporcional; la última, lo que quede), `costOfReturn`,
  `averageUnitCostMinor`, `marginBasisPoints`, `entryLineProblem` y `entryLineTotals`. 7 pruebas, con los dos criterios.*
  *· Aplicación: `entradas` (`leer` y `registrar`, con `inventario.entrada`, la clave, el candado de cada producto, el
  asiento `inventario.entrada` con tema `catalogo` y el rechazo por permiso auditado; lo que no lleva existencia no
  entra). La venta guarda su valor al costo promedio y la devolución lo que su cuenta sacó. 8 pruebas contra la base:
  la compra de varias líneas, dos compras = el cálculo del contador ($ 0,60), doble clic y dos a la vez, lo que no
  entra (nada a medias), permisos, aislamiento, la caja de 24 vendida por unidad deja el valor en cero, y vender y
  devolver no cambia el costo. Las de B9-2 cargan su existencia con entradas reales.*
  *· Web: Inventario → **Entradas de mercancía** (la lista con tipo, proveedor, factura, líneas, total, cuándo y quién;
  «Nueva entrada» con compra o reposición, líneas de producto, bultos, unidades por bulto que propone la última y
  costo del bulto, con lo que entra, el costo por unidad y el promedio de hoy). La ficha del producto dice cuántas
  quedan, su costo promedio y su margen, y «Cargar entrada» abre la hoja con él. «Compras y mermas» se parte en
  Entradas (B9-3) y Salidas y conteo (B9-4).*
  *· Comprobado en el navegador: dos entradas de «Prueba B93 Refresco» (48 a $ 0,50 y 24 a $ 0,80): 72 a $ 0,60 y
  margen 60,0 %; la caja ofrece «Quedan 72» y una venta de mostrador la deja en 71 (la ficha lo dice en vivo); al
  descartarla vuelve a 72 con el mismo costo. Entradas, la hoja con dos líneas y la ficha a 1366×768, 1280×800 y
  800×1280 sin desplazar el documento ni desbordar (la hoja desplaza su zona con dos líneas); sin errores de consola.
  Sin turno abierto la caja no deja tocar el ticket: el «+» que no pide más de lo que queda lo cubre el tipado.*
- [x] **B9-4 · Salidas y ajustes con motivo de lista cerrada y 🔐, y conteo físico** (F8-07): merma o
  daño, consumo interno, regalo y devolución al proveedor; se cuenta, se ve la diferencia y se ajusta con
  autorización.
  → Ningún ajuste sin motivo ni asiento. El conteo deja la existencia igual a lo contado.
  *Hecho el 2026-09-30 (v0.35.0).*
  *· Base: `20261016000000_salidas_y_conteo`: `stock_adjustment` (SALIDA con motivo de lista cerrada o CONTEO sin él,
  detalle opcional, lo declarado en `content`, clave única, quién lo hizo y **quién lo autorizó**, ambos obligatorios;
  solo-agregar, RLS) y en `stock_movement` los tipos SALIDA (solo saca) y AJUSTE (saca o mete, con el valor de su signo),
  que citan su ajuste, uno por producto. 1 prueba nueva.*
  *· Contrato (`salidas.ts`): `RegistrarSalidaCommandSchema` (MERMA, CONSUMO_INTERNO, REGALO o DEVOLUCION_PROVEEDOR;
  hasta 60 productos), `RegistrarConteoCommandSchema` (lo esperado al contar y lo contado; hasta 300) y la lectura con
  cantidades y valores con su signo. 2 pruebas.*
  *· Dominio (`ajustes.ts`): `countMoves` (lo contado menos lo esperado) y `costOfSurplus` (lo que sobra entra al costo
  promedio; sin existencia, al de la última entrada; sin nada, a cero: el conteo no inventa costos). 3 pruebas.*
  *· Aplicación: `salidas` (`leer`, `salida`, `conteo`, `autorizadores`) con `inventario.ajustar`: administración
  confirma con su PIN y supervisión pide el de administración (D-AUT); la autorización se registra antes de mover nada;
  no sale más de lo que hay; **un conteo no ajusta a ciegas**: si la existencia cambió mientras se contaba (se vendió
  algo), CONFLICTO con lo que dice ahora; candados por producto, clave de idempotencia, asientos `inventario.salida` e
  `inventario.conteo` con quién autorizó y tema `catalogo`. 10 pruebas contra la base.*
  *· Web: Inventario → **Salidas y conteo**: la lista (tipo, motivo, detalle, lo que movió, el valor al costo con su
  signo, quién y quién autorizó); «Registrar salida» (motivo, productos con lo que queda, detalle y la autorización) y
  «Contar» (todos los productos que llevan existencia con lo que dice el sistema, lo contado y la diferencia; lo esperado
  se fija al empezar a contar cada uno y, si el servidor dice que cambió, la línea adopta el número nuevo para revisar).
  `useAutorizacion` admite otro cargador de autorizadores.*
  *· Comprobado en el navegador con dos equipos: merma de administración con su PIN; supervisión ve que solo
  administración la autoriza, un PIN equivocado se rechaza y el correcto pasa; un conteo deja 65; un conteo mientras
  supervisión regala una unidad se rechaza («ahora el sistema dice 64»), la línea adopta el número y al volver a
  registrar queda lo contado. Lista y hojas a 1366×768, 1280×800 y 800×1280 sin desplazar el documento (la hoja del
  conteo desplaza su zona); sin errores de consola.*
- [x] **B9-5 · Mínimos y alertas de stock crítico** con antelación por producto (F8-08), en Inicio y en el
  inventario (M-16): el stock mínimo de cada producto es su punto de reorden; el estado (agotado, bajo mínimo, bien) se
  ve con color, icono y texto, y los avisos salen en Inicio con enlace al inventario.
  → Avisa antes de quedarse sin producto.
  *Hecho el 2026-09-30 (v0.36.0), en `feat/b9-5`.*
  *· Base: `20261017000000_stock_minimo`: `product.min_stock` (entero de 0 a 1.000.000 o nulo, CHECK); se edita y el
  cambio queda en la auditoría.*
  *· Contrato: `ProductoSchema.minimo` (solo con existencia) y `FijarMinimoCommandSchema` (o `null`, sin mínimo).*
  *· Dominio (`alertas.ts`): `stockStatus` (AGOTADO, BAJO_MINIMO en el punto de reorden o por debajo, BIEN) y
  `stockAlerts` (lo apartado y lo que no lleva existencia no avisan). 2 pruebas.*
  *· Aplicación: `productos.fijarMinimo` con `inventario.entrada` (quien recibe la mercancía, sin elevación: no cambia lo
  que se cobra), asiento `producto.minimo` con lo de antes y lo de después y tema `catalogo`. 2 pruebas contra la base.*
  *· Web: `EstadoStock` (color + icono + texto, los colores de estado con su significado) en la ficha del producto, con
  su campo «Stock mínimo»; la lista dice «bajo su mínimo»; Inicio enseña «Inventario: N agotados · M bajo mínimo» (o
  «al día») con enlace al inventario. La vista completa llega con B9-6.*
  *· Comprobado en el navegador: el mínimo de «Prueba B93 Refresco» a 70 con 60 en stock lo pasa de «Bien» a «Bajo
  mínimo», en la ficha y en la lista; Inicio dice «Inventario: 8 agotados» (los productos del cliente) en rojo a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento; sin errores de consola.*
- [x] **B9-6 · Identificación, tipos y la vista del inventario** (M-16): SKU automático, código de barras único y
  presentación; tipo PRODUCTO, PREPARADO o SERVICIO; Productos con resumen + tabla y tarjetas, con el stock como
  protagonista; la entrada de mercancía crea productos con una ficha corta; el código se escanea en la caja (vende), en
  las entradas, en el conteo y en Productos (abre la ficha).
  → Pasar un producto por el lector lo vende en la caja; uno que no existe se da de alta en la entrada sin salir de ella.
  *Hecho el 2026-09-30 (v0.37.0), en `feat/b9-5`; se cierra la Etapa 9.*
  *· Base: `20261018000000_identificacion_y_tipos` (en una transacción): `product.kind` (PRODUCTO, PREPARADO, SERVICIO;
  CHECK de que solo el PRODUCTO lleva existencia), `sku` (único por local, «AAA-0000», no cambia: lo impone el mismo
  disparador que guarda quién lo creó), `barcode` (único por local, solo en un PRODUCTO) y `presentation`; relleno de
  los existentes con la RLS suspendida solo mientras rellena. 1 prueba nueva.*
  *· Contrato: `TipoProductoSchema`, `CodigoBarrasSchema` (sin espacios, en mayúsculas), `PresentacionSchema`; el
  producto trae tipo, SKU, código, presentación y su valor al costo; crear y editar llevan tipo (fuera `controlaStock`
  de los mandos), código y presentación; la línea de entrada puede ser `{ nuevo: ficha corta }`. 5 pruebas.*
  *· Dominio (`identificacion.ts`): `skuPrefix` (tres letras de la categoría sin acentos), `nextSku`, `normalizeBarcode`,
  `barcodeProblem` (formato y dígito de control de EAN-8, UPC-A, EAN-13 e ITF-14: una lectura torcida no entra) y
  `kindTracksStock`. 4 pruebas.*
  *· Aplicación: `crearProductoEn` (el alta, con el SKU bajo candado y el código validado y único) la usan «Nuevo
  producto» y la entrada; dar de alta en una entrada pide además `catalogo.modificar` (con elevación) y va en la misma
  transacción (nada a medias); lo que tiene existencia no cambia de tipo hasta sacarla o contarla. 5 pruebas contra la
  base.*
  *· Web: `InventarioVista` (resumen que filtra: agotados, bajo mínimo, unidades, valor al costo; pestañas por tipo;
  búsqueda por nombre, SKU o código; categoría, estado y apartados; tabla con el stock primero y por urgencia, o
  tarjetas con barra de nivel, la elección recordada en el navegador). La ficha y «Nuevo producto» eligen el tipo y
  llevan código (leído o tecleado, con su problema a la vista) y presentación. La entrada tiene «Producto nuevo» con su
  ficha corta. **El lector:** el bus de `@l2/ui` pasa de un receptor a una pila (una hoja escucha encima de su pantalla
  y le devuelve el turno al cerrarse) con `useLectorDeCodigos`; en Productos abre la ficha (o propone el alta), en la
  ficha y en «Nuevo producto» pone el código, en la entrada suma un bulto o abre la ficha corta, en el conteo lleva a su
  casilla y en la caja vende (a la cuenta a la vista o en una venta directa; sin turno o agotado, avisa).*
  *· Comprobado en el navegador: el código 036000291452 leído en Productos se ofrece para dar de alta; en la entrada
  abre la ficha corta con él y otra lectura suma un bulto; registrada, nace «Prueba B96 Uva» (PRU-0002) con 72; leerlo en
  Productos abre su ficha y en el conteo pone el cursor en su casilla; la caja sin turno avisa en vez de vender. Tabla y
  tarjetas a 1366×768, 1280×800 y 800×1280 sin desplazar el documento ni desbordar (en vertical, mínimo y costo quedan
  en la ficha); sin errores de consola. Vender por el lector con un turno abierto no se probó (no se abrió un turno en la
  base del cliente): usa el mismo camino que tocar el producto en la carta.*
- [x] **B9-7 · Catálogo sin existencias y su conteo inicial** (M-28).
  → El catálogo se da de alta en una hoja, sin cantidades (nombre, categoría, presentación, precio, IVA, mínimo y
  código de barras). Un producto que se cuenta y nunca tuvo existencia queda «Sin inventario inicial», distinto de
  «Agotado»: no se vende (ADR-023) y la caja, la carta y la lista dicen por qué. Inventario y la puesta a punto cuentan
  los pendientes; el inventario inicial trae solo los que faltan, con la fecha del conteo.
  *Hecho el 2026-10-08 (v0.74.0), en `feat/b9-7`.*
  *· Base: `20261110000000_inventario_inicial` (solo expande): `stock_start`, el arranque de la existencia de un producto
  en una sucursal (lo que entró o lo que se contó, también cero, con la entrada o el conteo que lo arrancó), uno por
  producto y sucursal, solo-agregar y con RLS. Arranca un producto lo que no tenía fila ni movimientos; lo cargado antes
  (o con la versión anterior durante una vuelta atrás) cuenta como arrancado desde su primer movimiento (ADR-028).*
  *· Dominio: `stockStatus` gana `SIN_INICIAL` (distinto de `AGOTADO`, con `iniciado` como dato) y `stockAlerts` lo
  cuenta. 2 pruebas.*
  *· Contrato: `inventarioInicialEl` en el producto (`null` en lo que se cuenta = sin inventario inicial; sin decirlo,
  `null`: fail-closed); `minimo` en el alta; `AltaEnLoteCommandSchema` (de 1 a 300, cada nombre y código una vez); el
  inventario inicial admite `enCero` (puede ser solo de ellos) y la entrada los devuelve. 4 pruebas.*
  *· Aplicación: `productos.altaEnLote` (`inventario.catalogo`, todo o nada, con un asiento por producto; 300 de una vez
  en menos de 2,5 s); `arranquesDe` y `asentarArranques`; las entradas arrancan lo que no había arrancado y el
  inventario inicial rechaza lo ya arrancado (`YA_TIENE_INVENTARIO_INICIAL`, se corrige con un conteo); el conteo
  arranca lo contado, aunque sea cero; vender lo que no arrancó dice «todavía no tiene inventario inicial»
  (`SIN_INVENTARIO_INICIAL`); la puesta a punto cuenta los pendientes a la venta. 12 pruebas nuevas contra la base
  (`inventario-inicial.test-db.ts`) y 3 ajustadas.*
  *· Web: Productos con la cifra «Sin inventario inicial» (filtra), «Alta en lote» (hoja con teclado, «Pegar desde
  Excel» y el lector en la fila activa) y «Contar N pendientes»; la ficha con «Contarlo» o el día de su inventario
  inicial; «Traer los que faltan» en el inventario inicial, con 0 = «en cero» y en blanco = sigue pendiente, y el aviso de
  lo ya contado; la caja y la tablet dicen «Sin contar»; la carta de Ajustes, «No se piden» (agotados y sin inventario
  inicial); Inicio y la puesta a punto, cuántos faltan; el manual, su síntoma.*
  *· Decidido al construir: una compra, una reposición o un conteo también arrancan un pendiente (ya tuvo existencia:
  «nunca tuvo existencia» es el criterio); la «fecha del conteo» es el instante en que se registró, sin fechas hacia
  atrás (ADR-010); un producto nuevo de una entrada no se cuenta en cero (para eso, el alta en lote).*
  *· Comprobado en el navegador, en la base de pruebas: cuatro «Prueba B97 …» pegados desde Excel (uno con el precio
  mal escrito, señalado en su fila) nacen «Sin inventario inicial»; la caja los enseña «Sin contar» y no deja tocarlos;
  el inventario inicial trae los que faltan, uno con 12 a $ 0,55 y otro en 0 → «Bien» y «Agotado», los otros dos
  siguen pendientes; la ficha dice «Inventario inicial: jue 8 oct»; Inicio, «1 agotado · 12 sin inventario inicial», y
  la puesta a punto, «12 productos sin inventario inicial de 16». A 1366×768, 1280×800, 800×1280 y 390 px, en los dos
  temas, sin desbordar ni errores de consola.*
- [x] **B9-8 · Duplicar un producto y sus sabores** (M-28).
  → «Duplicar» abre la ficha copiada (categoría, presentación, precio, IVA, mínimo y carta) con el nombre para cambiar:
  SKU nuevo, código de barras vacío, existencia en cero. «Duplicar con otros sabores» crea varios de una vez desde una
  lista («Naranja, Manzana…» → «Jugo Naranja», «Jugo Manzana»), cada uno con su propio código de barras si se escribe o
  se lee. Cada copia es un producto propio, con su existencia.
  *Hecho el 2026-10-08 (v0.84.0), en `feat/b9-8`.*
  *· Dominio (`@l2/domain-inventory`, `sabores.ts`): `saboresDe` (la lista tecleada, por comas, «y» o renglones, sin
  vacíos ni repetidos) y `nombresConSabores` (la base y cada sabor). 2 pruebas.*
  *· Aplicación: sin cambios; la copia es un alta (`productos.aplicar`, CREAR) y los sabores, un alta en lote (B9-7), que
  ya llevan el mínimo y la carta. 2 pruebas contra la base: cada copia con la ficha del original, su SKU, su código y sin
  inventario inicial; un nombre repetido no crea ninguna.*
  *· Web: en la ficha del producto, «Duplicar» (la hoja de alta con la ficha copiada y el precio que rige, para cambiarle
  el nombre y el código) y «Con otros sabores» (`DuplicarConSabores`: la base, los sabores, cada copia con su código
  tecleado o leído —el lector llena el primero vacío— y el aviso de un nombre que ya existe).*
  *· Decidido al construir: «existencia en cero» es la de B9-7: la copia nace «Sin inventario inicial», no con un cero
  contado, porque nadie la ha contado todavía.*
  *· Comprobado: en el navegador, contra la base de pruebas: «Duplicar» de «Prueba B97 Jugo 0810» con otro nombre (sale
  con su precio de $ 1.94) y «Con otros sabores» con «Mango, Parchita y Guayaba» (3 productos nuevos); a 1366×768,
  1280×800, 800×1280 y 390 px, en los dos temas, sin desbordes ni errores de consola.*
- [x] **B9-9 · Editar en lote** (M-29).
  → En Productos se eligen varios y se les cambia la categoría, el mínimo, la carta o el precio (en % o en monto, desde
  una fecha), o se apartan. Una sola confirmación, y cada producto deja su asiento.
  *Hecho el 2026-10-08 (v0.83.0), en `feat/b9-9`.*
  *· Dominio (`catalogo.ts`): `adjustedPrice`, el precio tras un ajuste en puntos básicos (redondeado al céntimo, la
  mitad hacia arriba) o con un monto; si vale lo sigue diciendo `priceProblem`. 1 prueba.*
  *· Contrato: `EditarEnLoteCommandSchema` (hasta 300 productos, sin repetir) con un cambio: `CATEGORIA`, `MINIMO`,
  `EN_CARTA`, `PRECIO` (`AjusteDePrecioSchema`: de −90 % a +500 %, o un monto, y su día) o `APARTAR`.*
  *· Aplicación: `productos.editarEnLote` pide lo mismo que cada cambio suelto (el precio y la carta, `catalogo.modificar`
  con elevación; la ficha y apartar, `inventario.catalogo`; el mínimo, `inventario.entrada`) y lleva cada producto por
  el mismo camino que su cambio suelto (`guardar`), así que cada uno deja su asiento («Editado en lote»). Todo o nada
  (`Deshacer`): el primer producto que no puede dice su nombre y no cambia ninguno; lo que ya estaba así no se toca. El
  día del precio, como uno suelto (ni atrás ni más allá del plazo). 5 pruebas contra la base.*
  *· Web: casillas en la tabla de Productos (una por fila y «todos los que se ven»), la barra «N elegidos» con lo que el
  puesto alcanza (fija arriba en el escritorio y abajo en el teléfono) y una hoja por cambio que enseña a quiénes toca y,
  con el precio, cómo queda cada uno («$ 1.20 → $ 1.32»), con un solo «Aplicar a N productos».*
  *· Comprobado: en el navegador, contra la base de pruebas: elegir los dos «Prueba B97 Jugo», subirles el precio un
  10 % desde hoy confirmando la identidad (de $ 1.20 a $ 1.32) y la barra con 17 elegidos; a 1366×768, 1280×800,
  800×1280 y 390 px, en los dos temas, sin desbordes ni errores de consola.*
- [x] **B9-10 · Conteo a ciegas y su informe de diferencias** (M-29).
  → La hoja de conteo (impresa o en el teléfono, por categoría o completa) no enseña lo que dice el sistema. Al
  terminar, el informe de diferencias: faltantes y sobrantes por producto y por categoría, valorados al costo, que se
  guarda con su fecha para comparar un conteo con otro; ajustar sigue pidiendo su autorización (B9-4). Se cuenta con el
  local cerrado; el conteo ya detecta lo que se vendió mientras se contaba.
  *Hecho el 2026-10-08 (v0.82.0), en `feat/b9-10`.*
  *· Dominio (`@l2/domain-inventory`, `conteo.ts`): `diferenciasDeConteo` suma lo contado, lo que cuadró, lo que faltó y
  lo que sobró, en unidades y al costo, por categoría y en total. 2 pruebas.*
  *· Contrato y aplicación: cada línea de un ajuste trae su categoría; `salidas.uno` vuelve a leer una salida o un conteo
  por su id (`inventario.ajustar`, solo de su sucursal). 1 prueba contra la base.*
  *· Web: «Contar» es a ciegas: se elige qué se cuenta (todo o una categoría), la lista no dice lo que espera el sistema
  y «Terminé: ver diferencias» enseña, antes de ajustar, lo contado contra el sistema por categoría y por producto (al
  costo promedio, estimado); la autorización se pide ahí. «Hoja para imprimir» (`/informes/hoja-de-conteo`) da la hoja A4
  en blanco, por categoría, sin el sistema, con «Contó» y «Revisó». Cada conteo del historial lleva su «Informe de
  diferencias» (`/informes/conteo/[id]`): el resumen, por categoría y por producto, con el valor que asentó el ajuste.
  La tabla de los informes (`informe.tsx`) admite columnas con el mismo título.*
  *· Decidido al construir: «lo que dice el sistema» se fija al empezar a contar cada producto, como en B9-4, así que lo
  vendido mientras se contaba se detecta igual (el servidor lo dice y la revisión se vuelve a abrir con lo nuevo). El
  informe se guarda con el conteo: comparar dos es abrir sus dos informes, con su fecha, quién contó y quién autorizó.*
  *· Comprobado: en el navegador, contra la base de pruebas: «Contar» de «Prueba B97» sin «Sistema:» a la vista, las
  diferencias (8 contados, 7 cuadran, falta 1), registrar con el PIN de administración, el informe de diferencias en PDF
  y la hoja para imprimir; a 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas, sin desbordes ni errores de
  consola.*

### Etapa 6 · Restaurante en el servidor (en el piloto desde M-15, que cierra D-RES)

- [x] **B6-1 · Mesas, plano y carta** persistidos (F6-01 a F6-03). Se borra `src/demo/restaurante.ts`.
  Carta y precios y Plano del local se rehacen ya con el patrón de Ajustes (M-17), y sus piezas comunes
  (resumen con cifras, paginación, filtros con su cuenta, confirmación) suben a `@l2/ui` para T-7.
  *Hecho el 2026-10-02 (v0.40.0). **Carta = catálogo:** `ProductoDto.enCarta` y el mando `EN_CARTA` (auditoría
  `producto.carta`, tema `catalogo`); un producto nace en la carta y un servicio fuera. **Plano versionado:**
  `floor_plan_version` solo-agregar con autor (migración `20261022000000_plano_y_carta`); `casosPlano` lee la última
  versión revalidada y publica con `catalogo.modificar` y elevación, a nombre de una persona, chocando si `sobre` no es
  la vigente; la hora de retirar una mesa la pone el servidor y no cambia después; `cambioDePlanoProblem` (dominio)
  impide borrar una mesa o retirarla con su cuenta abierta; publicar lo mismo no añade versión. **I-05 en el
  servidor:** al nacer una cuenta MESA, `mesaParaCuentaNueva` (candado `mesas:<sucursal>`, el mismo que publicar)
  exige una mesa del plano sin retirar y sin otra cuenta abierta, y pone su número; `MESA_SIN_PRODUCTO` (dominio): lo
  pedido en la mesa lleva su producto, con precio, IVA y existencia del servidor. Pruebas: `plano.test-db.ts` (16),
  mesa en `cuentas.test-db.ts` (6, con dos tablets a la vez), `EN_CARTA` en `productos.test-db.ts` (2), dominio (1).
  **Web:** `plano.servidor.ts`/`plano.acciones.ts`, `PlanoProvider` desde el layout (tema `plano` → repinta, sin
  `sessionStorage`); el mesero pide de `cartaDelMesero` (catálogo a la venta y en la carta, con «Quedan N» y
  agotados), la cuenta guarda primero y solo entonces sale el evento a cocina; local sin plano → aviso con enlace.
  **Carta y precios** nueva (resumen que filtra, filtros con cuenta, búsqueda, tabla y tarjetas, páginas 10/20/50,
  interruptor «en la carta», hoja de precio y de «Nuevo plato»); **Plano del local** con resumen, pestañas Plano ·
  Mesas · Local (medidas y estructura), mesas ocupadas que no se retiran, aviso si otro publicó y confirmación al
  retirar; una mesa nueva toma el id `mesa-<número>` si está libre. `@l2/ui`: `Resumen`, `Cifra`,
  `FiltroSegmentado`, `BarraDeFiltros`, `Paginacion`, `Confirmacion`; Impresoras sobre ellas. Fuera
  `src/demo` entera (y la regla `demo-solo-desde-las-rutas`), `CartaProvider`, `EditorCarta` y `MenuSchema`.
  Navegador a 1366×768, 1280×800 y 800×1280 sin desplazar la página ni errores de consola (detalle en §1).
  Lo que se mueve del parque a una mesa (vincular pulseras) sigue llegando de la pantalla: B6-3.*
- [x] **B6-2 · Pedidos del mesero y comanda impresa** ([ADR-022](adr/022-cocina-con-comanda-impresa.md), F6-06,
  F6-07 y F6-09, sin F6-08): el pedido confirmado en la tablet crea su trabajo de impresión en la
  impresora de comandas; la comanda queda «enviada» e «impresa», y si falla, la tablet del mesero y la caja
  lo avisan y se reimprime. Se retiran la estación de cocina (KDS) y los estados «en fuego» y «listo».
  → Ningún pedido confirmado se queda sin comanda sin que alguien lo vea.
  *Hecho el 2026-10-02 (v0.41.0). **Base:** `kitchen_order` solo-agregar (número de comanda por sucursal, mesa, platos
  con nota, autor; migración `20261023000000_pedidos`), `print_job.order_id` (toda COMANDA lleva su pedido, CHECK
  `NOT VALID` por las comandas sueltas de antes en bases de desarrollo; el pedido del trabajo tampoco cambia) y la
  causa `PEDIDO` en la versión de la cuenta. **Dominio** (`@l2/domain-orders/pedido.ts`): `lineasDelPedido` (catálogo
  de ahora, una línea por unidad; si el precio cambió desde que la tablet lo enseñó, `PRECIO_DISTINTO`) y
  `estadoDeComanda` (impresa si alguno salió; si no, el último: en cola, no salió o descartada); fuera la máquina
  «en fuego/listo/entregado» y `nivelEspera`. **Aplicación** (`restaurante/pedidos.ts`): `enviar` comprueba permiso
  (`pedido.enviarCocina`), impresora de comandas, mesa (candado de las mesas, I-05), catálogo y existencia antes de
  escribir, y en una transacción abre o amplía la cuenta, asienta la existencia, crea el pedido y encola la comanda;
  el mismo `pedidoId` devuelve lo ya enviado. `reimprimir`: si no salió, reintenta el mismo trabajo (o lo descarta y
  sale en la impresora de comandas de ahora); descartada, sale como original; impresa, copia marcada «REIMPRESIÓN»;
  mientras se imprime, CONFLICTO. `leer`: los de hoy con su comanda. Plantilla `documentoDeComanda`. Pruebas:
  `pedidos.test-db.ts` (15), dominio (7). **Web:** `PedidosProvider` desde el layout (temas `pedidos` e `impresion`),
  la tablet envía al servidor y adopta la cuenta, cada pedido con su estado y «Volver a imprimir», aviso rojo y
  «Atender» con las que no salieron; Inicio con la zona «Comandas»; la caja ya avisaba de los trabajos que no salen.
  Fuera `/cocina`, `features/cocina`, los eventos `pedido.*` e `impresora.*` del bus y su proyección; el rol COCINA no
  tiene puesto y el acceso se lo dice. Navegador a 1366×768, 1280×800 y 800×1280 sin desplazar la página (§1). Anular
  un pedido enviado y la cuenta de mesa en el servidor: B6-3.*
- [x] **B6-3 · Cuenta de mesa**, vinculación de pulseras, salida a mesa y anulación de pedidos (F5-14, F6-05, F6-14), con
  los productos del mesero descontando existencias (ADR-023).
  *Hecho el 2026-10-03 (v0.43.0). **La división por ítems (F6-12) queda fuera:** va en un paso propio, con su número
  por decidir.*
- [x] **B6-5 · Mesa sin consumo** (M-18). «Liberar mesa» en la tablet cuando la mesa no tiene nada que cobrar (no
  pidieron, o todo se anuló o se regaló): el mesero, sin PIN, y queda en la auditoría quién y cuándo. La cuenta en
  $ 0 se cierra con un estado propio («sin consumo»): sale de la cola de la caja y de los pendientes del cierre, y no
  cuenta como incobrable. → Ninguna mesa se queda ocupada ni bloquea el cierre del día por no tener nada que cobrar.
  *Corrige lo que deja B6-3: hoy una cuenta de mesa con todo anulado no se puede cobrar (la caja exige un pago) y
  bloquea el cierre de la jornada; solo sale marcándola incobrable.*
  *Hecho el 2026-10-03 (v0.44.0). **Dominio:** `sinConsumoProblem` (solo MESA, abierta o por cobrar, sin
  `chargeableLines`) y `closeWithoutConsumption` (SIN_CONSUMO, o COBRADA si ya se cobró una parte); un «guardar» no la
  cierra ni la toca (`CUENTA_SIN_CONSUMO`). **Base:** estado `SIN_CONSUMO` y causa `LIBERAR` en `account_version`
  (migración `20261025000000_mesa_sin_consumo`). **Aplicación:** `cuentas.liberarMesa` con `pedido.tomar`, sin PIN,
  versión optimista, clave de idempotencia y auditoría `mesa.liberar` (tema `cuentas`); `leer` ya no carga las cerradas
  sin consumo de días anteriores. Pruebas: dominio (5), `cuentas.test-db.ts` (5: con todo anulado sale de los
  pendientes del cierre, reabrir la mesa, rechazos, versión vieja, permisos y aislamiento). **Web:** «Liberar mesa» en
  lugar de «Pide la cuenta» cuando no hay nada que cobrar, con confirmación; `pasarACaja` cuenta solo lo cobrable.
  Navegador en la base de pruebas a 1366×768, 1280×800 y 800×1280. Una mesa abierta solo en el bus (sin cuenta en el
  servidor) se libera emitiendo `mesa.libre`, sin asiento: su apertura tampoco lo tiene (§5, el salón en el bus).*
- [x] **B6-6 · Anular en cocina, con papel e inventario** (M-18, F6-14). Al anular un plato ya enviado sale en la
  impresora de comandas un papel «ANULAR · Mesa N · cantidad × plato», con su cola y su aviso si no sale, como la
  comanda. Quien anula marca si la cocina ya lo preparó: si no, la existencia vuelve al estante; si sí, sale como merma
  con su costo (B9-4). → La cocina no prepara lo anulado y el inventario no baja de más.
  *Hecho el 2026-10-03 (v0.45.0). **Contrato:** `AnularPedidoCommandSchema` pasa a `lineIds` (todos de una comanda) y
  `preparado`; la anulación guarda `preparado`; `PedidoDto.anulacion` dice cómo salió el último papel; tipo de trabajo
  `ANULACION`. **Dominio:** `anulacionesProblem` (cada línea + `PEDIDOS_DISTINTOS`). **Base:** `print_job` admite
  `ANULACION` con su pedido (migración `20261026000000_anular_en_cocina`). **Aplicación:** `cuentas.anularPedido`
  comprueba todo antes de escribir (permiso, versión, platos, impresora de comandas, PIN) y en una transacción guarda la
  versión, devuelve la existencia (`comprobarExistencias` + `asentarExistencias`), si estaba preparado la saca como
  `SALIDA`/`MERMA` con la autorización de la anulación (`asentarAjuste`, extraído de `salidas.ts`) y encola el papel
  (`documentoDeAnulacion`); la comanda y su reimpresión miran solo los trabajos `COMANDA`. Pruebas: dominio (1),
  `pedidos.test-db.ts` (4: sin preparar con papel y devolución, preparado como merma, sin impresora, permiso) y las de
  anular de `cuentas.test-db.ts` con pedidos reales. **Web:** la pregunta «¿La cocina ya lo preparó?», una sola llamada
  por pedido, el estado del papel en la tarjeta y sin «Volver a imprimir» en una comanda anulada; «Anulaciones» en el
  historial de Impresoras. Navegador en la base de pruebas a 1366×768, 1280×800 y 800×1280. La merma con existencia se
  comprobó en las pruebas contra la base (la carta de la base de pruebas no tiene platos con existencia).*
- [ ] **B6-4 · Recetas e insumos de cocina** (F8-03, F8-04, F8-09): **después del piloto** (M-15, V-7); no
  cuenta en la ruta. ADR-023 supersede la descarga al marcar LISTO de ADR-012: su disparador será otro ADR.

- [x] **B6-7 · Varias cuentas en una mesa y cuentas de pie** (M-27, P-2, P-3).
  → Una mesa admite varias cuentas abiertas, cada una con su nombre (cambia I-05); el mesero elige a cuál pide y la
  comanda la nombra; cada una se cobra, se vincula y se libera por separado. El mesero abre una cuenta de pie, sin
  mesa, y le pide igual. El plano lee la ocupación del servidor (las cuentas abiertas de cada mesa), no del bus.
  *Hecho el 2026-10-07 (LuAMi), v0.61.0.* **Contratos:** la cuenta lleva `comensales` y `dePie` (de mostrador, sin mesa
  ni niños); `AbrirCuentaDelSalonCommandSchema` (sentar: `cuentaId` de la tablet, mesa o ninguna, nombre, personas y
  `vistas`, las cuentas que veía la tablet); el pedido y el vínculo nombran su `cuentaId` (obligatoria si la mesa tiene
  varias) y la salida «A una mesa» también; `PedidoDto` con `tableId` nulo de pie y `nombreCuenta`; `CUENTAS_POR_MESA` = 6.
  **Aplicación:** `casosMesas.abrir` (`pedido.tomar`, candado de las mesas, reintento por id, auditado `cuenta.abrir`);
  `mesaParaCuentaNueva` admite una más solo sobre lo visto, con nombre distinto y hasta seis, y sin `nueva` sigue
  exigiendo la mesa libre (dos tablets que piden a la vez en una mesa vacía no abren dos); `cuentaDeMesaPara` elige la
  cuenta de un pedido, un vínculo o una salida; `cuentasDeLasMesas` y `cuentasDePieEn` sustituyen a `mesasOcupadasEn`.
  La comanda y el papel «ANULAR» llevan «MESA 3» o «DE PIE» y, debajo, el nombre de la cuenta (`rotuloDePedido`). Una
  cuenta de pie se libera sin consumo como una mesa y no es un borrador de mostrador aunque nazca vacía. Migración
  `20261104000000_cuentas_del_salon` (solo expande: `kitchen_order.table_id` admite nulo, `account_label` nueva y su
  CHECK dice las dos cosas). 20 pruebas nuevas contra la base (`salon.test-db.ts`) y 2 del dominio. **Web:** el plano y
  el salón leen la ocupación de las cuentas (del bus queda solo «por limpiar»): sentar con nombre y personas, las cuentas
  de la mesa como opciones con «Otra familia», «De pie» encima del plano y en «Atender», la mesa compartida con su
  número de cuentas en el plano; vincular desde la sala y la salida «A una mesa» eligen la cuenta de la familia; la caja,
  Inicio y las ventas nombran «Mesa 3 · Familia Pérez» o «De pie · Sr. Luis», y la mesa queda por limpiar solo al cobrar
  su última cuenta. Visto en el navegador en la base de pruebas (sentar, segunda familia, nombre repetido rechazado,
  pedido a la segunda con su comanda, de pie, liberar una y la otra sigue, la caja) a 1366×768, 1280×800, 800×1280 y 390
  px, en los dos temas, sin desplazar la página ni errores de consola.*
- [x] **B6-8 · Tiempo de atención en el salón** (M-27, P-19; D-SERV decidida: el mesero marca «Servido»).
  → Administración ve, por cuenta del salón, cuánto lleva sentada, cuánto sin pedir y cuánto esperando lo pedido,
  con aviso de las que pasan del umbral; el día deja su resumen (espera media y máxima).
  *Hecho el 2026-10-07 (LuAMi), v0.73.0.* **Dominio** (`@l2/domain-orders`, `atencion.ts`, puro): `atencionDeCuentas`
  (sentada, sin pedir mientras no hay pedido, esperando desde el pedido sin servir más viejo; aviso «esperando» antes que
  «sin pedir»; lo anulado no espera) y `resumenDeEspera` (media y máxima de lo servido, redondeadas igual, y cuántos
  sin marcar); 4 pruebas. **Base** (`20261109000000_pedido_servido`, solo expande): `kitchen_order_served`, uno por
  pedido, solo agregar. **Contratos:** `servido` en el pedido, `ServirPedidoCommandSchema` y los umbrales
  `atencionSinPedirMin` (15) y `atencionEsperaMin` (20) en los ajustes. **Aplicación:** `pedidos.servir` (quien toma
  pedidos; una vez: otra tablet lee el que ya está; el asiento `pedido.servir` lleva la espera), tema «pedidos»; 2
  pruebas contra la base. **Web:** en la tablet, cada pedido dice «Esperando · N min» (en aviso al pasar el umbral) con
  su botón «Servido», y luego «Servido a las … · esperó N min»; «Atender» suma «Espera su pedido» y «Sin pedir»; Restaurante
  → Atención en el salón (administración y supervisión) con las cifras del día y cada cuenta, en vivo; los umbrales en
  Ajustes → Sucursal; su página en el manual. Visto en el navegador en la base de pruebas, en los dos temas: «Atender»
  con sus avisos; un pedido de 186 min marcado servido en la tablet («esperó 186 min»); la pantalla de administración
  con 9 cuentas, la que espera su pedido primero, y la espera del día.*

### Etapa 10 · Eventos: cumpleaños (M-15, V-10)

- [x] **B10-1 · Reservas con agenda y anticipo**: fecha y horario, cliente (del directorio de familias),
  número de niños invitados y paquete (el alquiler como servicio y los productos que incluye) con su
  precio; cada paquete lo carga administración con su **mínimo y máximo de invitados** (nunca por encima
  del aforo). El **anticipo es el 50 % del paquete**, configurable (D-EVT), y se cobra en la caja contra la **cuenta del evento** (en el libro y con su venta) y
  el saldo queda para el día. Parque → Eventos; Inicio y la apertura del turno avisan «Hoy hay un evento».
  → Un anticipo cobrado sale en el turno en que se cobró; devolverlo es anular su cobro (DEC-24).
  *Hecho el 2026-10-03 (v0.47.0). **Dominio:** `anticipoDe`, `reservaProblem` (fecha, horario, invitados del paquete y
  aforo del horario con los eventos que se solapan), `paqueteSobreAforo` (parque, 12 pruebas); la cuenta `EVENTO` en
  caja: ninguna pantalla la abre ni la cambia (`EVENTO_DESDE_LA_PANTALLA`), el anticipo no se regala, no se descuenta
  ni se da por incobrable, y `cancelReservationProblem`/`cancelReservation` (5 pruebas). **Contratos:** `reservas.ts`
  (catálogo, reserva, agenda, cancelar); `AccountKind` y la línea `EVENTO`, `eventId`; tema en vivo `eventos`.
  **Base:** `event_catalog_version` y `event_reservation` (solo-agregar, RLS), causas `RESERVA` y `CANCELAR_RESERVA`
  (migración `20261027000000_cumpleanos`, aplicada en `l2control_test` y, el 2026-10-03, en la base del
  cliente). **Aplicación:** `park/eventos.ts` (leer/publicar catálogo con los nombres del catálogo de
  productos y el aforo del tarifario, agenda, de hoy, reservar con la cuenta del anticipo en la cola, cancelar);
  permiso `evento.reservar`; 14 pruebas en `eventos.test-db.ts`. El estado de la reserva sale de su cuenta: en la
  cola, por cobrar; cobrada, confirmada; sin consumo, cancelada. **Web:** Ajustes → Cumpleaños (patrón M-17), Parque →
  Eventos (agenda, hoja de reserva con horas en el formato del local, cancelar), chip en Inicio y tarjeta en la
  apertura del turno (si falla la lectura, el aviso no sale y no tumba la pantalla); la caja la llama «Cumpleaños» y no
  ofrece ítems, partes, cortesía ni descuento. Navegador en la base de pruebas a 1366×768, 1280×800 y 800×1280. Fuera,
  para cuando se pida: cambiar la fecha de una reserva (hoy se cancela y se reserva otra) y el día del evento (B10-2).*
- [x] **B10-2 · El día del evento**: los invitados entran con pulseras a la cuenta del evento (cuentan en
  el aforo), el paquete descuenta sus productos (ADR-023) y el saldo se cobra en la caja; la cuenta del
  evento sale en los pendientes del cierre hasta cobrarse.
  → Un evento de punta a punta en el sistema real: reserva, anticipo, entrada de invitados y saldo.
  *Hecho el 2026-10-03 (v0.48.0). **Dominio de caja:** la cuenta del día (`eventDay`) se cobra como una mesa
  (`registerExit` no la reabre ni la cierra por salir invitados), su saldo no se regala pero sí es incobrable con
  todos fuera; la del anticipo sigue sin serlo (4 pruebas). **Contratos:** `FamilyAccount.eventDay`, estados
  `EN_CURSO`, `SALDADA` y `SALDO_INCOBRABLE`, `ReservaEvento.dia` (cuenta, entraron, dentro), `AgendaEventos.ahora`
  (minuto del local), `EmpezarEventoCommand` y `EntradaEventoCommand`. **Base:** `event_day` (solo-agregar),
  causa `EMPEZAR_EVENTO` (`20261028000000_dia_del_evento`) y `park_session.event_reservation_id`: solo el invitado de
  un cumpleaños va a precio cero (`20261028000001_invitados_del_evento`); las dos aplicadas también en la base del cliente.
  **Aplicación:** `eventos.empezar` y `eventos.entrarInvitados` con `diaDelEvento` (su día, anticipo cobrado, antes
  del fin, lo incluido con `comprobarExistencias`); las comprobaciones de pulseras y aforo salen de `entrar()` a
  `comprobarPulserasYAforo` y las usan las dos entradas; recargar y vincular a una mesa se niegan para un invitado; 6
  pruebas nuevas en `eventos.test-db.ts`. **Web:** «Empezar el cumpleaños» y la línea del día en la agenda, «Entran
  a» en la entrada, la salida de un invitado sin cargo y sin llevar a la caja. Navegador en la base de pruebas a
  1366×768, 800×1280 y 390×844. **A confirmar con el cliente:** que los invitados no paguen tiempo de más al pasarse
  de la hora del evento (hoy, «en gracia» como aviso, sin cobro) y que los que sobran de lo reservado entren como
  visita normal.*

### Etapa 11 · Reportes (F9, M-29)

Una sección **Reportes** para administración y supervisión (`reportes.verSucursal`), de solo lectura: sale de los
asientos (el libro de pagos, los movimientos de stock, los cierres), cuenta por día de negocio de Caracas, cada pago en
su moneda con la tasa con que se cobró, y un día con su Z cerrado da siempre lo mismo. Cada informe con su periodo (hoy,
ayer, semana, mes, rango), sus filtros, su tabla y su **PDF**: una vista de impresión A4 con el encabezado (local,
periodo, quién y cuándo), los totales y el número de página, que el navegador guarda como PDF o imprime (sin Excel,
decisión del usuario). Excepciones, parque frente a restaurante, más vendidos y margen: después del piloto (F9-02 a
F9-05).

- [x] **B11-1 · La sección Reportes y las ventas** (M-29, F9-01).
  → Reportes → Ventas del día o de un rango: por medio de pago y moneda, por origen (parque, restaurante, mostrador,
  cumpleaños) y por cajera y turno, con lo anulado aparte; los totales cuadran con los cierres Z del periodo. Su PDF.
  *Hecho el 2026-10-08 (v0.77.0), en `feat/b11-1`.*
  *· Dominio (`@l2/domain-cash`, `reporte.ts`): el origen de una venta por la cuenta en que se cobró, cada asiento en
  dólares con la tasa con que se cobró (ADR-005; en bolívares sin tasa no se inventa), el cuadre de un turno con su Z en
  palabras y los periodos de un toque (hoy, ayer, esta semana, este mes y el anterior). 4 pruebas.*
  *· Contrato: `ConsultaDeVentasSchema` (hasta 93 días y, si se quiere, una cajera) e `InformeDeVentasSchema` (resumen,
  por medio y moneda, por origen, por cajera, por turno con su cuadre, lo anulado y el encabezado del PDF).*
  *· Aplicación: `reportes.ventas` (`reportes.verSucursal`, solo lectura) calcula cada turno con lo mismo que su corte
  (`libroDelTurno`, `porMedioDe`, `ventasYExcepciones`): un turno con su Z da lo mismo que su Z y, si no, dice qué no
  cuadra. 6 pruebas contra la base.*
  *· Web: el módulo Reportes del panel (Ventas; Inventario al momento y Movimientos, pendientes). Reportes → Ventas con
  los periodos de un toque, un rango y la cajera en la dirección (el enlace se guarda o se comparte), cuatro cifras
  (vendido, cobrado, anuladas y cierres Z) y una sección por pestaña; se relee sola con cada venta o cierre. Su PDF en
  `/informes/ventas`: una hoja A4 en blanco y negro con todas las secciones, el encabezado (local, periodo, quién y
  cuándo) y el número de página, que el navegador imprime o guarda como PDF. Las piezas (`informe.tsx`: la tabla, el
  documento A4) son las de B11-2 y B11-3.*
  *· Decidido al construir: el origen es la cuenta en que se cobró (familia → parque, mesa o de pie → restaurante,
  mostrador, evento → cumpleaños); separar parque y restaurante línea por línea dentro de una cuenta es F9-03, después
  del piloto. El periodo va por día de negocio y cabe en 93 días (más, se parte). El PDF es la impresión del navegador,
  sin librería en el servidor.*
  *· Comprobado: en el navegador, contra la base de pruebas: el mes con 15 ventas en 5 turnos (los 2 con su Z cuadran),
  por medio, origen, cajera y turno, el filtro de cajera, un rango de más de 93 días rechazado con su mensaje y el PDF
  de una página con su número; a 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas, sin desplazar en el
  escritorio, sin desbordes ni errores de consola.*
- [x] **B11-2 · Inventario al momento** (M-29).
  → Existencia y valor al costo por categoría y producto, lo bajo mínimo, lo agotado y lo sin contar, a la hora en que
  se pide. Su PDF.
  *Hecho el 2026-10-08 (v0.80.0), en `feat/b11-2`.*
  *· Contrato: `InformeDeInventarioSchema` (resumen, por categoría y por producto: existencia, mínimo, costo promedio,
  valor al costo, estado y si está retirado).*
  *· Aplicación: `reportes.inventario` (`reportes.verSucursal`, solo lectura), a la hora en que se pide: la existencia y
  el valor son la suma de los movimientos (B9-2, B9-3), el costo promedio el de Productos (`averageUnitCostMinor`) y el
  estado la misma regla (`stockStatus`). Un producto retirado con existencia sigue contando; uno retirado sin nada, no.
  2 pruebas contra la base.*
  *· Web: Reportes → Inventario al momento con cuatro cifras (valor al costo, agotados, bajo mínimo y sin contar), que
  filtran, el filtro por estado y por categoría, y una tabla por categoría con su total; se relee sola cuando cambia la
  existencia. Su PDF en `/informes/inventario` lleva el filtro puesto (`?estado=…&categoria=…`). El manual, al día.*
  *· Comprobado: en el navegador, contra la base de pruebas: 17 productos en 5 categorías, $ 13,10 al costo, 1 agotado y
  13 sin contar; el filtro de agotados y el de categoría, y el PDF con y sin filtro; a 1366×768, 1280×800, 800×1280 y
  390 px, en los dos temas, sin desbordes ni errores de consola.*
- [x] **B11-3 · Movimientos (kárdex)** (M-29).
  → Por producto (o categoría) y periodo: cada entrada, venta, salida, ajuste y conteo con su fecha, quién, el motivo y el
  saldo después de cada uno; el saldo final es la existencia. Su PDF.
  *Hecho el 2026-10-08 (v0.79.0), en `feat/b11-3`.*
  *· Dominio (`@l2/domain-inventory`, `kardex.ts`): `conSaldo` (cada movimiento con el saldo que deja, en orden de
  instante y de llegada) y `resumenDeKardex` (lo que entró, lo que salió y el saldo final). 3 pruebas.*
  *· Contrato: `ConsultaDeMovimientosSchema` (periodo de hasta 93 días y un producto o una categoría; sin ninguno, solo lo
  que se puede elegir) e `InformeDeMovimientosSchema` (por producto: al empezar, cada movimiento con quién, quién
  autorizó, el detalle y el saldo, al terminar y la existencia de ahora).*
  *· Aplicación: `reportes.movimientos` (`reportes.verSucursal`, solo lectura). El periodo va por días del local (de su
  medianoche a la del día siguiente al último); el saldo al empezar es la suma de lo de antes. Además de
  `stock_movement`, lo que pasó sin mover nada: el conteo que cuadró y el inventario inicial en cero. Una entrada dice
  de dónde vino (compra, proveedor, factura, bultos), una salida su motivo y quién la autorizó, un conteo qué se esperaba
  y qué se contó, y una venta dónde se vendió (la mesa, el parque, el mostrador o un cumpleaños), nunca a quién. 5
  pruebas contra la base.*
  *· Web: Reportes → Movimientos con el periodo (el filtro de periodo es ahora una pieza común con Ventas), el producto
  (por categoría) o la categoría en la dirección; con una categoría, un renglón por producto y el kárdex del que se
  toque (se abre el que se movió); cuatro cifras (al empezar, entraron, salieron, al terminar) y la tabla con el saldo.
  Se relee sola cuando cambia la existencia. Su PDF en `/informes/movimientos`: el resumen de la categoría y el kárdex de
  cada producto. El manual de Reportes, al día.*
  *· Decidido al construir: el kárdex va en unidades de venta (el valor al costo es de B11-2); una venta no nombra a la
  familia (el lugar basta para el kárdex y el PDF circula).*
  *· Comprobado: en el navegador, contra la base de pruebas: sin elegir (lo que se puede elegir), Bebidas del mes (4
  productos; Agua mineral con 20 que entraron y 9 ventas en mesas, mostrador y cumpleaños, saldo 11 = existencia), un
  producto y el PDF de la categoría; a 1366×768, 1280×800, 800×1280 y 390 px, en los dos temas, sin desbordes ni
  errores de consola.*

### Etapa 7 · Staging en VPS

- [x] **B7-1 · VPS con Docker, HTTPS y dominio**; despliegue reversible y migraciones ensayadas antes
  (F1-15, §10.3). Usa el despliegue de T-8a. Sin dominio comprado (M-22): `<ip-con-guiones>.sslip.io` con Let's Encrypt.
  *Hecho el 2026-10-07 (LuAMi), v0.54.0:* VPS Ubuntu 24.04 (4 CPU, 8 GB, 2 GB de swap; ufw con 22, 80 y 443; Fail2ban;
  root sin SSH) con Docker 29; usuario `luami` en el grupo `docker`, repositorio en `~/l2control` y `.env` generado allí
  (`desplegar.sh --claves`, permisos 600). `https://217-216-48-54.sslip.io` con Let's Encrypt (hasta el 2027-01-04, lo
  renueva Caddy), `http` redirige a `https`, y solo escuchan 22, 80 y 443 (la base, Valkey, la web y el worker no se ven
  desde fuera). Despliegues: 0.53.0 (primera, base vacía, 47 migraciones); 0.53.1 con la comprobación forzada a fallar →
  vuelta a la 0.53.0; 0.53.1 → en marcha. Desde esta PC se entra con `ssh l2vps` (llave propia del despliegue).
  Cuidado al medir desde la PC de desarrollo: su red da por abierto cualquier puerto; se mira en el VPS con `ss -tln`.*
- [x] **B7-2 · Datos maestros reales** cargados con semillas (F0-04, F1-16; M-24).
  → Ajustes → Semilla descarga la configuración del local en un archivo (ajustes de la sucursal, tarifas y paquetes,
  la carta con sus categorías y precios, el plano y los cumpleaños) y carga la de otro: enseña qué trae y qué falta, y
  solo añade lo que falta, sin pisar nada. El staging recibe la del local y queda con su plano, su carta, sus
  cumpleaños y sus tarifas sin teclearlos otra vez. Con confirmación de identidad y auditado.
  *Hecho el 2026-10-07 (LuAMi), v0.57.0, con T-10:* contrato `SemillaSchema` (formato `l2-semilla`, versión 1; lo que
  incluye un paquete de cumpleaños va por el nombre del producto) e `InformeDeSemillaSchema`; `sucursal/semilla.ts`
  (exportar: lo publicado y lo que está a la venta con su precio de hoy; cargar: revisa sin escribir o carga, parte por
  parte por sus mismos casos de uso, solo lo que falta, con un resumen `semilla.cargar`; un producto con un código ya
  usado aquí entra sin él); 7 pruebas contra la base. Ajustes → Semilla del local: descargar, elegir archivo, el informe
  (entra, ya está, no la trae, con sus avisos) y «Cargar lo que falta». La base del local se migró (49 de 49, respaldo en
  `C:/tmp/l2-respaldos/l2control-2026-10-07-antes-semilla.dump`) y su semilla trae ajustes, 4 paquetes, 10 categorías,
  12 platos, el plano de 8 mesas y 6 cumpleaños: cargada en el ensayo, plano, carta, cumpleaños y tarifas quedaron como en
  el local, y cargarla otra vez dice «ya está» en todo. **Falta cargarla en el staging** (la carga la hace administración
  desde su sesión).
- [ ] **B7-3 · Medición con red real**: carga, error y degradación con latencia de verdad (RIE-13); la
  app en el teléfono de la monitora, la tablet del mesero y la laptop de caja reales, también por el 4G
  de respaldo (T-5, M-15); los 12 tamaños otra vez. *El agente de impresión ya está empaquetado e instalable
  (adelantado el 2026-10-01, v0.39.1): aquí queda instalarlo en la laptop real y medirlo.* Con T-8c (hecho y ensayado en
  una PC con Windows): comprobar en la laptop de caja real que se actualiza sola (una versión nueva publicada, con la
  cola vacía) y que vuelve a la anterior si la nueva no arranca.
- [x] **B7-4 · Respaldos**: volcado diario cifrado fuera del VPS y una **restauración ensayada**
  (F10-04, F10-05). Fuera del VPS = una PC del local que lo baja (M-26).
  *Hecho el 2026-10-07 (LuAMi), v0.59.0:* `backup_copy` (cada noche, HECHO o FALLIDO con su motivo; nada se borra: la
  retención del servidor pone `removed_at`) y `backup_receiver` (la PC del local: nombre y huella SHA-256 de su
  credencial; una en uso, preparar otra retira la anterior), con RLS y la aplicación limitada por columnas a anotar la
  bajada, retirar la PC y su última conexión. `@l2/application` `respaldos`: `estado` (de peor a mejor: sin respaldos,
  fallido, atrasado >26 h, sin PC o sin bajar >36 h, al día), `prepararPc`/`retirarPc` con elevación, y para la PC
  `entrarPc` (la reconoce por la huella de su credencial) → `indice`, `copia`, `acusar` (solo con la huella del archivo
  correcta); 6 pruebas. Web: `/respaldos/indice`, `/respaldos/archivo/<nombre>` y `/respaldos/acuse` con
  `Authorization: Bearer` (sin sesión: es una tarea programada), Ajustes → Respaldos y el chip de Inicio, y
  `/descargas/l2-respaldos.ps1` (PowerShell 5.1, sin instalar nada ni ser administrador: tarea a las 7:00 am y al entrar,
  credencial con DPAPI, huella, acuse y escalera 30/12/mensuales). `infra/produccion/respaldar.sh` (cron 3:15 am:
  instantánea exportada, `pg_dump --snapshot` y la huella en la misma transacción, `.tar` cifrado con `openssl cms`
  AES-256-GCM para `respaldo-destinatario.pem`, siete en el servidor, el resultado con su asiento), `restaurar.sh`
  (`--clave-nueva`; el ensayo descifra, restaura en un PostgreSQL limpio con los papeles de `infra/postgres/init` y
  compara la huella; `--volcado` para levantar un servidor nuevo) y `huella.sql`. Visto en el ensayo local con la
  0.59.0: un respaldo de 461 KB en 2 s, el panel sin PC (aviso y chip), la PC preparada con elevación (orden y credencial
  una vez), la tarea registrada sin ser administrador, la primera pasada y una segunda con un respaldo nuevo, las dos
  bajadas anotadas, la escalera (una por semana y por mes) y la tarea quitada; el panel al día en claro y en oscuro. La
  restauración, **íntegra en 4 s** (66 tablas, 436 filas; la base del ensayo no tenía pagos); un respaldo con un byte
  cambiado y una frase equivocada no se abren. Salió en el ensayo: el primer respaldo falló (una tubería no recibe el
  descriptor del coproceso) y quedó anotado como FALLIDO, con su aviso; en el programa de la PC, la credencial guardada
  no se leía (salto de línea final) y `$Diarios` y `$diarios` eran la misma variable. Y el editor marcaba una clave
  repetida en `compose.yml` (un ancla dentro de `<<:`; Docker lo aceptaba): ahora el entorno común es `x-entorno-app`.
  **En el staging (2026-10-07):** clave pública copiada (la privada y su frase, fuera del servidor), primer respaldo
  (452 KB) y cron; ese respaldo, bajado y restaurado en una base limpia: íntegro en 5 s. Sin credencial, las rutas de
  la PC responden 401. Falta que administración prepare la PC del local desde el panel.*
- [x] **B7-5 · Revisión de seguridad** contra PLAN §7 y auditoría de dependencias (F10-06, F10-09).
  *Hecho el 2026-10-07 (LuAMi), v0.60.0.* **Matriz §7.3:** `matriz-del-plan.test.ts` copia la tabla del PLAN (no la
  deriva de `MATRIZ`) y comprueba las 33 acciones × 6 roles: cada ❌ es DENEGADO y no se ofrece pedir autorización,
  cada 🔐 pide autorización, cada ✅ pasa, y en otra sucursal todo se niega; las seis acciones que llegaron después
  van con su decisión, y una acción nueva sin fila falla. Las que no tienen comprobación en el servidor son las que no
  existen todavía (nota de crédito, reabrir mesa, extender sin cobro, KDS retirado, cámaras, reportes de todas las
  sucursales) o no llegan al servidor (anular lo no enviado: el borrador del mesero); van en §5. **Aislamiento:** la
  prueba del catálogo (`aislamiento.test-db.ts`: toda tabla con `tenant_id` con RLS forzada y sus cuatro políticas)
  pasa con todas las tablas. **Secretos:** gitleaks sobre los 290 commits: tres hallazgos revisados (dos claves de prueba
  y el secreto TOTP de la semilla de desarrollo que T-4 retiró; no abren ningún entorno real), anotados en
  `.gitleaksignore`; GitGuardian sigue en el CI. **Escaneo estático:** Semgrep (OWASP Top 10, TypeScript, React, Next,
  Node, secretos, Docker) sobre 619 archivos; un hallazgo real, corregido: el descifrado AES-GCM aceptaba una etiqueta
  recortada (ahora 16 bytes y un IV de 12, con su prueba); el resto, la cadena de suministro de pnpm, puesto.
  **Dependencias (F10-09):** Next 16.3.4 → 16.3.7 (ejecución remota en `next/og`, que dibuja los iconos;
  GHSA-vcvr-r3jv-pc5j) y `mysql2`, `sharp`, `source-map-js` y `fast-uri` en su versión corregida (`overrides`);
  aceptado `deepmerge-ts` (GHSA-ggr8-5vv4-36mx: solo fusiona nuestro `prisma.config.ts`). `pnpm audit --audit-level
  high` limpio y en el CI; `minimumReleaseAge` de siete días, `trustPolicy: no-downgrade` (salió que la herramienta
  `prisma@7.10.0` se publicó sin procedencia; revisado y exceptuado con su porqué) y `blockExoticSubdeps`. **§7.2 y
  §7.6:** cabeceras nuevas en Caddy (`frame-ancestors 'none'`, `X-Frame-Options`, `Permissions-Policy` solo con la
  cámara, `Cross-Origin-Opener-Policy`), que `desplegar.sh` recarga en cada versión; consultar los contactos de los
  representantes queda auditado (cuántos, no cuáles). Ya estaban: Argon2id y bloqueo creciente para el PIN y el
  código de instalación, cookies `httpOnly`/`secure`/`lax`, mensajes del canal validados con Zod, redacción de logs
  con prueba. Visto en el ensayo con la 0.60.0: los iconos, entrar, seis pantallas, la cámara permitida, la
  geolocalización negada y el sistema que no se deja incrustar. Queda una decisión (§4, D-REIMP) y lo de §5.
  **Corrección (v0.60.1):** en el staging, la 0.60.0 entró sola pero sin las cabeceras: el contenedor de Caddy monta el
  `Caddyfile` y `git pull` lo reemplaza por otro archivo, así que dentro seguía el viejo (en Windows, Docker Desktop no
  lo reproduce). `desplegar.sh` compara el de dentro con el del disco y, si difieren, recrea Caddy. En el staging se
  recreó a mano y las cabeceras ya salen.*
- [x] **B7-6 · Respaldos con carpeta, fijados e integridad a la vista** (M-29).
  → Al preparar la PC se elige la carpeta (un disco externo o una carpeta sincronizada con la nube: una copia fuera del
  local). Un respaldo se puede **fijar** con su nombre («antes de producción») y la escalera nunca lo borra. Ajustes →
  Sistema → Respaldos dice de cada uno si su huella se comprobó al bajarlo, y el servidor ensaya cada semana la
  restauración del último en una base de usar y tirar: «ÍNTEGRO» o qué falló, en el panel y en Inicio.
  *Hecho el 2026-10-08 (v0.76.0), en `feat/b7-6`.*
  *· Base: `20261111000000_respaldos_con_control` (solo expande): `backup_pin` (fijar con su nombre; se suelta una vez,
  no se borra ni se rebautiza; uno vigente por respaldo), `backup_rehearsal` (el ensayo: íntegro o qué falló, con sus
  segundos; solo-agregar) y en `backup_receiver` la carpeta, su tipo (EN_LA_PC, EXTERNO, NUBE) y la versión del
  programa de la PC, que la aplicación solo puede escribir en esas columnas.*
  *· Contrato: los niveles `NO_INTEGRO` y `SIN_ENSAYO`; la copia trae su fijado y su ensayo; el estado, el último ensayo y
  los fijados vigentes; el índice de la PC, el nombre del fijado; `FijarRespaldoCommandSchema`, `SoltarRespaldoCommandSchema`
  e `InformeDeLaPcSchema` (lo que la PC dice de sí misma).*
  *· Aplicación: `respaldos.fijar` y `soltar` (`sistema.actualizar`, con elevación; lo que el servidor ya quitó no se
  fija); `entrarPc` anota la carpeta, su tipo y el programa; `clasificar` pone el ensayo que no salió íntegro tras lo
  atrasado y avisa sin ensayo en ocho días. 11 pruebas contra la base (5 nuevas).*
  *· Servidor: `respaldar.sh` ensaya una vez por semana (o con `--ensayar`) el volcado de esa noche, antes de cifrarlo, en
  un PostgreSQL de usar y tirar sin red, y anota el resultado con su asiento; la retención no quita los fijados.*
  *· La PC (`l2-respaldos.ps1`, programa 2): la carpeta se elige al prepararla (`-Carpeta`), dice su tipo, su ruta y su
  versión en cada pasada, y copia los fijados a `fijados\`, que la escalera no toca; con un disco externo desconectado no
  crea una carpeta vacía en su lugar.*
  *· Web: Ajustes → Respaldos con la cifra «Ensayo de restauración» (ÍNTEGRO o NO ÍNTEGRO), la carpeta de la PC (aviso si
  es la misma PC o su programa es viejo), «huella comprobada» en lo bajado, «Fijar» y «Soltar»; preparar una PC elige
  entre disco externo, carpeta en la nube o Documentos, y la orden lleva esa carpeta; Inicio dice «Respaldo ÍNTEGRO» o qué
  falló.*
  *· Decidido al construir: el servidor no puede descifrar sus respaldos (la clave privada no está), así que el ensayo
  semanal restaura el volcado antes de cifrarlo; que el cifrado llegó entero lo comprueba la huella en la PC, y el ensayo
  completo descifrando sigue siendo `restaurar.sh` en la PC del técnico. Un ensayo que no pudo ni arrancar cuenta como «NO
  ÍNTEGRO», con su motivo (fail-closed).*
  *· Comprobado: en la pila de ensayo local, `respaldar.sh --ensayar` dio «ÍNTEGRO en 4 s: 68 tablas, 471 filas»; sin la
  marca no volvió a ensayar en la misma semana, y con la retención en 1 quitó todo menos el más nuevo y el fijado. El
  programa de la PC, sin errores de sintaxis, con sus tipos de carpeta y los fijados probados sueltos. En el navegador,
  contra la base de pruebas: el ensayo ÍNTEGRO, la carpeta de la PC, fijar «antes de producción» confirmando la
  identidad y soltarlo, preparar una PC con la carpeta en la nube, e Inicio con «Respaldo ÍNTEGRO»; a 1366×768, 1280×800,
  800×1280 y 390 px, en los dos temas, sin desbordar ni errores de consola.*
- [x] **B7-7 · La semilla con casillas** (M-29).
  → Exportar la semilla enseña lo que lleva, con casillas (cada sección y cada producto: los «Prueba…» se desmarcan), y
  además de ajustes, tarifas, categorías, carta, plano y cumpleaños lleva medios de pago, descuentos, impuestos e
  impresoras. Importarla en una base nueva enseña lo mismo antes de cargar. Personas, PIN, llaves y equipos no viajan:
  se dan de alta en la base nueva. Es el camino de la corrida limpia de producción.
  *Hecho el 2026-10-08 (v0.75.0), en `feat/b7-7`.*
  *· Contrato: la semilla pasa a la versión 2 (la 1 se sigue leyendo: lo nuevo llega en `null`) con `medios` (cada medio
  por su código, los datos de Pago Móvil y Zelle y los terminales), `descuentos` (las reglas vigentes, sin familias VIP),
  `impuestos` (lo que rige, sin día, y lo programado, con el suyo) e `impresoras`; el informe trae los `elementos` que
  entrarían de cada lista; `elementosDeSemilla` y `recortarSemilla` (las casillas: una parte desmarcada no viaja y una
  lista vacía tampoco). 5 pruebas.*
  *· Aplicación: `semilla.exportar` y `semilla.cargar` con las cuatro partes nuevas, cada una por su caso de uso (y en su
  orden: ajustes, impuestos, medios, tarifas, catálogo, descuentos, plano, cumpleaños, impresoras). Los impuestos entran
  solo en un local sin ninguno; de los medios entra lo nuevo, los datos que faltan y los terminales, y se enciende lo
  nuevo y lo que estaba apagado porque le faltaban los datos que ahora llegan; un descuento no empieza en el pasado ni
  entra si terminó o le falta su medio; las impresoras entran apagadas. 11 pruebas contra la base (5 nuevas).*
  *· Web: Ajustes → Semilla del local: «Preparar semilla» abre lo que lleva con casillas por parte y por elemento (lo de
  prueba desmarcado) y «Descargar lo marcado»; al cargar, el informe con las mismas casillas y «Cargar lo marcado».*
  *· Decidido al construir: los datos de los medios (Pago Móvil, Zelle, terminales) viajan porque son los que el cliente
  ve para pagar, con su casilla para dejarlos fuera; las familias VIP no viajan (son clientes); los impuestos no se mezclan
  con un calendario que ya exista.*
  *· Comprobado en el navegador, en la base de pruebas: el previo marca 12 de 21 productos (los 9 «Prueba…», fuera) y el
  archivo descargado no lleva ninguno de prueba; cargar esa semilla con dos productos y una impresora de más enseña solo
  eso para marcar: «Agua B77» entró sin inventario inicial y la impresora desmarcada no. A 1366×768, 1280×800, 800×1280 y
  390 px, en los dos temas, sin desbordar ni errores de consola.*

### Etapa 8 · Producción

- [ ] **B8-1 · La red del local** ([ADR-021](adr/021-servidor-en-la-nube.md), D-INF decidido en M-15): internet
  principal y router 4G de respaldo con conmutación automática, UPS en router, módem y WiFi, y los equipos
  del local aprobados (F10-03).
  → Con el enlace principal desconectado, la caja cobra y la sala se actualiza por el 4G.
- [~] **B8-2 · Runbooks, contingencia en papel y capacitación por rol** (F10-10, F11-02, F11-03, F11-08; sin
  manual aparte desde M-30: el de la app es el manual). *A cargo: LuAMi. Lo escrito, hecho (v0.86.1); queda la
  capacitación por rol, en B8-3, y ahí se cierra.*
  → Una hoja impresa junto a la caja con el procedimiento en papel para cuando caigan los dos enlaces (cuándo se pasa
  al papel, quién anota qué y cómo se carga al volver; los formularios y su carga son B3-7). Los runbooks del técnico,
  juntos y completos a partir de `infra/produccion/README.md`: restaurar un respaldo, volver atrás una actualización,
  aprobar el equipo que sustituye a uno perdido (siempre dos equipos de administración aprobados, M-7), cambiar la
  impresora y cargar los feriados de cada año. La capacitación de cada rol, durante B8-3, con los recorridos de la app.
  *Lo escrito, hecho el 2026-10-08 (v0.86.1), en `docs/b8-2`:*
  *· **El procedimiento en papel:** `/procedimiento-papel` (`ProcedimientoDePapel`), una hoja A4 para pegar junto a la
  caja: cuándo se pasa al papel (los dos internet caídos más de 5 minutos, quién lo decide y la hora del corte), quién
  anota qué (entrada, caja, mesero, pagos sin efectivo), cómo se carga al volver (Caja → Papel, el orden y la revisión
  de supervisión) y a quién se llama (las líneas se llenan a mano). Se abre desde Caja → Papel («El procedimiento») y
  desde los formularios; la ayuda tiene la entrada «Carga desde papel» con sus avisos. Al imprimir, el fondo de la
  página ya no se cuela bajo la hoja (tampoco en los formularios).*
  *· **Los runbooks del técnico:** `infra/produccion/RUNBOOKS.md`, desde el README: restaurar un respaldo (el ensayo de
  cada mes y el servidor perdido), volver atrás una actualización, el equipo que sustituye a uno perdido (con el punto
  de cobro, el agente y la regla de las dos administraciones, M-7), cambiar la impresora y los feriados del año; y,
  por lo hecho hoy, la laptop de caja que no enciende (B3-9), el agente que no imprime (y que se actualiza solo, T-8c)
  y la caída de los dos enlaces. Cada uno con cuándo, qué hace falta, los pasos y cómo se sabe que salió.*
  *· Comprobado en el navegador, en la base de pruebas: la hoja a 1366×768, 1280×800, 800×1280 y 390 px en los dos
  temas, sin desbordes ni errores de consola; su PDF, una sola hoja A4 en blanco y negro; los enlaces desde Caja →
  Papel y los formularios. Versión de corrección (0.86.1), no de paso: B8-2 cuenta al cerrarse con la capacitación.*
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
| ~~F0-04~~ | Datos maestros reales: tarifas, carta, precios y personas | **Hecho:** la base del local los tiene (M-19) y la semilla los lleva a otro local (B7-2); las personas se dan de alta en el panel | B7-2 |
| ~~F0-03~~ | Medidas reales del local para el plano | **Hecho:** el plano v1 es el boceto del cliente (B6-1), y lo cambia desde Ajustes → Plano | B6-1 |
| ~~D7~~ | Quién asigna los puestos de trabajo | **Decidido el 2026-09-28:** salen del rol y del equipo aprobado (`PUESTO_DE_ROL`), sin pantalla de asignación | B1-5 |
| ~~D9~~ | Un niño que sale sin su representante | **Decidido el 2026-09-28:** la salida pregunta «Lo recoge: su representante u otra persona» y, si es otra, su nombre; no bloquea, pero queda constancia. Y una estancia es **huérfana** si sigue abierta desde un día anterior o lleva más de 8 horas: no cuenta en el aforo y la dirección la cierra con motivo, sin tiempo de más | B4-3 |
| ~~D13~~ | Número de orden continuo o diario | **Decidido el 2026-09-28:** continuo, por sucursal (como está) | B3-4 |
| — | Informes del panel ejecutivo (F9-01 a F9-07) | Ventas, inventario al momento y movimientos entran antes de producción (M-29, Etapa 11); excepciones, parque frente a restaurante, más vendidos y margen, después del piloto | — |
| ~~F-12~~ | ¿El teléfono entra en el objetivo? | **Sí (M-15):** la monitora trabaja en un teléfono | B4-5 |
| D-REIMP | ¿Reimprimir un recibo pide 🔐 a la caja? (B7-5) | PLAN §7.3 marca «Reimprimir documento» 🔐 para supervisión y caja; B3-4 lo dejó como copia marcada y auditada, sin autorización, y nadie lo anotó como decisión. **Propuesta:** dejarlo así (el recibo no es un documento fiscal, sale «COPIA», queda en la auditoría y en las excepciones del turno) y anotarlo; o pedir el PIN de supervisión desde la segunda copia | B8-3 |
| F10-09 | Calendario de actualización de dependencias | **Propuesta:** el CI ya rechaza un aviso alto o crítico; además, cada mes (primera semana) una revisión de `pnpm outdated` con parches y menores en una rama, y las mayores como paso propio | B8-3 |
| ~~D-SERV~~ | ¿El mesero marca «Servido»? (M-27, P-19) | **Decidido el 2026-10-07 ([ADR-030](adr/030-el-mesero-marca-servido.md), supersede en parte ADR-022):** sí, un toque «Servido» por pedido en la tablet; si no se marca, el pedido sigue contando como esperando y el informe lo dice | B6-8 |
| ~~D-SOP~~ | ¿Cómo llega un reporte al desarrollo, y qué es lo «inteligente»? (M-27, P-4) | **Decidido el 2026-10-07, como se propuso:** el reporte, con su captura, se queda en el servidor del local y administración lo ve en Ajustes → Soporte; el desarrollo entra con una cuenta de soporte propia (de administración, sin turno) y recibe un aviso por correo sin la captura ni datos del local. Lo «inteligente», sin IA de terceros: ayuda de la pantalla, búsqueda y la solución de cada error conocido por su código. Un asistente con IA (Claude) se puede sumar después: cuesta por uso y saca el texto del servidor | T-11 |
| D-DOM | ¿Dominio propio para producción? (M-22) | Staging va por `sslip.io`, que es de terceros; un dominio propio (unos 10 $ al año) no depende de nadie. Al cambiar, cada persona vuelve a crear su llave de acceso | B8-3 |
| D-REL | ¿Qué entra en la 1.0.0? (2026-10-08) | **Propuesta:** la 1.0.0 es la puesta en marcha (B8-4), con solo lo que el día uno necesita de M-28 y M-29: B9-7 (catálogo sin existencias y su conteo), B7-7 (semilla con casillas para la corrida limpia), B7-6 (respaldos fijados y con integridad), T-17 (cuenta de soporte) y B11-1 (ventas); más B7-3 y T-8c en el local y la Etapa 8. Pasan a la 1.x: T-18, B11-2, B11-3, B9-8, B9-9 y B9-10. Desde la 1.0.0, PATCH = errores (lo que toca dinero, cobro o acceso, el mismo día) y MINOR = mejoras y añadidos, apagados de fábrica con un ajuste: M-10 se enmienda (el MINOR deja de contar pasos) | B8-4 |
| F0-09 | Firma formal del alcance | Las 29 decisiones están cerradas | B8-3 |
| ~~D-CORD~~ | Umbral de cordura de la tasa automática (M-8) | **Decidido el 2026-09-28 (V-14):** sin umbral; la del BCV se aplica siempre, y si la API falla se carga a mano | B5-1 |
| ~~D-FER~~ | Calendario de feriados bancarios de Venezuela | **Decidido el 2026-09-27:** se carga por año desde el panel copiando el calendario de SUDEBAN (cambia cada año: Carnaval, Semana Santa y feriados trasladados) | B2-4 |
| ~~D-INV~~ | Alcance del inventario en el piloto | **Decidido el 2026-09-28 (M-15, V-7):** lo que se vende tal cual y los servicios, con costo promedio; lo que no hay no se vende; insumos y recetas después del piloto | B9-2 |
| ~~D-DESC~~ | ¿Se suman dos descuentos? ¿Tope del manual de supervisión? | **Decidido el 2026-09-28:** uno por cuenta, el mayor (quien autoriza puede elegir otro); tope de supervisión 20 %, configurable | B3-6 |
| ~~D-EVT~~ | Anticipo e invitados de un cumpleaños | **Decidido el 2026-09-28:** anticipo del 50 % del paquete, configurable; mínimo y máximo de invitados por paquete, que carga administración con lo que incluye | B10-1 |
| ~~D-PUL~~ | Formato de las pulseras y lector Bluetooth | **Decidido el 2026-09-28:** el formato se fija con el primer lote (hasta entonces, cualquier código legible); se empieza con la cámara y el lector se compra si hace falta | B4-5 |
| ~~D-GAV~~ | ¿La impresora de caja lleva gaveta de dinero? | **Decidido el 2026-09-28:** no; la gaveta es manual y B5-3 sale de la ruta | — |
| ~~D-AUT~~ | ¿Supervisión puede autorizarse a sí misma un 🔐? | **Decidido el 2026-09-28:** sí en la caja (con PIN y motivo, en la auditoría); no en tasas ni en ajustes de inventario. Como lo aplicó B3-4 | B3-4 |

**Hace el usuario en GitHub** (M-20; los cambios de cuenta y de reglas no los hace Claude: se lo bloquea el sistema de permisos)

| Qué | Cómo | Hace falta antes de |
|---|---|---|
| ~~Proteger `main`~~ | **Hecho el 2026-10-05:** ruleset «main» activo sobre la rama por defecto, sin excepciones: PR obligatorio (0 aprobaciones), check «pnpm verify:db» con la rama al día, historial lineal, fusión por squash o rebase, sin force push ni borrado | — |
| ~~Dar acceso a la segunda persona~~ | **Hecho:** `aemorandin-coder` trabaja y fusiona por PR desde el 2026-10-06 | — |
| ~~Las imágenes en ghcr.io~~ | **No hizo falta:** con el repositorio público, `ghcr.io/luam-lu/l2control-*` se descargan sin sesión (comprobado con la 0.53.0). Si el repositorio pasa a privado, el VPS necesita un token de solo lectura (`read:packages`) | — |
| Repositorio privado | Settings → General → Danger Zone → «Change visibility». **Ojo:** en un repositorio privado con la cuenta gratuita, GitHub no aplica la protección de ramas: hace falta GitHub Pro (unos 4 $ al mes). El CI sigue, con 2.000 minutos al mes gratis. Con el repositorio privado, el VPS necesita un token para las imágenes y el actualizador para la API (§5) | Cuando se decida |
| ~~Borrar las ramas ya fusionadas~~ | **Hecho el 2026-10-05:** solo queda `main`, en local y en GitHub | — |
| ~~Borrado automático de ramas~~ | **Hecho el 2026-10-05:** la rama de un PR se borra sola al fusionarlo | — |

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
| ~~Un código TOTP se puede reutilizar dentro de su ventana de 30 s (elevar y aprobar equipos)~~ | Saldada con T-4: no hay TOTP; el desafío de una llave y cada código de recuperación son de un solo uso |
| ~~El primer administrador y sus credenciales solo se crean por consola (`pnpm credenciales`): una base vacía no arranca sin ella~~ | Saldada con T-4: instalación inicial y enlace de alta desde el panel |
| La columna `totp_secret_enc` de `staff_user` quedó sin uso (T-4 solo expande) | Una migración de contracción, en una versión posterior a la que entre en producción (ADR-028) |
| El nombre «Abby Kingdom» está escrito a mano en el acceso, el menú del panel, las migas de unas 20 pantallas y el manifiesto; la instalación ya pide el nombre del local, pero esas pantallas no lo leen | Antes de un segundo cliente; con uno solo coincide |
| Quien desarrolla necesita una llave de acceso de verdad para confirmar identidad (Windows Hello, el teléfono o el gestor de contraseñas del navegador): ya no hay contraseña ni código fijos de desarrollo | Aceptado (ADR-020). Las pruebas usan el autenticador de software de `para-pruebas.ts` o el virtual de Chromium |
| No hay suite de Playwright en el repositorio: las pruebas de navegador de cada paso se corren a mano (JORNADA §8 las pide de punta a punta) | B7-3, o antes si se decide |
| La IP es la última de `x-forwarded-for`: correcto con UN proxy delante; con dos (p. ej. Cloudflare + Caddy) hay que contar saltos. En desarrollo, sin proxy, se puede falsear | Comprobado en B7-1: delante solo está Caddy. Se vuelve a mirar si se pone otro proxy |
| La medición de interfaz vive fuera del repo (`C:/tmp/pw_test`) | B7-3 (`pnpm audit:ui`) |
| La imagen del worker lleva la CLI de Prisma y TypeScript (dependencias «peer» de `@prisma/client`): 398 MB donde bastarían unos 150 | Cuando pese en el VPS |
| Seguridad (B7-5), la política de contenido no limita scripts ni estilos: Next los pone en línea y hacerlo bien pide un nonce por petición (un `proxy.ts` y todas las páginas dinámicas) | Antes de B8-3, si se decide |
| Seguridad (B7-5), TLS 1.2 sigue aceptado (PLAN §7.2 pide 1.3): el PowerShell 5.1 de una PC con Windows 10 (la de los respaldos) y teléfonos viejos no hablan 1.3 | Cuando no quede ninguno |
| Seguridad (B7-5), la clave con que Next cifra lo que una acción de servidor «cierra» va dentro de la imagen pública: hoy no importa (las 32 acciones son de módulo, sin *closures* ni `.bind`); si alguna lo necesita, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` del entorno | Al escribir una acción en línea |
| Seguridad (B7-5), acciones de la matriz sin pantalla ni caso de uso (nota de crédito, reabrir mesa, extender sin cobro, KDS, cámaras, reportes de todas): cuando se construyan, su caso de uso comprueba el permiso con `exigirPermiso` y su prueba negativa | Al construirlas |
| Seguridad (B7-5), aceptado a sabiendas: `deepmerge-ts` 7.1.5 (lo fija Prisma; solo fusiona nuestra configuración) y la herramienta `prisma@7.10.0` sin procedencia (exceptuada en `trustPolicyExclude`) | Al subir Prisma |
| Seguridad (B7-5), PLAN §7.4 y §7.6 sin hacer: alertas activas sobre la auditoría (anulaciones, descuentos, arqueos), envío de la auditoría fuera de la máquina al instante (hoy sale cada noche con el respaldo), consentimiento y retención de los contactos (DEC-9) | Después del piloto, si se decide |
| Respaldos: con un volcado por noche se puede perder hasta un día (RPO de 24 h); PLAN §10.4 pide 15 minutos con WAL continuo a otro sitio. El ensayo de restauración mensual se anota a mano (no hay registro en el panel) | Antes de B8-3, decidir si basta |
| El actualizador pregunta a la API de GitHub sin token (60 consultas por hora, cada 5 min): si el repositorio pasa a privado, necesita un token de solo lectura | Si el repositorio deja de ser público |
| El aviso por correo de los reportes (T-11) no sale hasta configurar en el VPS `L2_SMTP_URL` (con su contraseña: secreto) y `L2_CORREO_SOPORTE`; sin ellas los reportes se guardan y se ven en Ajustes → Soporte, sin aviso | Al configurar el servidor de correo (lo hace el usuario en el VPS) |
| Lo que escribe una versión nueva puede no leerlo la anterior: un pedido de pie (`table_id` nulo, B6-7) o el motivo `ENTRADA_POR_ERROR` (B4-10). La vuelta atrás automática de un despliegue ocurre antes de que nadie los use; una vuelta atrás a mano días después dejaría esas pantallas sin leer | Aceptado (ADR-028 habla de la base, no de los datos nuevos); antes de una vuelta atrás manual, mirar §7 |
| ~~Crear productos y categorías (y el inventario inicial con productos nuevos) exige `catalogo.modificar`, que no se ajusta por rol ni se concede por persona: supervisión no puede hacer inventario aunque administración se lo dé (P-15)~~ | Saldada en T-13: `inventario.catalogo`, ajustable |
| Sin Storybook | Fuera de la Ruta A |
| El agente de impresión no va firmado con un certificado de código: Windows avisa al abrirlo («editor desconocido») | B8 (si el cliente compra el certificado) |
| La instalación del agente como tarea de Windows (con permiso de administrador) no se ha ejecutado de punta a punta en una laptop | Trabajo de campo (B7-3) |
| ~~En producción el proxy debe llevar `/impresion/vincular` y el espacio `/impresion` del canal al worker~~ | Saldada en T-8a: el `Caddyfile` lleva `/tiempo-real` y `/impresion/vincular` al worker |
| «Impreso» es que la impresora aceptó los bytes y cerró bien (ADR-026): no ve el papel. Una impresora que no contesta al sensor del papel imprime sin esa comprobación | Aceptado; se mide con la impresora real |
| Los feriados de cada año los carga el cliente a mano desde el calendario de SUDEBAN; si se olvida, ese día exige la tasa a mano | Operación (runbook, B8-2) |
| Una pendiente traída antes de B2-1c no tiene `held_back`: no sale como alerta (solo afecta a bases con datos viejos) | Base limpia antes del piloto |
| El motivo de una retenida es el del momento en que se trajo: si al volver a mirarla cambia (p. ej. de SOLO_TERCERO a PRIMERA), el texto de la alerta no lo dice | Cuando haga falta |
| La billetera USDT del local no se configura ni se le enseña al cliente | Cuando el cliente la pida (F0-04) |
| Los medios no se reordenan ni se renombran desde el panel (la base lo admite) | Cuando haga falta |
| ~~El salón (la ocupación de cada mesa) sigue en el bus: una mesa con cuenta abierta en el servidor puede verse «Libre» en el plano~~ | Saldada en B6-7: la ocupación sale de las cuentas abiertas de cada mesa; del bus queda «por limpiar» |
| ~~La base local del cliente cifra con la clave de juguete de `.env.example`: si esa base se lleva al VPS, lo cifrado se vuelve a cifrar o se vuelve a cargar~~ | Saldada: el staging generó sus claves y nació vacío (B7-1), y la semilla no lleva nada cifrado (B7-2) |
| La tasa se enseña redondeada a dos decimales: un importe en bolívares calculado con la tasa completa puede no coincidir al céntimo con multiplicar a mano por la que se ve | Aceptado (pedido del cliente, v0.27.1) |
| Una venta de mostrador vaciada consume su número de orden (queda en la base, sin salir en la cola) | Aceptado: sus versiones dicen qué se quitó y quién |
| Anular una parte intermedia de una cuenta dividida y volver a cobrarla puede dejar el total a un céntimo del documento (el reparto va por índice de parte) | Cuando el cliente cobre dividido con anulaciones (F6-12) |
| Una cuenta dividida no lleva descuento, y una con descuento no se divide (el reparto en partes sale del total) | Aceptado (B3-6); si el cliente lo pide en mesas |
| El tope de supervisión se cambia desde Ajustes → Descuentos (publica una versión de los ajustes); el editor de Sucursal no lo enseña | Al pasar por Sucursal |
| Los pendientes del cierre enseñan lo que se debe sin restar un descuento «por categorías» (la cifra es para enseñar; el cobro sí lo resta) | Aceptado |
| Devolver en efectivo lo que entró por otro medio (Pago Móvil, punto) saca de la gaveta un efectivo que el libro no apunta: el arqueo lo verá como faltante | Un asiento de salida de caja en el libro, cuando el cliente lo necesite |
| El resumen del día no separa lo vendido del parque y del restaurante (JORNADA §5) | Cuando el cliente lo pida |
| Los pendientes del cierre no traen mesas del restaurante (una mesa abierta sale como cuenta); las comandas que no salieron se ven en la barra de la caja e Inicio, no en el cierre | B6-3 |
| La venta guarda el documento del cliente enmascarado: una factura fiscal necesitará el completo | F3 (fuera por M-3) |
| `outbox_event` crece con cada asiento; purgar lo publicado de más de unos días (con el migrador) no está escrito | Runbook (B8-2) |
| En `pnpm dev`, turbo para todo si una tarea se cae: sin Valkey el worker no arranca y la web tampoco queda | Aceptado (en producción son dos procesos) |
| Anular un cobro deja sus líneas por cobrar: lo no entregado vuelve al estante al quitar su línea, no al anular (ADR-023, situación) | Aceptado |
| Las ventas de antes de B9-3 valen cero al costo, y la venta cobrada no guarda su margen: el margen por producto vendido (F9-04) sale de los movimientos | F9-04 (después del piloto) |
| El horario de la sucursal se declara pero todavía no decide nada (p. ej., avisar de un turno abierto fuera de hora) | Cuando el cliente lo pida |
| Las migas del panel dicen «Abby Kingdom» escrito en cada pantalla (Sucursal ya lee el nombre del local) | Al pasar por cada pantalla |
| El campo de hora del horario lo pinta el navegador en su idioma («10:00 a. m.») aunque el local use 24 h | Aceptado |
| La carga desde papel no abre pedidos ni cuentas de mesa: lo anotado de una mesa se carga cuando su cuenta ya existe (solo su cobro). Entradas, salidas, cobros y ventas de mostrador sí | Si el cliente anota las mesas en papel (V-12 pide «entrada y cobro») |
| Lo cargado desde papel usa el tarifario y el catálogo publicados al cargar, no los de la hora real (no se versionan por fecha): un corte que cruce un cambio de precios cobra el nuevo | Aceptado (ADR-027); supervisión lo ve al revisar |
| Quien cargó no revisa su propia carga: con una sola persona de supervisión que también cobra, la revisa administración | **A confirmar con el cliente** |
| Las horas del formulario se escriben con el campo de fecha y hora del navegador, en su idioma (como el horario, arriba) | Aceptado |
| Con los precios con IVA incluido, el margen de Inventario → Productos se calcula sobre el precio con IVA (sale mayor de lo que es) | Al cargar el inventario real |
| El consumo de un cumpleaños sobre la marcha (refrescos, hielo… anotados a su cuenta hasta que se paga) no existe: el paquete trae una lista fija (vacía en los paquetes reales) | Cuando haya inventario de esos artículos (M-19) |

**Inventario de lo provisional y lo simulado (M-11).** Al 2026-10-06 no queda nada (`src/demo` ya no existe). Cada fila salió de
aquí en el paso que la sustituyó, y T-2 lo cierra: desde entonces `pnpm lint` (`sin-simulacion`) impide que vuelva.

| Qué | Dónde | Se va con |
|---|---|---|
| ~~Puestos deducidos del rol (`PUESTO_DE_ROL`)~~ | `features/identity/operador.ts` | Ya no es provisional: D7 se decidió así el 2026-09-28 (§4) |

**Trampas del código.** Ninguna la caza `pnpm typecheck`; todas se ven abriendo la pantalla.

- **Imágenes (T-8a).** Prisma elige su motor de migraciones por el OpenSSL que ve **al instalar**, y pnpm guarda ese
  resultado en su caché de efectos: con la caché de otra construcción, en marcha pide bajar otro motor y no puede
  escribir. `pnpm install --filter` enlaza solo lo filtrado pero llena el almacén con todo el lockfile (Next en el
  worker): se recorta con `turbo prune`. `pnpm exec` dentro de una imagen intenta reinstalar: se llama al binario.
  Un `.env` en una subcarpeta entra al contexto de Docker si `.dockerignore` no dice `**/.env`. En el compose, un
  valor con «: » (como el mensaje de `${VAR:?…}`) va entre comillas o el YAML no carga.
  En el runner de Windows de GitHub, `pnpm` bajo PowerShell sale sin hacer nada **y sin error**: los pasos van en
  `bash` y la publicación comprueba que el ejecutable existe antes de subirlo.

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
- **Una migración que rellena datos choca con la RLS forzada**: el `UPDATE` no ve ninguna fila y no falla (el fallo
  llega después, en el `NOT NULL`). Se suspende `FORCE ROW LEVEL SECURITY` de esa tabla solo mientras rellena y se vuelve
  a poner, y la migración va entre `BEGIN;` y `COMMIT;`: **Prisma no la envuelve en una transacción** y, si falla, deja
  aplicado lo de antes del error (B9-6: hubo que quitar a mano las columnas y `prisma migrate resolve --rolled-back`).
- **Una migración aplicada antes de su commit puede quedar con otra suma**: en Windows se escribe con CRLF y git la
  guarda con LF (`.gitattributes`). `prisma migrate deploy` y `status` no lo miran, pero `migrate dev` la daría por
  modificada y propondría **resetear la base**: contra la base del cliente, solo `pnpm db:migrar`. Les pasa a
  `20261020000000_impresion` y `20261023000000_pedidos`.
- **`cn` (tailwind-merge) solo conoce los tamaños que se le declaran.** Una clase de tamaño con nombre propio
  (`text-detalle`) junto a un color (`text-ink-2`) la toma por otro color y la descarta, sin aviso: con T-16 se perdían el
  tamaño de las cifras de `StatTile` y de las etiquetas de `StatusCard`. La escala vive en `ESCALA_DE_TEXTO` de
  `packages/ui/src/cn.ts`, y `cn.test.ts` la compara con los `--text-*` de los tokens (v0.72.1).
- **Dos PR desde la misma rama.** Un PR abierto con solo el commit de reclamo y fusionado aparte deja el PR del paso sin
  fusionar («the merge commit cannot be cleanly created»): no se fuerza la rama; se aplica el commit del paso en una rama
  nueva desde `main` y se cierra el PR viejo (T-11, #52, #53 → #54). Antes de etiquetar, `git log -1 origin/main` tiene que
  ser el commit del paso: una etiqueta sobre otro commit publica otra cosa (la de v0.72.0 se puso mal, su publicación
  falló por la versión y se quitó).
- **En Prisma, `campo: { not: "X" }` deja fuera también los nulos** (en SQL, `NULL <> 'X'` es desconocido). Para «distinto de X,
  nulos incluidos» se escribe `OR: [{ campo: null }, { campo: { not: "X" } }]` (así `SIN_ANULADAS` en el parque, B4-10).
- `$queryRaw` de Prisma no sabe leer una columna `void`: `SELECT pg_advisory_xact_lock(...)` revienta
  al volver. Se castea (`::text`).
- El servidor del BCV manda incompleta su cadena TLS: su lector añade el intermediario de Sectigo
  (`certificado-bcv.ts`, vence en 2036). Nunca se apaga la verificación.
- **Una prueba con un valor aleatorio no se compara con un literal que el azar puede producir.** Dos casos rompieron el
  CI una vez de cada miles: buscar «1970» (el PIN) en un asiento entero, cuyo UUID lo contenía, y elegir un PIN propio
  fijo que coincidía con el temporal aleatorio («Elige un PIN distinto del temporal»). Se mira solo el campo que importa
  y el valor fijo se elige distinto del aleatorio (v0.84.0).
- **La región del panel no sostiene lo fijo en el teléfono.** `PageTransition` tiene `overflow-y: auto` y una
  transformación: dentro de ella, `sticky` no engancha cuando desplaza la ventana (el teléfono) y `fixed` se mide contra
  la región, no contra la pantalla. Una barra fija abajo en el teléfono va con `createPortal` al `body` (la barra de
  «N elegidos» de Productos, B9-9); en el escritorio, `sticky top-0` sí sirve.
- **El servidor de desarrollo guarda `aplicacion()` al arrancar:** un caso de uso nuevo de `@l2/application` responde
  «… is not a function» hasta reiniciar `pnpm dev` (lo de la web sí se recarga solo).
- **Windows cierra juntos los procesos de una tarea programada (T-8c).** Lo que lanza el agente (aunque sea
  `detached`) muere cuando su tarea termina: el guion que cambia el ejecutable va en su propia tarea, «(cambio)». Y un
  `.ps1` sin BOM lo lee PowerShell 5.1 como ANSI: los acentos se rompen (lo mismo que los JSON sin `charset`, B7-6).
- **Una prueba que depende del sistema operativo:** `path.join` da `\` en Windows y `/` en el CI (Linux). Una ruta
  esperada se arma con la misma función que la calcula, no se escribe a mano (T-8c).
- **El build de la imagen de la web falla a veces en el CI sin motivo** (dos veces: B9-10 y la 0.86.1): el otro
  `verify:db` del mismo código pasa. Se repite solo el trabajo que falló (`gh run rerun <id> --failed`); si vuelve a
  fallar, es de verdad.

---

## 6. Estado por fase (resumen)

| Fase | Estado | Qué falta para cerrarla |
|---|---|---|
| F0 · Decisiones | 29 decisiones cerradas | Datos maestros, relevamiento y firma (§4) |
| F1 · Cimientos | **Hecha:** monorepo, fronteras, contratos, Prisma con RLS, CI, imágenes, staging, semilla y actualizaciones | — |
| F2 · Identidad | **Hecha en el servidor** (Etapa 1, más M-7), con el canal en vivo autorizado en el apretón de manos (B5-1) y la cuenta de soporte (T-17) | — |
| F3 · Dinero | **Hecha en el servidor** (Etapa 2): tasas automáticas y en vivo, impuestos con vigencia, libro de pagos, día de negocio y feriados | **Sin F3-08** (M-3) |
| F4 · Caja | **Hecha en el servidor** (Etapa 3): turno, medios, cobro mixto, ventas, cortes X y Z, arqueo a ciegas, relevo, jornada, incobrables, descuentos, carga de lo anotado en papel, el punto de cobro y la entrada al parque desde la caja (B3-9) | — |
| F5 · Parque | **Hecho en el servidor** (B4-1 a B4-10): estancias, directorio, cronómetro, recarga, salida con D9, huérfanas, los ajustes de la sucursal, el teléfono de la monitora con la cámara, las pulseras de un solo uso, la pausa por comida, entrar sin pulsera, las medias, y la cortesía y la anulación desde la sala | — |
| F6 · Restaurante | **Hecho en el servidor** (B6-1 a B6-3, B6-5 a B6-8): plano, carta, pedido con comanda impresa, cuenta de la mesa, mesa sin consumo, anular en cocina, varias cuentas por mesa y de pie, y el tiempo de atención con «Servido» | Recetas e insumos de cocina, después del piloto (B6-4) |
| F7 · Fiscal | **Fuera** (M-3) | — |
| F8 · Inventario | **Hecho en el servidor** (B9-1 a B9-10): catálogo con tipo, SKU y código de barras, existencias, entradas con costo promedio (y alta de productos), salidas, conteo, mínimos y avisos; catálogo sin existencias con su conteo inicial, duplicar con sabores, editar en lote y conteo a ciegas con su informe de diferencias | Recetas e insumos, después del piloto |
| F9 · Panel | Inicio con el día del libro (B3-5) y en vivo, con quién está en cada puesto (B5-1); la atención en el salón (B6-8); Reportes en PDF: ventas, inventario al momento y movimientos (Etapa 11) | Excepciones, parque frente a restaurante, más vendidos y margen, después del piloto |
| F10 y F11 | Staging en el VPS con despliegue reversible, respaldos y revisión de seguridad (Etapa 7, salvo B7-3) | B7-3 en el local y la Etapa 8 |

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
- **2026-09-30** · B4-4 hecho (v0.31.0): los ajustes de la sucursal son del servidor y llegan en vivo; la zona,
  el residuo, el umbral del arqueo y las horas de una huérfana dejan de estar en el código, y toda hora sale con
  el formato y la zona del local. Sigue B4-5.
- **2026-09-30** · B4-5 empezado en `feat/b4-5`: pulseras de un solo uso, serie como ajuste, cámara como lector y
  el parque en el teléfono, comprobado con una cámara falsa. Faltan el editor de la serie y pulir el teléfono. Handoff.
- **2026-09-30** · B4-5 hecho (v0.32.0): la serie de pulseras en Ajustes → Sucursal y el teléfono pulido (sala en
  baldosas, paquetes en 2×2); se cierra la Etapa 4, el Parque. Sigue B9-2.
- **2026-09-30** · B9-2 (v0.33.0) y B9-3 (v0.34.0) hechos en `feat/b9-2` y pasados juntos a `main`: lo que no hay no
  se vende, la existencia es la suma de movimientos y las entradas de mercancía dan el costo promedio ponderado.
  Permiso nuevo `inventario.entrada`. Sigue B9-4.
- **2026-09-30** · B9-4 hecho (v0.35.0): salidas con motivo y conteo físico con la 🔐 de administración; un conteo no
  ajusta a ciegas si se vendió mientras se contaba. El cliente pregunta por SKU, código de barras, ubicación y máximos:
  propuesta en §1, sin decidir. Sigue B9-5.
- **2026-09-30** · Con el cliente, el inventario se rediseña con el stock como protagonista (M-16): SKU, código de barras,
  presentación, tres tipos, mínimos ya, alta de productos en la entrada y escaneo en caja, entradas, conteo y Productos.
  Nuevo paso B9-6; la ruta pasa a 56.
- **2026-09-30** · B9-5 hecho (v0.36.0): stock mínimo por producto, su estado y el aviso en Inicio. Sigue B9-6.
- **2026-09-30** · B9-6 hecho (v0.37.0): Productos con el stock primero, tipos, SKU, código de barras, alta en la entrada y
  el lector en caja, entradas, conteo y Productos; se cierra la Etapa 9. Sigue B3-6.
- **2026-09-30** · Handoff (v0.37.0 en `main`, sin subir): B4-5 y la Etapa 9 entera (B9-2 a B9-6) hechas en esta sesión.
- **2026-10-01** · B3-6 hecho (v0.38.0): descuentos configurables por medio de pago, VIP, manuales y de administración,
  uno por cuenta y antes del IVA, con su 🔐 en el servidor, en el recibo y en las excepciones. Sigue B5-2.
- **2026-10-01** · Al llegar a B5-2, el servidor en la nube no alcanza la impresora del local: se decide un agente en
  la laptop de caja (ADR-026). B5-2 hecho (v0.39.0): recibo y ticket del Z en papel, cola con confirmación y alerta
  con «Reintentar». Sigue B6-1.
- **2026-10-01** · Pedido del cliente: dejar el agente listo para instalar ya (de B7-3). v0.39.1: `l2-impresion.exe`
  con asistente y tarea de Windows, descarga desde el panel, aviso «en espera», y se corrigen la reconexión del
  agente tras un rechazo y los trabajos que quedaban esperando en una impresora apagada o retirada.
- **2026-10-01** · Pedido del cliente: Ajustes → Impresoras más organizada. v0.39.2: resumen, pestañas, historial por
  páginas con filtros y vista previa, y «Descartar» lo que no salió (estado nuevo, sin borrar). Sigue B6-1.
- **2026-10-01** · Pedido del cliente: el mismo rediseño en el resto de Ajustes (M-17). Carta y Plano entran en B6-1;
  Roles y accesos, Usuarios, Dispositivos, Descuentos, Tasas y Tarifas, en el paso nuevo T-7. Ruta a 57. El cliente
  probó «Enviar a cocina» y no salió nada (la comanda impresa es de B6-2): el orden queda B6-1 → B6-2 → T-7.
- **2026-10-01** · Handoff: B6-1 a medias en `feat/b6-1` (carta = catálogo con «en la carta», plano versionado; dominio,
  contratos, migración aplicada a la base local y productos hechos; faltan aplicación del plano e I-05, web y navegador).
- **2026-10-02** · B6-1 hecho (v0.40.0): plano versionado en el servidor, carta = catálogo con Carta y precios nueva,
  una cuenta abierta por mesa (I-05) y lo pedido con su producto; piezas de M-17 en `@l2/ui`; `src/demo` borrada.
  En la base local, la versión 1 del plano es el boceto del cliente. Sigue B6-2.
- **2026-10-02** · B6-2 hecho (v0.41.0): el pedido del mesero y su comanda impresa en una transacción, con aviso y
  «Volver a imprimir» si no sale; fuera la pantalla de cocina y los estados «en fuego/listo». Sigue T-7.
- **2026-10-02** · T-7 hecho (v0.42.0): las seis pantallas de Ajustes que faltaban (Roles y accesos, Usuarios,
  Dispositivos, Descuentos, Tasas y Tarifas) con el patrón de Impresoras; tres con historial paginado en el servidor
  (Dispositivos, Tasas, Tarifario). Sigue B6-3.
- **2026-10-03** · B6-3 hecho (v0.43.0): vincular pulseras, salida a mesa y anular un plato enviado en el servidor,
  `mesa.vinculada` fuera del bus; `pnpm verify:db` en verde (81 y 423). Navegador en la base de pruebas. La división
  por ítems (F6-12) va en un paso propio. En la base local, la prueba de vincular dejó dos paquetes en la cuenta #0038
  (ver §1); limpiado el mismo día con el visto bueno del cliente (#0038 regalada, #0041 incobrable).
- **2026-10-03** · M-18 (preguntas del cliente sobre la mesa y el parque): mesa sin consumo que libera el mesero (B6-5),
  papel «ANULAR» a cocina e inventario según el motivo (B6-6), y salida antes de tiempo cobrada por uso en cuenta abierta
  (B4-6). La ruta pasa a 60. Siguen B6-5 → B6-6 → B4-6 antes de los eventos.
- **2026-10-03** · B6-5 hecho (v0.44.0): «Liberar mesa» sin PIN y la cuenta «sin consumo»; la mesa en $ 0 ya no
  bloquea el cierre. `pnpm verify:db` en verde (81 y 428). Sigue B6-6.
- **2026-10-03** · B6-6 hecho (v0.45.0): papel «ANULAR» a cocina y existencia según si se preparó (devolución o
  merma); un pedido se anula de una vez. `pnpm verify:db` en verde (81 y 432). Sigue B4-6.
- **2026-10-03** · v0.45.1: corregido lo que dejó B6-3 en la caja (lo anulado contaba como pendiente en la web, en el
  contrato y en `markPaid`); visto al empezar B4-6. `pnpm verify:db` en verde (81 y 433).
- **2026-10-03** · B4-6 en curso: el cliente decidió los tres casos (pase libre por uso, recargas juntas, también en la
  mesa); dominio, contratos, salida y web escritos y en verde; faltan pruebas contra la base, la caja y el navegador.
- **2026-10-03** · B4-6 hecho (v0.46.0): en cuenta abierta se cobra por uso al salir antes; la caja lo enseña tachado.
  `pnpm verify:db` en verde (81 y 440). Siguen B10-1 → B10-2 (eventos).
- **2026-10-03** · v0.46.1: confirmar una tasa tecleándola como se ve (dos decimales) fallaba siempre con las de la
  API (más decimales); lo reportó el usuario al empezar B10-1. Vale la tasa como se ve o la completa.
- **2026-10-03** · B10-1 hecho (v0.47.0): paquetes de cumpleaños, agenda, anticipo en la caja con la cuenta del evento
  y cancelación; avisos de hoy. `pnpm verify:db` en verde (81 y 455). Sigue B10-2 (el día del evento).
- **2026-10-03** · v0.47.1 (pedido del usuario): en el menú lateral, Ajustes desplegado desplaza solo su lista.
- **2026-10-03** · B10-2 hecho (v0.48.0): el día del cumpleaños (empezar, invitados, saldo). Etapa 10 cerrada.
  `pnpm verify:db` en verde (81 y 461). Siguen B3-7 → T-2 → T-4 y la Etapa 7.
- **2026-10-03** · Handoff: base local migrada (45 de 45, las tres de los cumpleaños), fuera la impresora falsa y
  los README al día; rama y etiquetas hasta v0.48.0 subidas a GitHub.
- **2026-10-05** · B3-7 hecho (v0.49.0, ADR-027): carga de lo anotado en papel con la hora real dentro de la ventana
  del corte, revisión de supervisión con PIN antes del Z, formularios impresos y la marca «desde papel». La Etapa 3
  queda cerrada. `pnpm verify:db` en verde (92 y 495). Siguen T-2 → T-4 y la Etapa 7. **La base local del cliente
  necesita `pnpm db:migrar` (migración 46 de 46) antes de abrir la web con este código.**
- **2026-10-05** · M-19 (pedido del cliente): datos reales del local (menú infantil, parque, cumpleaños) tras vaciar
  movimiento y catálogo, y precios con el IVA incluido. B2-5 hecho (v0.50.0); la ruta pasa a 61.
- **2026-10-05** · Handoff a mitad de M-19: respaldo de la base del cliente y ensayo de la limpieza en
  `l2control_ensayo` (correcta: quedan personas, «PC admin», tasas, impuestos, feriados, medios, ajustes, plano,
  impresora «Caja» y agente «Laptop de caja»). El guion de carga está escrito y sin correr. Se detectaron dos IGTF al 3 %
  programados para el 2026-10-27.
- **2026-10-05** · M-19, carga en `l2control_ensayo`: ajustes con IVA incluido, tarifario (4 paquetes), 12 platos y 6
  paquetes de cumpleaños, vistos en el navegador (caja: 3 alitas de $ 6,50 = $ 19,50, IVA 16 % incluido, base 16,81).
  Corrección v0.50.1: el aviso de `pg` de consultas solapadas que Next enseñaba en Inicio.
- **2026-10-05** · M-19 en la base del cliente, con el sí del usuario: respaldo, migración 46, limpieza (también los dos
  IGTF de prueba del 2026-10-27, «Prueba T7 Oficina», la auditoría y el outbox) y la carga. Con los disparadores apagados
  la base no comprueba las claves foráneas: se revisaron las 90 y no queda ninguna fila huérfana.
- **2026-10-05** · M-20 (decisión del usuario antes del VPS): actualizaciones decididas por administración desde el panel
  ([ADR-028](adr/028-actualizaciones.md), paso nuevo T-8) y trabajo entre dos por PR con el CI en verde. La ruta pasa a 62.
- **2026-10-05** · `gh` instalado con la sesión del usuario (dueño del repositorio); PR #1 (M-20) fusionado con el CI en
  verde. Proteger `main`, dar acceso a `aemorandin-coder`, pasar el repositorio a privado y borrar ramas los bloquea el
  sistema de permisos de Claude: quedan en §4 para el usuario. Regla de ramas: solo `main` es permanente.
- **2026-10-05** · El usuario borró las ramas fusionadas, activó el borrado automático y protegió `main` con un ruleset
  (comprobado: activo, sin excepciones). Handoff para cualquier persona del equipo (§8).
- **2026-10-06** · Primera sesión de aemorandin-coder. T-2 entregado (v0.51.0): regla `sin-simulacion` en `pnpm lint`
  y el CI visto en rojo con una violación a propósito (PR #6), que cierra también B0-4. T-4 reclamado y a medias en
  `feat/instalacion-y-llaves`: el servidor completo y probado, la web sin pantallas todavía (§3).
- **2026-10-06** · v0.51.1 (pedido del usuario): fondos de estado con más luz que la tarjeta, rojo de estado más claro,
  botón de peligro con texto oscuro e iconos de aviso animados por selector en los tokens. Se hizo además una vista previa
  de un **tema claro azulado** (inspirado en «Light Blue» de L2Lab) cambiando solo tokens: gustó, pero no está en el plan
  y no se guardó; si entra, hay que decidir el interruptor (por persona o por equipo) y qué pasa con el amarillo de marca.
- **2026-10-06** · T-4 entregado (instalación inicial y llaves de acceso, ADR-020): pantallas, consola sin TOTP y la base
  vacía operativa sin consola; al probarla salieron y se corrigieron cuatro fallos (§3). T-8 se reclamó por error fuera de
  orden y se retiró el mismo día (PR #10 y #11). Sigue T-8 y la Etapa 7.
- **2026-10-06** · T-4 fusionado como v0.52.0 (PR #13) tras v0.51.1 (PR #12). Relevo dejado: sigue T-8, libre.
- **2026-10-06** · v0.52.1: `main` quedó en rojo tras el relevo por una carrera que ya existía en `pagos.revertir` (doble clic);
  corregida y con la prueba repetida doce veces. Trampa para §5: una prueba de concurrencia de una sola pasada puede estar meses en verde.
- **2026-10-06** · v0.52.2 (M-21): tema claro predeterminado, por equipo, con avisos rojos y amarillos sólidos. Visto en el
  navegador en el acceso, Inicio, la Puesta a punto y la caja; la sala con niños vencidos y las mesas en alerta se repasaron
  leyendo el código (la base de prueba no tiene esos datos): mirarlas con datos reales en B7-3. El icono de la app instalada
  y el manifiesto siguen con los colores del oscuro.
- **2026-10-06** · v0.52.3 (pedido del usuario): logo oficial de L2 (el de L2Lab, `public/logo-l2.png`) en el acceso, el menú,
  el favicon y los iconos de la PWA (`LogoL2.tsx`, `iconoApp.tsx`). El manifiesto sigue con los colores del tema oscuro.
- **2026-10-06** · Cierre de la sesión de aemorandin-coder: `main` en v0.52.3 y en verde, sin ramas ni pasos reclamados. Sigue T-8.
- **2026-10-06** · M-22 (decisión del usuario): T-8 se parte en T-8a (antes de B7-1) y T-8b (antes de B8-3); el VPS ya está
  contratado y staging va sin dominio comprado, por `sslip.io`. La ruta pasa a 63. T-8a reclamado por LuAMi (`feat/t-8a`).
- **2026-10-06** · T-8a entregado como v0.53.0 (LuAMi): imágenes, servidor con Caddy, `desplegar.sh` con vuelta atrás ensayada en local,
  publicación por etiqueta y las imágenes en el CI. Sigue B7-1 en el VPS ya contratado; T-8b en paralelo.
- **2026-10-06** · La primera publicación (v0.53.0) falló sin publicar nada: en el runner de Windows `pnpm` no corría bajo
  PowerShell y salía con éxito. `publicar.yml` pasa a `bash`, comprueba el ejecutable y se puede relanzar a mano para una etiqueta.
- **2026-10-07** · B7-1 en marcha: v0.53.0 desplegada y sana en `https://217-216-48-54.sslip.io` (Let's Encrypt; en el VPS solo escuchan
  22, 80 y 443). Al instalar, Windows no creó la llave y la pantalla ocultó el motivo → v0.53.1.
- **2026-10-07** · v0.53.1 publicada y desplegada en el VPS tras ensayar allí la vuelta atrás. B7-1 entregado como v0.54.0.
  Siguen la instalación por administración, B7-2 a B7-5 y T-8b.
- **2026-10-07** · M-23 (decisión del usuario): equipo de confianza y app de autenticación junto a la llave (ADR-029), paso T-9;
  la ruta pasa a 64. Ni la laptop ni una tableta pudieron crear la llave al instalar el staging.
- **2026-10-07** · Handoff de LuAMi: T-9 con el código hecho en `feat/t-9` (36050ec) y `verify:db` en verde; falta el navegador.
  El staging (v0.53.1 en marcha) espera a T-9 para instalarse.
- **2026-10-07** · T-9 entregado como v0.55.0: visto en el navegador desde una instalación limpia (imágenes locales en
  `https://localhost`). Salieron tres arreglos de pantalla (la tarjeta de credenciales en el teléfono, su aviso tras un alta
  por enlace y `/alta` a pantalla completa). Visto también: Inicio pone la fecha con el reloj del servidor, que en el
  contenedor va en UTC (desde las 8 pm de Venezuela dice el día siguiente); va aparte.
- **2026-10-07** · v0.55.1: Inicio pone el día del local, en su zona, y no el del reloj del servidor.
- **2026-10-07** · M-24 (decisiones del usuario al revisar el staging): la semilla del local (B7-2, desbloqueado) y el inventario en
  lote (T-10: línea flexible, tabla con pegar desde Excel, inventario inicial, categorías propias), con el icono de Android. La
  ruta pasa a 65. Reclamados por LuAMi en `feat/semilla-e-inventario`.
- **2026-10-07** · B7-2 y T-10 entregados juntos como v0.57.0 (con el icono de Android): vistos en el ensayo con las imágenes de la
  rama, la semilla de la base del local cargada allí. La base del local migró a 49 (respaldo antes). Falta cargar la semilla
  en el staging.
- **2026-10-07** · M-25 (decisión del usuario): T-8b se parte; el agente de impresión pasa a T-8c, con B7-3. La ruta pasa a 66.
  T-8b reclamado por LuAMi (`feat/t-8b`), con dos pedidos del usuario: la versión en el panel y «Después» en la Puesta a punto.
- **2026-10-07** · T-8b entregado como v0.58.0: visto en el ensayo local con dos versiones construidas en la PC (pedir, poner,
  pantallas que se ponen al día, «al cierre» con un turno abierto, cancelar y la vuelta atrás en staging). Sigue desplegarla
  en el VPS e instalar allí el actualizador (`./actualizador.sh --instalar`).
- **2026-10-07** · v0.58.0 desplegada a mano en el staging (sus tablas llegan con ella) y el actualizador en el cron del VPS.
  M-26 (decisión del usuario): los respaldos los baja una PC del local; B7-4 reclamado por LuAMi (`feat/b7-4`).
- **2026-10-07** · B7-4 entregado como v0.59.0: la PC del local se prepara desde el panel (no por SSH, como pide M-12), y la
  restauración se ensayó íntegra en una base limpia. Sigue instalarlo en el staging y que administración prepare la PC.
- **2026-10-07** · v0.59.0 publicada: el staging se puso al día solo (actualizador, 42 s), la primera actualización de verdad
  de T-8b. Respaldos instalados en el VPS; su primer respaldo, restaurado íntegro en 5 s. Pendiente de administración en el
  staging: preparar la PC de los respaldos, cargar la semilla y los feriados. Sigue B7-5.
- **2026-10-07** · B7-5 reclamado (LuAMi, `feat/b7-5`) y entregado como v0.60.0: matriz §7.3 celda por celda, gitleaks y
  Semgrep (un fallo real de cifrado, corregido), Next 16.3.7 por una ejecución remota, auditoría de dependencias en el CI
  con siete días y procedencia, cabeceras en Caddy y la consulta de contactos auditada. Abiertas: D-REIMP y el calendario
  de actualización (§4).
- **2026-10-07** · M-27 (primera visita al local con el sistema): 19 pedidos del cliente, 13 pasos nuevos, la ruta pasa a
  79; D-SERV y D-SOP abiertas. Hallado al estudiarlos: crear productos exige `catalogo.modificar`, que no se ajusta, y
  por eso supervisión no podía hacer inventario (T-13). Auditoría de este archivo: §1 reescrito para leerse en un
  minuto (su historia pasa a §9), la tabla de §2 en orden y sin el corte que la partía, y tachado lo ya hecho en §3 a §6.
- **2026-10-07** · B6-7 entregado como v0.61.0: una mesa admite una cuenta por familia y quien pide de pie tiene la suya;
  el plano lee la ocupación de las cuentas, no del bus. Salió al probarlo: una cuenta de pie recién abierta se escondía
  como borrador de mostrador vacío. Sigue B4-7.
- **2026-10-07** · v0.61.0 llevó también Next 16.3.8: la auditoría del CI marcó como alta una falsificación de peticiones en
  la optimización de imágenes (GHSA-cjq9-62q9-8jv4), y `main` habría quedado en rojo sin tocar nada.
- **2026-10-07** · B4-7 entregado como v0.62.0: la pausa por comida, una por visita y de hasta 10 minutos (ajuste). Sigue B4-8.
- **2026-10-07** · B4-8 entregado como v0.63.0: niños sin pulsera con un código reservado que pone el servidor. Sigue T-12.
- **2026-10-07** · T-12 entregado como v0.64.0: ayuda por pantalla (F1), «Cómo se resuelve» en los errores conocidos y
  recorridos guiados la primera vez, sin IA. Sigue B4-10.
- **2026-10-07** · B4-10 entregado como v0.65.0: desde la sala, regalar el tiempo de un niño y anular una entrada por
  error (su pulsera vuelve a servir). Sigue B4-9.
- **2026-10-07** · B4-9 entregado como v0.66.0: medias en la entrada, que salen del inventario. Sigue T-13 (roles).
- **2026-10-07** · T-13 entregado como v0.67.0: `inventario.catalogo`, ajustable; supervisión ya puede dar de alta
  productos y cargar el inventario inicial, y el cambio le llega sin volver a entrar. Sigue B3-8 (cobrar con el teclado).
- **2026-10-07** · B3-8 entregado como v0.68.0: cobrar de punta a punta solo con el teclado y el interruptor «Imprimir
  recibo» (de fábrica, imprimir; el cobro imprime en su transacción). Sigue T-14 (mi PIN y el acceso con teclado).
- **2026-10-07** · T-14 entregado como v0.69.0: «Mi cuenta» cambia el PIN propio, y el acceso se usa con el teclado
  (tecla por persona, PIN escrito o pegado, Intro y Esc). Sigue T-15 (la operación de un vistazo).
- **2026-10-07** · T-15 entregado como v0.70.0: paquetes con su reloj, marquesina en vez de textos cortados, el código
  de la pulsera a mano en todas las pantallas que leen, medios con el icono arriba y la carta en $, Bs o ambos por
  equipo. Sigue T-16 (jerarquía y ancho).
- **2026-10-07** · T-16 entregado como v0.71.0: la escala de texto y de iconos en tokens, aplicada a las piezas
  comunes, y el panel con el ancho de Inicio. De M-27 quedan B6-8 (espera D-SERV) y T-11 (espera D-SOP).
- **2026-10-07** · D-SERV y D-SOP decididas (las dos como se propusieron). T-11 entregado como v0.72.0: reportar un
  problema con captura, «Mis reportes», Ajustes → Soporte y el aviso por correo al desarrollo. Sigue B6-8.
- **2026-10-07** · v0.72.1 (corrección): `cn` perdía los tamaños de la escala de T-16 junto a un color (las cifras de
  `StatTile` y las etiquetas de `StatusCard` salían con el tamaño de base); ahora los conoce, con su prueba. Y la etiqueta
  v0.72.0 se puso primero sobre el commit de reclamo (un PR #52 lo fusionó aparte): se quitó y se puso en el de T-11.
- **2026-10-07** · B6-8 entregado como v0.73.0: «Servido» en la tablet y la atención en el salón para administración.
  Con él, M-27 (los 19 pedidos de la primera visita) queda entregado entero.
- **2026-10-08** · M-28 decidido con el usuario: la cuenta de soporte oculta del acceso (con PIN, sin plazo, con su
  equipo), el catálogo sin existencias que no se vende hasta su conteo, y duplicar productos con sus sabores. Tres pasos
  nuevos (B9-7, T-17, B9-8); la ruta pasa a 82. Sigue B9-7.
- **2026-10-08** · M-29 decidido con el usuario: Ajustes unificados (T-18), respaldos con carpeta, fijados e integridad
  (B7-6), la semilla con casillas para la corrida limpia (B7-7), editar en lote (B9-9) y el conteo a ciegas con su
  informe de diferencias (B9-10); la cuenta de soporte no mueve dinero en producción (T-17); y la sección Reportes
  (Etapa 11: ventas, inventario al momento y movimientos, en PDF, para administración y supervisión). La ruta pasa a 90.
- **2026-10-08** · Relevo (LuAMi): M-27 entregado; M-28 y M-29 en el plan, sin empezar; D-REL para decidir. Sigue B9-7.
- **2026-10-08** · B9-7 entregado como v0.74.0: el catálogo se da de alta en una hoja sin cantidades, lo que se cuenta
  queda «Sin inventario inicial» (distinto de «Agotado», no se vende) y el inventario inicial trae solo los que faltan,
  con el cero. La versión se puso al fusionar, en su propio PR (regla de CLAUDE.md). Sigue B7-7 (semilla con casillas).
- **2026-10-08** · B7-7 entregado como v0.75.0: la semilla lleva impuestos, medios de pago con sus datos, descuentos e
  impresoras, y se elige con casillas al descargar y al cargar (lo «Prueba…», desmarcado). Sigue B7-6 (respaldos).
- **2026-10-08** · B7-6 entregado como v0.76.0: los respaldos se ensayan cada semana (ÍNTEGRO en el panel y en Inicio), se
  fijan con su nombre y la PC guarda donde se elija (disco externo, nube o Documentos). Sigue B11-1 (Reportes y ventas).
- **2026-10-08** · B11-1 entregado como v0.77.0: la sección Reportes con las ventas de un día o de un rango (por medio,
  origen, cajera y turno, con su cuadre contra el Z y lo anulado) y su PDF A4. Sigue T-18 (Ajustes unificados).
- **2026-10-08** · T-18 entregado como v0.78.0: Ajustes en 12 secciones, con pestañas en Personas y equipos, Tasas y
  Sistema, y la carta dentro de Inventario → Productos; las rutas viejas llevan a su pestaña. Sigue B11-3 (movimientos).
- **2026-10-08** · B11-3 entregado como v0.79.0: Reportes → Movimientos, el kárdex de un producto o una categoría con el
  saldo después de cada movimiento (el final es la existencia) y su PDF. Sigue B11-2 (inventario al momento).
- **2026-10-08** · B11-2 entregado como v0.80.0: Reportes → Inventario al momento, lo que hay y lo que vale al costo por
  categoría, con lo agotado, lo bajo mínimo y lo sin contar, y su PDF. La Etapa 11 queda entera. Sigue T-17 (soporte).
- **2026-10-08** · T-17 entregado como v0.81.0: la cuenta de soporte entra por «Acceso de soporte» con su usuario y su
  PIN, firma «(soporte)», no cuenta como personal del local y en producción no abre turnos ni cobra. Sigue B9-10.
- **2026-10-08** · B9-10 entregado como v0.82.0: «Contar» a ciegas con sus diferencias antes de ajustar, la hoja para
  imprimir y el informe de diferencias de cada conteo, en PDF. Sigue B9-9 (editar en lote).
- **2026-10-08** · B9-9 entregado como v0.83.0: en Productos se eligen varios y se les cambia la categoría, el mínimo, la
  carta o el precio (en % o en monto, desde un día), o se apartan; todo o nada, cada uno con su asiento. Sigue B9-8.
- **2026-10-08** · B9-8 entregado como v0.84.0: «Duplicar» y «Con otros sabores» en la ficha de un producto. Con él,
  M-28 y M-29 quedan enteros (once pasos, v0.74.0 a v0.84.0). Lo que queda espera la visita al local (B7-3, T-8c) y
  D-REL; después, la Etapa 8.
- **2026-10-08** · Relevo (LuAMi): M-28 y M-29 entregados en una sola sesión, sin pedir el sí entre pasos (lo pidió el
  usuario). Tres pruebas intermitentes corregidas (§5). CLAUDE.md al día con lo que dejaron (pestañas, informes, soporte).
- **2026-10-08** · M-30: B8-2 deja de escribir un manual aparte (el de la app lo es); quedan el procedimiento en papel,
  los runbooks del técnico y la capacitación por rol durante B8-3. D-REL sigue por decidir.
- **2026-10-08** · M-31: el punto de cobro (opción A con salida de emergencia, B3-9) y la entrada desde la caja (B4-11);
  el aviso de «sin pulsera», descartado por ahora. La ruta pasa a 92. Sin empezar hasta el «empieza» del usuario.
- **2026-10-08** · El usuario junta los dos pasos de M-31 en uno (B3-9, de punta a punta y automático) y pide ir después
  a la 1.0.0: T-8c y lo escrito de B8-2 se hacen antes de la visita (§3, orden, punto 10). La ruta pasa a 91.
- **2026-10-08** · B3-9 entregado como v0.85.0 (M-31): el punto de cobro y la entrada desde la caja. La ruta cuenta 91 en el
  `package.json` (se había quedado en 90, PR #85). Sigue T-8c y lo escrito de B8-2, sin pedir el sí entre pasos.
- **2026-10-08** · T-8c entregado como v0.86.0: el agente de impresión se actualiza solo, ensayado en esta PC con Windows (cambio, huella
  equivocada, versión que no arranca y vuelta atrás). En la laptop de caja real se comprueba con B7-3. Sigue lo escrito
  de B8-2.
- **2026-10-08** · B8-2, lo escrito, como v0.86.1 (corrección: el paso cuenta al cerrarse con la capacitación en B8-3): la
  hoja del procedimiento en papel (`/procedimiento-papel`) y los runbooks del técnico (`infra/produccion/RUNBOOKS.md`).
  Con esto, lo que se programa para la 1.0.0 está hecho: queda el local (B7-3, B8-1, B8-3, B8-4) y D-REL.
- **2026-10-08** · Relevo (cierre, 3): B3-9, T-8c y lo escrito de B8-2 entregados de una vez, sin pedir el sí entre pasos
  (v0.85.0 a v0.86.1). Desde aquí ya no se programa nada para la 1.0.0: todo lo que falta es en el local, y D-REL.
- **2026-10-08** · M-32: la caja más clara (B3-10), pedido del usuario con las capturas de la caja tras vaciar el
  inventario: buscador y no disponibles al final en la carta, el pie de la cuenta en una fila y «Cobrar $ …». La ruta
  pasa a 92. Sin empezar hasta el sí del usuario.
- **2026-10-08** · B3-10 entregado (M-32): el buscador de la carta, lo que no se vende al final, el pie de la cuenta en
  una fila y «Cobrar $ …». Con muchas categorías (tres renglones), la carta dentro de una cuenta deja poco sitio a los
  productos: el buscador lo cubre; las categorías en una fila que desliza siguen descartadas por ahora.

---

## 8. Handoff

El relevo vive en [`docs/HANDOFF.md`](HANDOFF.md), con una sección por persona; este archivo guarda el estado.

**Cuando alguien escribe «handoff»:**

1. Se actualizan §1 (dónde estamos), las casillas de §3 (también las `[~]` en curso, con quién y su rama) y una
   línea en §7.
2. Se reescribe **solo la sección de quien trabajó** en `docs/HANDOFF.md` (por su `git config user.name`; si no
   existe, se crea): fecha, versión y commit de `main`, y un bloque de como mucho 15 líneas que responde a dónde
   quedó, el paso siguiente con su criterio, qué quedó a medias (rama y qué falta) y con qué hay que tener cuidado.
   Nada que dependa de un equipo concreto (rutas locales, scratchpads): lo lee otra persona en otra máquina.
3. Si hubo código, `pnpm verify`. Commit en una rama `docs/handoff-<fecha>`, PR, CI en verde y fusión: el relevo
   tiene que llegar a `main`, o la otra persona no lo verá. Si hay trabajo a medias en otra rama, se sube esa rama
   también (sin fusionar).
4. Se entrega en el chat el bloque, por si se quiere pegar a mano.

**Cuando alguien escribe «siguiente»** (al abrir un chat): lo dice `CLAUDE.md`.

---

## 9. Historia de §1

Lo que decía §1 al entregar cada paso, del más reciente al más antiguo, y lo que se probó en la base local
(la del cliente) hasta M-19. Se movió aquí el 2026-10-07 (M-27) para que §1 se lea en un minuto. No se edita.

**Versión 0.60.0 · 60 de 66 pasos.** **Revisión de seguridad (B7-5, v0.60.0):** la matriz de permisos se comprueba celda por celda contra PLAN §7.3; el historial no tiene secretos (gitleaks) y Semgrep encontró un fallo real, corregido (el descifrado aceptaba una etiqueta GCM recortada); Next sube a 16.3.7 por una ejecución remota en la generación de iconos, y las dependencias con avisos altos, a su versión corregida, con la auditoría en el CI y una política de siete días y de procedencia; Caddy pone cabeceras que impiden incrustar el sistema y solo dejan la cámara; consultar los contactos de los representantes queda auditado. Pendiente de decidir: D-REIMP y el calendario de actualización (§4). Queda Etapa 7 con B7-3 en el local; después, Etapa 8. **Respaldos fuera del servidor (B7-4, M-26, v0.59.0):** cada noche el VPS hace un respaldo de la base cifrado para la clave pública del local (la privada no está en el servidor; `restaurar.sh --clave-nueva`, en la PC del técnico), con su huella (las filas de cada tabla y lo que suma el libro de pagos) tomada en la misma instantánea, y guarda las últimas siete noches. Una PC del local, preparada desde Ajustes → Respaldos con la identidad confirmada (el panel da una orden de PowerShell y una credencial que se enseña una vez), lo baja cada mañana, comprueba su huella, se lo confirma al servidor y guarda 30 diarios, 12 semanales y los mensuales. Ajustes → Respaldos e Inicio avisan si el de anoche falló o no se hizo, si no hay PC o si la PC no baja los recientes. La restauración se ensayó en una base limpia: íntegra (la huella coincide) en 4 s. Con un volcado por noche se puede perder hasta un día (el objetivo de 15 min con WAL queda en §5). **En el staging (2026-10-07):** la 0.59.0 la puso sola el actualizador (la primera actualización real de T-8b: vista, pedida y puesta en 42 s, con respaldo antes); los respaldos están instalados (clave pública, cron de las 3:15 am) y el primero, de 452 KB, se restauró íntegro en 5 s fuera del servidor. Falta que administración, en el staging, prepare la PC del local (Ajustes → Respaldos), cargue la semilla (Ajustes → Semilla del local) y los feriados. Sigue B7-5. **Actualizaciones desde el panel (T-8b, M-25, v0.58.0):** Ajustes → Versión y actualizaciones enseña la versión en marcha, las nuevas con sus novedades (la sección del CHANGELOG; urgente si trae `### Urgente`) y lo último que se puso. En producción administración elige «Actualizar ahora» (solo sin turnos abiertos ni niños en sala) o «Esta noche al cierre», con su identidad confirmada, y la puede cancelar mientras espera; el staging se pone al día solo. La web solo pide: el actualizador del VPS (`infra/produccion/actualizador.sh`, cada minuto por cron) ve las versiones publicadas con sus imágenes, comprueba otra vez que no haya operación, la pone con `desplegar.sh` y escribe cómo terminó; una que no queda sana vuelve sola a la anterior y el panel lo dice. Cada pantalla abierta se pone al día sola en cuanto está libre (sin diálogo, sin el cursor en un campo, sin un pedido o un plano sin enviar) y, si no, lo avisa; una pantalla vieja no puede hacer nada contra el servidor nuevo (sus acciones se niegan). La versión va en el menú del panel, Inicio avisa de una nueva, y la Puesta a punto deja apartar lo recomendable («Después»). Visto en el ensayo local con dos versiones construidas en la PC, en los dos temas, con la vuelta atrás en staging. Sigue desplegarla en el VPS e instalar allí el actualizador; el agente de impresión es T-8c, con B7-3. **La semilla del local y el inventario en lote (B7-2 y T-10, M-24, v0.57.0):** Ajustes → Semilla del local descarga en un archivo lo que se tarda en teclear (ajustes de la sucursal, tarifas y paquetes, categorías y carta con sus precios, plano y cumpleaños) y lo carga en otro local, que solo añade lo que le falta y nunca pisa lo suyo; la semilla de la base del local ya está lista para el staging (la carga administración desde su sesión). Las entradas de mercancía son una tabla: buscar el producto, cantidad en unidades o en bultos de N, costo por unidad, por bulto o total, el último costo propuesto, pegar una lista de Excel e «Inventario inicial» para la existencia de arranque. Las categorías son una lista propia (crear, renombrar, unir, retirar) que nace con unas de arranque. El icono de la app instalada es el logo sobre transparente (y sobre claro en el adaptable de Android), con los colores del tema claro. Corregido de B9-6: una entrada con varios productos nuevos en la que uno no valía dejaba creados los anteriores. **Corrección (v0.55.1):** Inicio ponía la fecha con el reloj del servidor, que en el contenedor va en UTC: desde las 8 pm de Venezuela decía el día siguiente. Ahora es el día del local, en la zona de sus ajustes (como ya hacía Turno). **Confirmar identidad desde cualquier equipo (T-9, M-23, [ADR-029](adr/029-equipo-de-confianza-y-app-de-autenticacion.md), v0.55.0):** al instalar el staging, ni la laptop (Windows sin PIN de Hello) ni una tableta pudieron crear la llave de acceso, que era obligatoria. Ahora se instala sin llave y ese equipo queda de confianza: en él, confirmar identidad es solo la contraseña. En cualquier otro, la contraseña y el código de la app de autenticación (Google Authenticator, Authy…, configurada con un QR en Ajustes → Usuarios; un código ya usado no vale otra vez), una llave o un código de recuperación, y al confirmar se puede marcar «Confiar en este equipo». La confianza es de esa persona en ese equipo, se ve y se retira en Ajustes → Usuarios y cae al revocar el equipo. Aprobar un equipo desde sí mismo acepta la app, y el enlace de alta no exige llave. Visto en el navegador desde una instalación limpia con las imágenes de la versión, en el escritorio y el teléfono y en los dos temas. Sigue desplegarla en el staging, que sigue **sin instalar**, para que administración lo instale. **El sistema en el VPS (B7-1, v0.54.0):** L2 Control corre en el staging, `https://217-216-48-54.sslip.io` (Ubuntu 24.04, 4 CPU, 8 GB; certificado de Let's Encrypt que Caddy renueva solo; en el VPS solo escuchan 22, 80 y 443). Las claves se generaron en el VPS y no salen de él. La vuelta atrás se ensayó allí: la 0.53.1 con la comprobación forzada a fallar volvió a la 0.53.0, y después quedó en marcha. Falta que administración instale el local (código en el registro de la web). Siguen B7-2 a B7-5 y T-8b. **Corrección (v0.53.1):** al instalar el staging, Windows no pudo crear la llave de acceso y la pantalla solo dijo «No se pudo registrar la llave de acceso en este equipo», sin el motivo (el dominio `sslip.io` sí vale: se comprobó en Chromium con un autenticador virtual). Ahora dice el porqué: sin Windows Hello, dónde configurarlo o que se cree en el teléfono; una llave ya registrada; y cualquier otro fallo, con el nombre del error. **Publicar y desplegar (T-8a, M-22, v0.53.0):** el sistema tiene sus imágenes (web en Next `standalone`, worker y migrar, en `infra/docker/Dockerfile`) y un servidor de producción en `infra/produccion` (PostgreSQL, Valkey, la web, el worker y Caddy con HTTPS automático). `./desplegar.sh X.Y.Z` respalda la base, migra, arranca la versión y pregunta a la web y al worker por `/salud`; si no responden con esa versión y la base contestando, vuelve solo a la anterior y lo anota. Ensayado en esta PC: la vuelta atrás con la comprobación forzada a fallar y con una versión rota, y una versión nueva que quedó en marcha. Una etiqueta `vX.Y.Z` publica las imágenes en ghcr.io y el agente con su huella en el «release»; el CI construye las imágenes en cada PR. Sigue B7-1 (el VPS ya está contratado) y, en paralelo, T-8b. **T-8 en dos partes (M-22, 2026-10-06):** T-8a (contenedores, publicación por etiqueta y despliegue que vuelve solo atrás) va antes de B7-1, y T-8b (las actualizaciones desde el panel) en paralelo con la Etapa 7, antes de B8-3. El VPS ya está contratado y, sin dominio comprado, staging se abre por `<ip>.sslip.io` (las llaves de acceso no funcionan con una IP); antes de B8-3 se decide un dominio propio. **Logo de L2 (v0.52.3):** el acceso, el menú del panel, la pestaña del navegador y el icono de la app instalada llevan el logo oficial de la suite (`apps/web/public/logo-l2.png`, traído de L2Lab y reducido), igual en los dos temas. **Tema claro (v0.52.2, M-21):** el sistema tiene dos temas, claro (el predeterminado) y oscuro, por equipo, con el botón del sol o la luna en el acceso y en el pie del menú; solo cambian tokens, ninguna pantalla sabe en cuál está. En el claro los avisos rojos y amarillos son bloques sólidos (rojo con letra blanca, amarillo con letra azul marino). **Corrección (v0.52.1):** un doble clic al anular un cobro podía responder «Ese asiento ya se revirtió» si la segunda petición miraba su clave antes de que la primera asentara y el asiento después; ahora, si quien lo revirtió es la misma operación, devuelve lo hecho. Salió porque el CI de `main` falló con un commit que solo tocaba documentos (la prueba del doble clic caía en esa ventana una de cada muchas veces); la prueba ahora lo repite doce veces. **Instalación inicial y llaves de acceso (T-4, [ADR-020](adr/020-llaves-de-acceso.md)):** con la base vacía, el acceso ofrece «Instalar L2 Control» (código del registro del servidor, local, primera administración con contraseña, PIN y llave de acceso, diez códigos de recuperación y ese equipo aprobado), y después esa pantalla no vuelve a existir. Confirmar identidad y aprobar un equipo desde sí mismo piden contraseña + llave, o un código de recuperación; el TOTP y `pnpm totp` se retiraron. Administración da credenciales desde Ajustes → Usuarios con un enlace de 24 h con QR, que la persona completa en `/alta`. Inicio enseña la Puesta a punto, que se tacha sola. Un local sin tarifario ya abre (la entrada lo dice y el editor publica el primero). **Corrección (v0.51.1):** los avisos verdes, amarillos y rojos y la opción elegida de los selectores se leían hundidos, como un botón ya presionado, porque su fondo era más oscuro que la tarjeta; ahora tienen más luz que ella (tres tokens), el rojo de estado es un tono más claro que sí llega al contraste mínimo y el icono de un aviso rojo se mueve en bucle (el de uno amarillo, tres veces al aparecer). **Cero simulación (T-2):** `pnpm lint` suma la regla `sin-simulacion` (nada de negocio en el almacenamiento del navegador, ni PINs literales, ni listas de ejemplo en las pantallas) y el CI se vio en rojo con una violación a propósito (PR #6), lo que cierra también B0-4. Sigue T-8 antes del staging. **Actualizaciones y trabajo entre dos (M-20, [ADR-028](adr/028-actualizaciones.md)):** en producción las actualizaciones las decide administración desde el panel y cada equipo se pone al día solo (paso nuevo T-8, antes del staging); todo entra a `main` por PR con el CI en verde, y `main` está protegido en GitHub (2026-10-05). Falta que la segunda persona (`aemorandin-coder`) tenga acceso (§4). **Corrección (v0.50.1):** Inicio enseñaba en desarrollo el aviso de `pg` «client.query() when the client is already executing a query»: Prisma 7 pide a la vez las relaciones hermanas de un `include` (tres o más; aquí, la agenda de cumpleaños) por la conexión de la transacción. `abrirBase` pone en fila las consultas de cada conexión (lo que `pg` 8 hace por dentro y `pg` 9 dejará de hacer); prueba en `fila.test-db.ts`. **Datos reales del local (M-19, hecho, 2026-10-05):** la base local del cliente se vació de movimiento y catálogo
con el sí del usuario (respaldos en `C:\tmp\l2-respaldos\`, el último `l2control-2026-10-05-antes-limpieza.dump`) y
lleva los datos de Abby: precios con el IVA incluido, tarifario (30 min $ 3, 1 h $ 5, 2 h $ 9, pase libre $ 12), 12
platos y 6 paquetes de cumpleaños. Se fueron también los equipos, impresoras y agentes de prueba, las sesiones (cada
persona vuelve a entrar con su PIN), la auditoría, el outbox y los dos IGTF de prueba del 2026-10-27 (el IGTF sigue al
0 %, V-13). Quedan personas, «PC admin», tasas, impuestos, feriados, medios, ajustes, plano, impresora «Caja» y agente
«Laptop de caja»; 46 de 46 migraciones y ninguna fila huérfana. Queda en Impuestos un rastro de prueba: IVA general 15 %
y 16 % programados para el 2026-10-27; manda el último (16 %), así que no cambia nada. **Precios con el IVA incluido (B2-5, M-19):** con el ajuste «IVA incluido» de la sucursal, el total es la suma de los precios del menú al céntimo y el IVA se saca de dentro. **Lo anotado en papel (B3-7, V-12, [ADR-027](adr/027-hora-real-de-lo-anotado-en-papel.md)):** si caen internet y luz, el local sigue en formularios (se imprimen desde Caja → Papel); al volver, la cajera abre una carga en su turno con la ventana del corte y carga las entradas, las salidas y los cobros (cola de cuentas y ventas de mostrador), cada uno con **la hora real del formulario**, que tiene que caer dentro del corte y con la que salen el tiempo, la tasa, el IVA, el precio y la existencia de entonces; el servidor guarda además cuándo se cargó. La carga terminada la revisa supervisión con su PIN (quien cargó no la revisa) y, mientras haya una abierta o sin revisar, el turno no se sella y la jornada no se cierra. Se distingue en la venta, en el turno, en Inicio y en la auditoría. La caja queda completa. **El día del cumpleaños (B10-2, V-10):** con el anticipo cobrado, el día empieza desde la agenda o con el primer invitado: la cuenta del día lleva el saldo y lo incluido (que sale del estante) a la caja; los invitados entran por la entrada solo con su pulsera, sin cobro, hasta los reservados; el saldo se cobra como una mesa y sale en los pendientes del cierre hasta cobrarse. Los eventos quedan completos. La base local del cliente tiene ya las tres migraciones de los cumpleaños (45 de 45, 2026-10-03), y se retiró la impresora falsa de desarrollo: la impresión se prueba con la real del local. **Corrección (v0.47.1):** con Ajustes desplegado, en el menú lateral desplaza solo su lista; la operación, la marca y la persona se quedan a la vista. **Cumpleaños con reserva y anticipo (B10-1, V-10):** administración carga los paquetes en Ajustes → Cumpleaños (precio, invitados, lo que incluyen y el anticipo, 50 % por defecto); Parque → Eventos es la agenda: al reservar, la cuenta del evento lleva el anticipo a la caja, que lo cobra con su venta; cobrado, la reserva está confirmada; sin cobrar, se cancela desde la agenda. Inicio y la apertura del turno avisan «Hoy hay un cumpleaños». El día del evento es B10-2. **Corrección (v0.46.1):** confirmar una tasa tecleándola como se ve (con dos decimales) ya vale; antes el servidor la comparaba con la tasa completa de la API y nunca coincidía. **Salir antes de tiempo (B4-6, M-18):** en cuenta abierta, quien sale antes paga el paquete más barato que cubre lo que estuvo (también el pase libre; el paquete y sus recargas juntos; si está vinculado, en la cuenta de la mesa), y la salida y la caja enseñan lo elegido tachado y lo que se cobra; en prepago no se devuelve, y la entrada lo avisa. **Corrección (v0.45.1):** la caja cobraba mal una mesa con un plato anulado (contaba lo anulado como pendiente y el cobro chocaba); ya cobra lo mismo que el servidor y lo anulado no se marca pagado. **Anular en cocina, con papel e inventario (B6-6, M-18):** anular un pedido enviado saca un papel «ANULAR» en la impresora de comandas (y avisa si no sale), y quien anula dice si la cocina ya lo preparó: si no, vuelve al inventario; si sí, sale como merma. Se anula un pedido de una vez, con un solo PIN. **Una mesa sin nada que cobrar se libera (B6-5, M-18):** el mesero la libera sin PIN y su cuenta se cierra «sin consumo», fuera de la caja y del cierre; ya no queda una mesa en $ 0 que bloquee la jornada. **La cuenta de la mesa es del servidor (B6-3):** vincular pulseras, cargar la salida a una mesa y anular un plato enviado van por una operación del servidor con su comprobación; el dinero ya no viaja por el bus. La ocupación del plano sigue en el bus (§5). **Ajustes con un mismo patrón (T-7, M-17):** Roles y accesos, Usuarios,
Dispositivos, Descuentos, Tasas de cambio y Tarifas y paquetes siguen el patrón que estrenó Impresoras: resumen de
cifras arriba que filtran la pantalla, pestañas, alta y edición en hoja lateral, confirmación para lo irreversible y
las listas que crecen por páginas en el servidor (dispositivos, historial de tasas, versiones del tarifario), con
filtros, su cuenta y «Limpiar filtros». Ninguna regla de negocio cambió. **La comanda sale en papel (B6-2, ADR-022):** el pedido del mesero entra en la
cuenta de la mesa y su comanda en la impresora de comandas en una sola transacción; sin impresora de comandas no se
envía. Cada pedido dice si su comanda se imprime, salió, no salió o se descartó; lo que no salió se avisa en la
tablet, en la caja y en Inicio, y se vuelve a imprimir (reintento si la cocina no la tenía, copia marcada si ya
salió). Se retiraron la pantalla de cocina y los estados «en fuego/listo». **El restaurante empieza en el servidor (B6-1):** el plano del local se
publica en Ajustes → Plano del local como versión (con quién y cuándo) y llega en vivo al salón; una mesa no se borra,
se retira, y con su cuenta abierta no se retira. La carta del restaurante **es el catálogo** con la marca «en la
carta», y Ajustes → Carta y precios la gestiona con el patrón de M-17 (resumen, filtros, páginas, hoja lateral). Una
mesa tiene **una sola cuenta abierta** (I-05, en el servidor) y lo pedido lleva su producto: precio, IVA y existencia
los comprueba el servidor. Ya no queda nada en `src/demo`. **Se imprime en papel (B5-2, [ADR-026](adr/026-impresion-por-agente-local.md)):**
con el servidor en la nube, la impresora del local la alcanza un **agente** en la laptop de caja, que se vincula
una vez con un código del panel y se conecta hacia fuera. El servidor guarda la cola (pendiente, enviado,
confirmado o fallido, con cinco intentos) y compone el ESC/POS a 58 u 80 mm; el agente lo manda por TCP 9100 y
pregunta antes por el papel. Salen el **recibo** (original y copias) y el **ticket del corte Z** (solo, al
sellar); lo que no sale se avisa en la barra y en Inicio con «Reintentar». Ajustes → Impresoras configura la
impresora y el agente. Las comandas ya tienen su impresora elegida y salen cuando los pedidos sean del servidor
(B6-2). **Los descuentos son configurables (B3-6):** administración crea en Ajustes →
Descuentos los que la caja puede aplicar (por medio de pago, VIP y manuales; porcentaje o monto; sobre la cuenta, el
parque, el restaurante o unas categorías; con vigencia) y marca familias VIP en el directorio. La caja ofrece los que
aplican, el mayor primero, uno por cuenta y antes del IVA, con la 🔐 que toca: el de medio exige cobrar toda la cuenta
por ese medio; el manual de supervisión llega hasta el tope (20 %, ajuste del local); el VIP no pide PIN; y
administración aplica el que quiera con su PIN y un motivo escrito. Sale en el recibo y en las excepciones del turno y
del día. **Se cierra el Inventario (B9-6):** Productos enseña el stock primero (resumen +
tabla o tarjetas, por tipo: Producto, Preparado, Servicio); cada producto tiene SKU automático, código de barras y
presentación; la entrada de mercancía da de alta lo que llega por primera vez, y el código se lee en la caja (vende),
las entradas, el conteo y Productos. **Mínimos y avisos (B9-5):** cada producto tiene su stock mínimo (punto de
reorden) y su estado (agotado, bajo mínimo, bien); Inicio avisa de lo que hay que reponer. **Salidas y conteo (B9-4):** lo que sale sin venderse (merma, consumo interno,
regalo, devolución al proveedor) sale con su motivo, y el conteo físico deja la existencia igual a lo contado; los dos
con la 🔐 de administración (supervisión pide la suya). **El inventario lleva existencia y costo (B9-2 y B9-3):** la existencia es la suma
de movimientos de solo-agregar; sale cuando un producto entra en una cuenta, vuelve cuando se quita sin pagar y **sin
existencia no se vende** (ADR-023): la caja enseña «Quedan N» y «Agotado». Lo que llega se carga en Inventario →
Entradas de mercancía (compra o reposición, por bultos de tantas unidades a tanto el bulto), y cada producto tiene su
**costo promedio ponderado** y su margen en Productos. **El Parque está cerrado (B4-5):** la monitora trabaja en el teléfono
(entrada, sala y salida sin desplazar la página), la cámara lee las pulseras y una pulsera sirve para una sola
visita; la serie (prefijo y longitud) se fija en Ajustes → Sucursal con el primer lote. **Los ajustes de la sucursal son del servidor (B4-4):** nombre, RIF,
dirección, horario, formato de hora, zona horaria, residuo, umbral del arqueo y horas de una huérfana se
publican como versión en Ajustes → Sucursal y llegan a todas las pantallas en vivo; la caja, el corte Z y la
sala los leen de ahí, y toda hora y fecha sale con el formato y la zona del local. **Todo va en tiempo real (B5-1):** lo que pasa en un equipo llega a los
demás en menos de 2 s, sin sondeos. Toda escritura audita, y el asiento deja su evento en un outbox en la
misma transacción; nace `apps/worker`, que lo publica por Socket.io con adaptador Valkey a la sala de cada
sucursal (autorización con ticket en el apretón de manos), y cada pantalla vuelve a leer lo suyo con sus
permisos (ADR-025). Quién está en cada puesto sale de las sesiones de la base, el bus del restaurante viaja
por el worker y la barra dice si hay canal. La tasa del BCV se aplica siempre, salte lo que salte, y su
consulta vive en el worker (V-14, ADR-024). **El parque funciona contra el servidor (B4-1 a B4-3, M-14):**
la entrada registra en la base (con el nombre del niño si se quiere), la sala de cualquier equipo ve
a los niños con el reloj del servidor, se recarga tiempo, la salida liquida el tiempo de más en el
servidor y deja constancia de quién recogió al niño (D9), la caja recibe la cuenta y las estancias
huérfanas las cierra la dirección sin cobrar tiempo de más. **La caja cierra en el servidor (B3-5): lo previsto de la Etapa 3, hecho** (la visita técnica le suma B3-6 y B3-7). Arqueo a ciegas, corte X, corte Z que firma la cajera hasta $ 1,00 de diferencia y supervisión por encima, relevo, cierre de la jornada sin pendientes (cuentas, niños en sala, huérfanas y otros turnos), incobrables con 🔐 y el resumen del día en Inicio. Etapas 0, 1 y 2 hechas, y la versión ya se ve (T-1). En la Etapa 2 (dinero): las tasas
son de la base, se traen del BCV, se aplican solas con salvaguardas y llegan en vivo a toda pantalla
(B2-1c), los impuestos son de la base con su vigencia (B2-2) y **el libro de pagos existe en el
servidor (B2-3)**, a la espera de que la caja cobre contra él (B3-3), y **el día de negocio y los
feriados bancarios (B2-4)**. Etapa 3 (caja) empezada: el turno es real (B3-1) y sin él no se cobra, y **los medios de pago son de la base (B3-2)**: se añaden sin desplegar y los datos de cada pago se guardan cifrados. Etapa 9 empezada: **el catálogo de productos es de la base (B9-1)**, con el precio programado por día, y la caja vende de él. **Las cuentas son de la base (B3-3)**: familia, mesa y mostrador; la caja cobra y anula contra el libro en una transacción, con el total, la tasa y la autorización comprobados en el servidor; **cada cobro deja su venta (B3-4)** con la foto de lo cobrado, y reimprimir, anular y regalar quedan en el servidor con su autorización. Sin modo demo; lo provisional y lo simulado que queda está
inventariado en §5, y cada pieza tiene el paso que la elimina (M-11). La versión sigue M-10: el
número del medio cuenta los pasos entregados.

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

**Producción arranca con la base vacía (M-12), y ya no pide consola (T-4).** El servidor escribe en su registro un
código de instalación de un solo uso; con él, el primer administrador y su primer equipo se crean desde el navegador, y
el segundo factor es una llave de acceso (ADR-020). `pnpm credenciales` y `pnpm equipos` quedan como puerta de emergencia.

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

**Los ajustes en la base local (2026-09-30, al comprobar B4-4).** Las dos migraciones de B4-4 se aplicaron a la base
del cliente (una tabla nueva y una columna que admite nulos en el arqueo). Abigail Karam, desde el equipo «Prueba B44
Admin», publicó la versión 1 (formato de 24 h) y la 2 (de vuelta a 12 h): rigen los valores de fábrica, con el RIF, la
dirección y el horario sin declarar. Cambiar la zona a Bogotá se negó por el turno abierto de «PC admin», que no se
tocó. Equipos «Prueba B44 Admin» y «Prueba B44 Inicio» revocados.

**Las pulseras en la base local (2026-09-30, al comprobar B4-5).** La migración
`20261013000000_pulsera_de_un_solo_uso` está aplicada a la base del cliente (no tenía códigos repetidos). Entraron y
salieron tres familias de prueba, «Familia Prueba B45 6204», «… 7363» y «… 2322» (pulseras PB45-…, ya usadas); sus
cuentas #0027 a #0029 quedaron **incobrables** («Otro: datos de prueba», autorizadas por Abigail Karam). Abigail
publicó los ajustes 3 (serie «PB45-» de 9 caracteres) y 4 (de vuelta a sin serie): rige sin serie hasta el primer
lote. Equipos «Prueba B45 …» revocados. Queda una cuenta pendiente, del cliente.

**El inventario en la base local (2026-09-30, al comprobar B9-2 y B9-3).** Las migraciones `20261014000000_existencias`
y `20261015000000_entradas_de_mercancia` están aplicadas a la base del cliente (tablas nuevas y columnas que admiten
nulos; no había movimientos). Los productos del cliente que llevan existencia salen **«Agotado»** hasta que se cargue
su primera entrada. Abigail Karam creó «Prueba B93 Refresco» (categoría «Prueba», $ 1,50) y le cargó dos compras (48 a
$ 0,50 de «Distribuidora de Prueba», factura P-0001, y 24 a $ 0,80): quedan 72 a $ 0,60 de costo promedio. Una venta
de mostrador de una (#0030) la descontó y se descartó sin cobrar (vuelve). El producto está **apartado** (la caja no
lo ofrece) y sus entradas no se borran. Equipos «Prueba B92 Admin» y «Prueba B93 Admin» revocados. La migración
`20261016000000_salidas_y_conteo` también está aplicada. Al comprobar B9-4, sobre el mismo producto: una merma de 2 de
Abigail Karam, un consumo interno y dos regalos de 1 de Luis Guerrero (autorizados por Abigail), y dos conteos (69 → 65 y
62 → 60) y otro rechazado por desactualizado: quedan 60. Equipos «Prueba B94 …» revocados.

**El inventario se rediseña (M-16, 2026-09-30, con el cliente).** El stock es lo protagonista: Productos pasa a
una vista de resumen (agotados, bajo mínimo, valor del inventario) con tabla, o de tarjetas. Cada producto lleva **SKU
automático**, **código de barras** y **presentación**, y es de un **tipo**: Producto (se cuenta), Preparado (se hace al
momento; sin stock hasta las recetas) o Servicio. Los **mínimos y sus avisos** entran ya (B9-5); la entrada de
mercancía **crea productos** con una ficha corta; y el código se **escanea** en la caja, las entradas, el conteo y
Productos. Sin foto por ahora. Pasos B9-5 y B9-6 (nuevo); la ruta pasa a **56 pasos**.

**El inventario en la base local (2026-09-30, al comprobar B9-5 y B9-6).** Las migraciones `20261017000000_stock_minimo` y
`20261018000000_identificacion_y_tipos` están aplicadas a la base del cliente. La segunda **falló a la primera** (la RLS
forzada dejó sin rellenar el tipo y el SKU, y Prisma no la envolvía en una transacción): se quitaron a mano las cuatro
columnas vacías que dejó, se marcó como revertida y se aplicó corregida (trampa nueva en §5). Cada producto del cliente
tiene su tipo (lo que llevaba existencia es Producto; el café, los tequeños y el jugo, Preparado) y su SKU (BEB-0001…).
«Prueba B93 Refresco» tiene mínimo 70 (60 en stock: bajo mínimo). Abigail Karam dio de alta en una entrada «Prueba B96
Uva» (PRU-0002, código 036000291452, 72 a $ 0,60): está apartado. Equipos «Prueba B95 Admin» y «Prueba B96 Admin»
revocados. **En la base hay datos que no son míos**: el producto «TEST pRODUCTO» (categoría «sAPO») y la venta de mostrador
#0031 (papas fritas, por cobrar), creados el 2026-09-30 a las 9:59 pm; no se tocaron.

**Los descuentos en la base local (2026-10-01, al comprobar B3-6).** La migración `20261019000000_descuentos` está
aplicada a la base del cliente (dos tablas nuevas y una causa más en las versiones de la cuenta; no rellena nada).
Abigail Karam creó «Prueba B36 Efectivo $» (10 %, pagando todo en efectivo en dólares), «Prueba B36 Manual 25» y
«Prueba B36 VIP» (20 % del parque), y marcó VIP a la «Familia Prueba B36 8153». Entraron y salieron tres familias de
prueba (8153, 1779 y 1646; pulseras PB36-…) y se cobraron en «Prueba B36 Caja» con descuento: #0032 con el VIP
($ 4,64), #0033 con el de efectivo autorizado por Luis Guerrero ($ 5,22, después de rechazar un pago en bolívares) y
#0034 con uno de administración del 50 % ($ 2,90). Dos turnos de prueba, los dos sellados con su Z por la cajera
(faltó $ 0,11 en el primero, dentro del umbral). **Las tres reglas están retiradas**: la caja del cliente no ofrece
ninguna. Equipos «Prueba B36 …» revocados. El turno de «PC admin» y las cuentas #0022 y #0031 del cliente no se tocaron.

**La impresión en la base local (2026-10-01, al comprobar B5-2).** La migración `20261020000000_impresion` está
aplicada a la base del cliente (tres tablas nuevas; no rellena nada). Abigail Karam dio de alta «Prueba B52 Caja»
(10.2.0.2:9100, la IP de esta máquina, donde escuchaba una **impresora falsa** que guarda lo que recibe) y vinculó
dos veces el agente «Prueba B52 Laptop». La «Familia Prueba B52 2828» entró, salió y se cobró en «Prueba B52 Caja»
(#0037, $ 5,80); su recibo salió a 80 mm, la copia falló sin papel y salió al reintentar, y el Z del turno sacó
solo su ticket, ya a 58 mm. **La impresora y los dos agentes están retirados** (el agente en marcha se
desconectó en el acto) y los equipos «Prueba B52 …» revocados. Las pruebas de impresión de la cola quedan en el
historial de la impresora retirada. **Falta el trabajo de campo:** la impresora real del cliente (marca y modelo
aún sin saber) y la instalación del agente en su laptop.

**El agente de impresión, listo para instalar (v0.39.1, 2026-10-01, pedido del cliente: «nada para después»).**
Se adelanta de B7-3 la instalación del agente en la laptop de caja: `l2-impresion.exe` es un solo ejecutable
(Node SEA, sin Node ni el proyecto) que se descarga en Ajustes → Impresoras con su huella; doble clic abre un
asistente que pide pegar la dirección y el código, pide permiso de administrador una vez, comprueba el servidor y
lo deja como **tarea de Windows** (al arrancar, con la cuenta del sistema, sin ventana, reinicio cada minuto). La
barra avisa en ámbar «N en espera» cuando el agente no toma lo que se manda. Comprobado con el `.exe` contra la
impresora falsa (`pnpm impresora:falsa`): descarga con sesión (401 sin ella), vincular, imprimir, aviso con el
agente parado y salida al volver. **La instalación como tarea no se probó aquí** (pide aceptar el permiso de
administrador en la pantalla): su definición se validó con PowerShell sin registrarla. En la base del cliente, la
impresora «Prueba B53 Caja» y sus agentes, retirados; equipo «Prueba B53 Admin» revocado.

**Ajustes → Impresoras, reordenada (v0.39.2, 2026-10-01, pedido del cliente: «más organizada, sin listas
infinitas, con capacidad de limpiar»).** Resumen arriba (impresoras, agente, no salieron, en cola) y tres pestañas:
impresoras en tarjetas con alta y edición en hoja lateral; cola e historial **por páginas** (10/20/50) con filtros
de estado, impresora y tipo y vista previa del ticket; y el agente. Lo que falló o espera se **descarta** (estado
nuevo `DESCARTADO`, migración `20261021000000_descartar_impresion`): no se imprime, apaga la alerta y queda en el
historial y la auditoría con quién lo hizo; la base impide salir de ahí y descartar sin nombre. Comprobado a
1366×768, 1280×800 y 800×1280 sin desplazar la página, y en teléfono. En la base del cliente: impresoras «Prueba
B54 Barra» y «Prueba B54 Terraza» (10.2.0.2, contra la impresora falsa, con el agente del cliente) retiradas tras
la prueba, sus trabajos descartados o impresos en el historial; equipo «Prueba B54 Admin» revocado. El cliente
descartó dos pruebas suyas de «Caja» mientras tanto.

**El restaurante en la base local (2026-10-02, al comprobar B6-1).** La migración `20261022000000_plano_y_carta`
dejó todo lo activo en la carta (los servicios, fuera). Desde «Prueba B61 Admin», Abigail Karam publicó la **versión 1
del plano** con el boceto del cliente (8 × 6 m; mesas 1 a 4 «Junto al parque» y 5 a 8 «Salón», de 4 sillas, con ids
`mesa-1` a `mesa-8`, los que ya nombraban las cuentas del cliente; parque, paso al parque, entrada, caja, barra y
cocina como rectángulos): es el plano que ve el cliente y lo puede cambiar. Las cuentas del cliente #0022 (mesa 8,
abierta) y #0038 (mesa 1, por cobrar) siguen ahí, con «Pizza margarita» sin producto (de la carta de ejemplo). Se creó
«Prueba B61 Tequeños» (preparado, exento, $ 4,50 y luego $ 5,00), se sacó y volvió a la carta, y el mesero Jesús
Mendoza («Prueba B61 Salón») pidió dos en la mesa 5: cuenta #0039, cobrada ($ 10,00) en un turno de «Prueba B61 Caja»
(Marisol Prieto) que se selló con relevo. **El ticket de ese Z no salió y se descartó** (solo ese trabajo): la
impresora «Caja» del cliente apunta ahora a 192.168.1.194:9100, que esta máquina no alcanza. «Prueba B61 Tequeños»
quedó apartado y la mesa 5, libre en el salón; equipos «Prueba B61 …» revocados.

**La comanda en la base local (2026-10-02, al comprobar B6-2).** Migración `20261023000000_pedidos` aplicada (tabla
`kitchen_order`, la comanda con su pedido; no rellena nada). Desde «Prueba B62 Salón», Jesús Mendoza pidió dos «Prueba
B62 Arepa» con nota en la mesa 6: **comanda #0001**. Salió hacia la impresora «Caja» del cliente (192.168.1.194, que
esta máquina no alcanza), así que **no salió**: la tablet lo avisó, se volvió a imprimir y volvió a fallar; sus
trabajos se descartaron uno a uno. La cuenta #0040 ($ 6,00) se cobró en un turno de «Prueba B62 Caja» sellado con
relevo (su Z, descartado); la arepa quedó apartada, la mesa 6 libre y los equipos «Prueba B62 …» revocados. Diego Salas
(cocina) entró y el acceso le dijo que su puesto no usa el sistema.

**Ajustes con el patrón de M-17 (2026-10-02, al comprobar T-7).** Las seis pantallas (Roles y accesos, Usuarios,
Dispositivos, Descuentos, Tasas de cambio, Tarifas y paquetes) probadas desde «Prueba T7 Admin»: páginas de
Dispositivos (68 equipos, con los revocados de pruebas anteriores), filtros y búsqueda por código; historial de Tasas
por páginas y par; versiones del Tarifario con sus cambios (se intentó retirar «30 minutos», se canceló); un
descuento de prueba creado y retirado en Descuentos; un ajuste de prueba en Roles y accesos («Dar cortesía» de Caja a
No) devuelto a fábrica. Equipo «Prueba T7 Admin» revocado.

**B6-3 hecho (2026-10-03, v0.43.0):** vincular pulseras (`casosMesas.vincular`), cargar la salida a una mesa (la salida
elige «En caja» o «A una mesa») y anular un plato enviado (`cuentas.anularPedido`, 🔐 `pedido.anularEnProduccion`) van en
una transacción con su comprobación; `mesa.vinculada` sale del bus. `pnpm verify:db` en verde (81 de base, 423 de
aplicación). El navegador se probó en la **base de pruebas** `l2control_test`, con su propio local, un plano de 8 mesas
y una impresora de comandas de prueba apuntando a la IP falsa 10.2.0.2; la base del cliente no recibió comandas.
Sin desplazamiento ni errores de consola a 1366×768, 1280×800 y 800×1280. **Fuera de B6-3 (decidido el 2026-10-03):**
la división por ítems (F6-12), en un paso propio.
**Lo que tocó la prueba en la base local (la del cliente):** la vinculación de «Prueba B63» (AK-9601 y AK-9602) llevó sus
dos paquetes a la cuenta #0038, la de la mesa 1 de Abigail del 2026-10-01 (por cobrar, con una cortesía de 8,50 $). La
plano marcó la mesa 1 como libre hasta entonces (ver §5). **Limpiado el 2026-10-03** (decisión del cliente), por los casos de
uso con el PIN de Abigail y sin abrir turno: los dos paquetes de #0038, regalados («Otro»), así que #0038 vuelve a estar
como la dejó Abigail, todo regalado y en $ 0, y se libera con «Liberar mesa» (B6-5). Los dos niños salieron a las 5:09 pm;
la salida dejó $ 3,00 de tiempo de más en la familia «Prueba B63» (#0041), marcada incobrable («Otro: datos de prueba»).
Equipos «Prueba B63 …» revocados.
