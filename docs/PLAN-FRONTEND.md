# Plan final del frontend

> **Tarea F1-21** del [plan](PLAN.md). Creado el 2026-09-16 como plan por olas a partir de la
> [auditoría del frontend](cerrados/AUDITORIA-FRONTEND.md); **reescrito el 2026-09-17 como plan final**: lo que
> falta para dar el frontend por terminado y abrir el backend.
>
> Se ejecuta **en orquesta** ([ORQUESTA.md](ORQUESTA.md)): la maestra (Claude) prepara contratos,
> dominio y `@l2/ui`, escribe el encargo, revisa, mide y commitea; las obreras (Gemini) construyen las
> pantallas en copias aisladas. Al cerrar cada ola se mide de nuevo y se actualiza este plan.

## 1. Dónde estamos (2026-09-17)

Hecho y medido:

- **La app se instala** en Android como PWA (Chrome: sin errores) y las estaciones van a pantalla completa.
- **Todas las estaciones funcionan en 12 tamaños**, de 1920×1080 a tablets de 960×600 y 768×1024: sin
  scroll horizontal, sin textos cortados y sin que la página desplace. La caja se cobra entera en
  cualquiera de ellos. Objetivos táctiles de cada superficie cumplidos.
- **Tarifas y paquetes**, con su editor; **otros puestos** desde la barra (N-06); **solo la caja cobra**
  (DEC-25) y **turnos genéricos** (DEC-26).
- **La entrada en dos toques** (DEC-27, DEC-28): en la puerta se pasan las pulseras, se elige paquete y
  se teclea el teléfono; el nombre del niño se pone después, desde la sala, donde también se le vincula
  a una mesa sin esperar al mesero (DEC-29). Medido: dos niños entran sin teclear un solo nombre.

El panel tiene 25 secciones. Siguen pendientes **siete**:

| Módulo | Hechas | Abren una estación | **Pendientes** |
|---|---|---|---|
| Parque | Tarifas y paquetes | Monitor de sala, **Entrada rediseñada**, Salida | — |
| Restaurante | Plano del local, Carta y precios | Mesas y pedidos, Comandas del día | — |
| Caja | — | Cobrar, Ventas del turno, Turnos y cortes | **Tasas de cambio** |
| Inventario | — | — | **Insumos, Recetas, Compras y mermas** |
| Personas | Usuarios y permisos, **Dispositivos** | — | **Representantes y niños** |
| Configuración | Roles y accesos, **Sucursal** | — | **Impuestos, Impresoras** |

Además de esas siete, falta la **apertura de turno**, la **cortesía** en caja y un lugar para
configurar los **medios de pago** (hoy la caja trae fijos el banco del Pago Móvil y el correo de Zelle).

## 2. Cuándo está terminado el frontend

Cada punto se comprueba midiendo o recorriendo, no leyendo.

| # | Criterio | Cómo se comprueba | Estado |
|---|---|---|---|
| T-1 | Cero scroll horizontal en todas las pantallas | Medición en 12 tamaños | ✅ |
| T-2 | Las estaciones no desplazan la página en ningún tamaño de desktop o tablet; por dentro solo las listas | Medición | ✅ |
| T-3 | Toda estación es usable en vertical (768×1024 y 800×1280) | Medición y capturas | ✅ |
| T-4 | Objetivos táctiles: KDS 64, POS 56, tablet 48, admin 32 | Medición | ✅ |
| T-5 | Se instala en una tablet Android real, sin barra del navegador | Prueba del cliente | Pendiente (necesita HTTPS) |
| T-6 | Navegación sin sorpresas: N-04, N-07 y N-08 resueltos | Recorrido por rol | ✅ |
| T-7 | **Ninguna sección del panel queda en «pendiente»** sin una decisión: está construida, o su espera está escrita y aprobada | Recorrido del menú | Pendiente (Ola 4) |
| T-8 | Auditoría de accesibilidad e interfaz por módulos sin hallazgos altos abiertos | Auditorías por área, verificadas | Pendiente (Ola 5) |
| T-9 | `pnpm verify` en verde y la medición repetible con un comando (`pnpm audit:ui`) | CI local | Parcial |

## 3. Lo que falta, por olas

### Ola 3 · Navegación y panel en tablet — **hecha** (2026-09-17)

| # | Tarea | Carril | Origen | Criterio |
|---|---|---|---|---|
| 3.1 | Avisar en el menú y en las tarjetas de módulo de que una sección abre una estación a pantalla completa (`abre: "estacion"` en el tipo `Seccion`). De paso: quitar el «necesita» obsoleto de Comandas del día y corregir los códigos de tarea del mapa (Tasas → F3-04, Sucursal → F5-08b, Impuestos → F3-06, Representantes → F5-01, Recetas → F8-03, Compras y mermas → F8-06) | M (tipo) · O (menú y tarjetas) | N-04 | **Hecha**: las ocho lo dicen en el menú y en su tarjeta |
| 3.2 | El acceso se alimenta del directorio de personas y no muestra a quien está de baja; «Usuarios y permisos» usa la persona en sesión | M · O · [acceso-desde-directorio](encargos/acceso-desde-directorio.md) | N-07, N-08 | **Hecha**: el acceso lista a las seis personas activas del directorio y quien usa el panel firma con su sesión |
| 3.3 | Panel en tablet: migas de `PageHeader` a 32 px (M, `@l2/ui`); en Inicio, el enlace «Dispositivos» y la cifra del turno a 32 px y rejillas sin celdas vacías con dos columnas | M · O | F-09 | **Hecha**: migas, «Dispositivos» y la cifra del turno a 32 px; rejillas sin huecos a 2, 3 y 5 columnas |

Hecho en esta ola: Tarifas y paquetes (T-7), otros puestos desde la barra (N-06), desplegables del menú
a 32 px (F-09), chip DEMO a 48 px (F-10) y DEC-25 en dominio y pantallas (N-10).

### Ola 4 · Las secciones pendientes

Todas siguen el patrón ya probado con Tarifas y con la carta: **la maestra** escribe el contrato (y el
dominio si hace falta) y el proveedor de datos; **la obrera** construye el editor en el panel —borrador,
deshacer, publicar, nada se borra— y hace que las estaciones lean lo publicado. Lo que necesita servidor
queda con su `TODO` y su tarea.

| # | Sección | Tareas | Qué hace la pantalla | Queda para el servidor |
|---|---|---|---|---|
| 4.1 | Caja → **Tasas de cambio** | F3-03, F3-04, F3-05 | Tasa vigente y su historial (que no se reescribe); capturar la tasa del día y confirmarla (administración ✅, supervisión 🔐). La barra de estación y la caja leen la tasa confirmada, y sin ella la caja no cobra en bolívares (ADR-005) | Sincronizar con el BCV y guardar el historial |
| 4.2 | Caja → **Medios de pago** *(sección nueva)* | F4-02, F4-04 | Activar y desactivar medios, terminales de punto de venta, y los datos que la caja enseña al cliente: banco, teléfono y RIF del Pago Móvil, correo de Zelle | Persistencia |
| 4.3 | Caja → **Apertura de turno** *(en /turno)* | F4-01 | Sin turno abierto, declarar el fondo inicial por moneda; sin turno no se cobra | Un turno por dispositivo (I-06) |
| 4.4 | Caja → **Cortesía con motivo** *(en /caja)* | F6-14 | Marcar líneas como cortesía con motivo de lista cerrada y autorización (`cuenta.cortesia` 🔐); aparecen en las excepciones del turno | Auditoría |
| 4.5 A ✅ | Parque → **Entrada en dos toques** ([entrada-rapida](encargos/entrada-rapida.md)) | F5-02 | Pasar pulseras, paquete por niño y teléfono del representante. En la puerta no se teclea ningún nombre (DEC-27, DEC-28) | El registro real de la estancia |
| 4.5 B ✅ | Parque → **La sala nombra y vincula** ([sala-nombra-y-vincula](encargos/sala-nombra-y-vincula.md)) | F5-08, F6-05 | En la ficha del niño: ponerle nombre después, y vincularlo con sus hermanos a una mesa abierta sin esperar al mesero (DEC-28, DEC-29) | Persistir el nombre y la vinculación |
| 4.5 C | Personas → **Representantes y niños** ([representantes](encargos/representantes.md)) | F5-01 | El directorio que hace rápida la visita siguiente: buscar por teléfono, ver niños y visitas, corregir y poner el nombre que faltó | Modelo `Guardian`/`Kid`, visitas calculadas con las estancias |
| 4.6 ✅ | Personas → **Dispositivos** ([dispositivos](encargos/dispositivos.md)) | F2-02 | Equipos con su estado (aprobado, pendiente, revocado), aprobar y revocar con motivo, y quién tiene sesión en cada uno (lo que ya sabe el panel en vivo) | Registro real; revocar cierra sesiones |
| 4.7 ✅ | Configuración → **Sucursal** ([sucursal-ajustes](encargos/sucursal-ajustes.md)) | F5-08b, F4-04c, F6-13 | Nombre, RIF y dirección; horario; formato de hora 12 h o 24 h, que cambia **todas** las superficies; umbral de residuo retenido de la caja; servicio y propina (D8, DEC-6). El aforo ya vive en Tarifas | Persistencia |
| 4.8 | Configuración → **Impuestos** | F3-06, F3-07 | Alícuotas de IVA con su vigencia e IGTF; programar un cambio con fecha, nunca reescribir el pasado. La caja calcula con lo publicado. Los valores los confirma el contador (DEC-1) | Persistencia |
| 4.9 | Configuración → **Impresoras** | F1-12, F6-09b | Impresoras de red (IP y puerto), ancho de 58 u 80 mm por estación, qué imprime cada una, vista previa del recibo y de la comanda en los dos anchos y «Imprimir prueba» simulado | Imprimir de verdad (F1-10) |
| 4.10 | Inventario → **Insumos, Recetas, Compras y mermas** | F8-01, F8-03, F8-06, F8-07 | **Aprobado el 2026-09-17** como cambio de alcance (estaba fuera de la Ruta A, §11.3). Insumos con su unidad de compra y su mínimo; recetas que dicen cuánto insumo gasta cada plato de la carta; compras y mermas como asientos, nunca ediciones. Solo interfaz: el descuento real de stock al vender es del servidor | Descontar stock con cada venta, costeo y alertas (F8-04, F8-08) |

**Orden y paralelismo.** Una obrera por defecto; dos a la vez si el cliente lo aprueba, nunca sobre los
mismos archivos:

1. **Tanda A** (sin archivos compartidos): 4.7 Sucursal ✅ · 4.6 Dispositivos ✅ · 4.5 A Entrada ✅ · 4.5 B Sala ✅ · **4.5 C Representantes (encargo escrito, sin lanzar: es lo siguiente)**.
2. **Tanda B** (tocan la caja, una detrás de otra): 4.1 Tasas → 4.2 Medios de pago → 4.4 Cortesía.
3. **Tanda C**: 4.8 Impuestos · 4.9 Impresoras · 4.3 Apertura de turno.
4. **Tanda D** (aprobada el 2026-09-17): 4.10 Inventario, en tres encargos —insumos, recetas y movimientos— porque las recetas necesitan los insumos y la carta, y los movimientos necesitan los insumos.

**Criterio de cada sección:** su contrato con pruebas; editor probado en el navegador (crear, editar,
retirar, deshacer, publicar y un error del contrato visible); la estación que lo usa cambia al publicar;
medida a 1366×768 y 1024×768; `pnpm verify` en verde.

### Ola 5 · Auditoría fina por módulos (T-8)

Una auditoría de obrera por área —parque, caja, restaurante, panel, acceso y las secciones nuevas—, con
su lista de archivos y las skills de interfaz y React. La maestra verifica cada hallazgo, prioriza y
encarga los arreglos. Ya anotado para esta ola:

- El diálogo de anular un cobro desplaza para llegar al PIN a 1366×768.
- El token `--color-base` choca con la clase `text-base` de Tailwind.
- F-11 (tarjeta de la entrada con `min-w-[280px]`), en observación.
- **Cómo se leen los permisos en las pantallas**: `can()` devuelve una palabra, no un booleano, y ya van
  tres veces que alguien escribe `actor ? can(...) : false`, que es cierto siempre. Revisar todos los
  sitios que llaman a `can` y considerar un ayudante con nombre (`alcanza(actor, accion)`).

### Ola 6 · Cierre del frontend

- Medición completa (12 tamaños y pantallas cargadas) y comprobación de T-1 a T-9.
- `pnpm audit:ui`: la medición dentro del repositorio, con Playwright como dependencia de desarrollo.
- Instalación en una tablet Android real (T-5). Mientras no haya HTTPS: `chrome://flags` → «Insecure
  origins treated as secure» con la IP del equipo.
- Decidir el teléfono (F-12).
- Actualizar PROGRESO, PENDIENTES y BITACORA, y escribir el plan del backend.

## 4. Decisiones del cliente que faltan

| # | Decisión | Propuesta |
|---|---|---|
| ~~Inventario~~ | ~~¿Se construye ahora la interfaz de inventario?~~ | **Aprobado el 2026-09-17**: entra en la Tanda D. A cambio, el cierre del frontend se alarga: el backend empieza después de esa tanda (§11.3: cada tarea nueva desplaza a otra) |
| **Informes** | Los informes del panel ejecutivo (F9-01 a F9-07) también están fuera de la Ruta A y no tienen sección | Dejarlos para después del piloto; Inicio ya enseña el día |
| D9 | Un niño que sale sin su representante | Pendiente desde FLUJOS §7 |
| D7 | Quién asigna los puestos (hoy se deduce del rol) | Pendiente |
| D13 | Número de orden continuo o diario | Hoy continuo (`#1049`) |
| F-12 | ¿El teléfono entra en el objetivo? | Revisar en la Ola 6 |
| — | Solo si el cliente lo pide: dividir la cuenta por ítems, modificadores de plato, pre-cuenta, estructura editable del plano y su historial, umbral de espera de cocina configurable | Fuera de este plan |

Decididas el 2026-09-16 y 17: la barra de estación se queda en 48 px (F-08); disposición vertical propia
solo en caja y entrada (F-07); solo la caja cobra (DEC-25); turnos genéricos (DEC-26); dos obreras en
paralelo cuando el cliente lo aprueba en cada caso. El 2026-09-18, estudiando cómo se comporta la gente en
el local: contacto del representante obligatorio (DEC-27), nombre del niño opcional (DEC-28) y vinculación
a mesa desde la puerta además del mesero (DEC-29).

## 5. Cómo se trabaja

| Carril | Quién | Toca | Nunca toca |
|---|---|---|---|
| **M** | Maestra | `packages/*` (contratos, dominio, `@l2/ui`, tokens), `docs/`, `scripts/`, decisiones, revisión y medición | Pantallas en `apps/` mientras una obrera trabaja en ellas |
| **O1, O2** | Obreras | `apps/` de su copia, según su encargo | `packages/`, `git`, el proyecto |

1. **Un archivo, un carril.** Dos obreras no comparten archivos.
2. **La maestra prepara y commitea antes de encargar**: la copia de la obrera sale de ese commit.
3. **Integración en orden**: diff entero, correcciones, `pnpm verify`, navegador, commit que dice qué
   escribió cada una. El encargo se guarda en [encargos/](encargos/) y se versiona con su código.
4. **Medición al cerrar cada ola**, también con las pantallas cargadas.
5. **Una obrera a la vez por defecto**; la segunda se pregunta al cliente.

Herramientas de diseño que ya existen y hay que usar: las variantes `bajo:` (ventana de menos de 760 px
de alto) y `apaisado:` (1024 px, o 768 px en horizontal), el marco de estaciones fijo desde 768 px, y
las container queries para lo que depende del ancho de un panel.

## 6. Registro de olas

| Ola | Cerrada | Resultado de la medición | Cambios al plan |
|---|---|---|---|
| 0 | 2026-09-16 | Línea base: 144 combinaciones, 0 scroll horizontal; hallazgos F-01 a F-12 | Plan creado; orquesta en paralelo |
| 1 | 2026-09-17 | PWA instalable sin errores; objetivos de 56 px en cobro. A 1024×600 la caja aún no dejaba cobrar; en vertical desplazaban caja, entrada, monitor y turno; la columna de cobro pedía 754 px de ventana | Ola 2 reescrita; nuevos F-13 y F-14 |
| 2 | 2026-09-17 | **192 combinaciones en 12 tamaños**: 0 fallos, 0 scroll horizontal, 0 errores, 0 textos cortados, ninguna estación desplaza la página. Caja cobrable entera en los 10 tamaños medidos con carga; arqueo con todos sus subtotales; botón principal de entrada y salida siempre a la vista en horizontal | Variantes `bajo:` y `apaisado:`; F-15 (960×600) resuelto; Ola 3 reescrita |
| 3 | En curso | Tarifas, N-06, DEC-25 hechos y probados por rol | **Plan final** (este documento): Ola 4 con las secciones pendientes |
