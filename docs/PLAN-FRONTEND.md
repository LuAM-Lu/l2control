# Plan del frontend: terminar, adaptar e instalar

> **Creado el 2026-09-16** a partir de la [auditoría del frontend](AUDITORIA-FRONTEND.md). Es la tarea
> **F1-21** del plan. Al terminarlo, el frontend se da por cerrado y se pasa al backend.
>
> **Es un plan evolutivo.** Se ejecuta por **olas**. Al cerrar cada ola se vuelve a medir la app, se
> actualiza la auditoría y se reescribe la ola siguiente con lo aprendido. Lo que está escrito para
> después de la próxima ola es una intención, no un compromiso.
>
> **Se ejecuta en orquesta** ([ORQUESTA.md](ORQUESTA.md)): la maestra (Claude) y una o más obreras
> (Gemini) trabajan **a la vez**, en carriles que no se pisan.

## 1. Cuándo está terminado el frontend

Cada punto se comprueba midiendo, no leyendo.

| # | Criterio | Cómo se comprueba |
|---|---|---|
| T-1 | Cero scroll horizontal en todas las pantallas | Medición en los 9 tamaños de la auditoría |
| T-2 | Las estaciones no desplazan a 1920, 1440, 1366, 1280×800, 1024×768 **y 1024×600** (salvo listas, como el monitor) | Medición |
| T-3 | Toda estación es usable en vertical (768×1024 y 800×1280): nada montado ni cortado | Medición y capturas |
| T-4 | Objetivos táctiles de cada superficie: KDS 64, POS 56, tablet 48, admin 32 | Medición |
| T-5 | La app se instala en Android desde Chrome, abre sin barra del navegador y las estaciones van a pantalla completa | Prueba en una tablet real (la hace el cliente) |
| T-6 | Navegación sin sorpresas: N-04, N-06 y N-07/N-08 resueltos | Recorrido por rol |
| T-7 | Pantallas pendientes del alcance de interfaz hechas: Tarifas y paquetes | Encargo aplicado y probado |
| T-8 | Auditoría de accesibilidad e interfaz por módulos sin hallazgos altos abiertos | Auditorías por área de la obrera, verificadas |
| T-9 | `pnpm verify` en verde y la medición repetible con un comando | CI local |

## 2. Cómo se trabaja en paralelo

### Carriles

| Carril | Quién | Toca | Nunca toca |
|---|---|---|---|
| **M** | Maestra | `packages/*` (contratos, dominio, `@l2/ui`, tokens), `docs/`, `scripts/`, decisiones, revisión y medición | Pantallas en `apps/` mientras una obrera trabaja en ellas |
| **O1** | Obrera 1 | `apps/` de su copia, según su encargo | `packages/`, `git`, el proyecto |
| **O2…** | Otra obrera | Igual que O1, en **otros archivos** | Lo mismo. **Solo se abre preguntando antes** al cliente |

### Las reglas que evitan choques

1. **Un archivo, un carril.** Cada encargo lista sus archivos. Dos obreras no comparten archivos; si una
   tarea los necesita, espera.
2. **La maestra prepara antes de encargar.** Lo que la obrera necesita de `packages/` se hace y se
   commitea primero: la copia de la obrera sale de ese commit.
3. **Integración en orden.** La maestra aplica los resultados de uno en uno: revisa el diff, corrige,
   corre `pnpm verify`, lo prueba en el navegador y commitea diciendo qué escribió cada una.
4. **Auditorías de obrera por áreas**, con la lista de archivos (lección de la primera auditoría).
5. **Medición al cerrar cada ola.** La repite la maestra y actualiza la auditoría y este plan.
6. **Una obrera a la vez por defecto.** Para abrir otra, se pregunta al cliente (`--otra`).

## 3. Olas

### Ola 0 · Preparar la orquesta — **hecha** (2026-09-16)
- Skills compartidas por las dos (web-design-guidelines fijada en local, react-best-practices,
  frontend-design y design-taste-frontend).
- Obreras en paralelo con permisos por copia, modelo Pro y esfuerzo alto.
- Auditoría conjunta y este plan.
- Tokens de la PWA (`--seguro-*`, `l2-solo-navegador`, `l2-solo-instalada`).

### Ola 1 · Instalable y táctil — **en curso**
| Tarea | Carril | Hallazgo | Estado |
|---|---|---|---|
| App instalable: manifiesto, iconos, service worker mínimo, pantalla completa en estaciones, botón «Instalar», márgenes seguros | O1 · [pwa-base](encargos/pwa-base.md) | F-01 | En curso |
| Decidir la altura de la barra de estación en superficies POS | M + cliente | F-08 | Pendiente de decisión |
| Objetivos táctiles de caja, ventas y turno a 56 px; mesas a 48 | O1 · `tactil-pos` (se escribe al cerrar la PWA) | F-04, F-05 | Por encargar |
| Comprobar que `Stepper` y `Tabs` de `@l2/ui` aceptan la superficie POS; si no, añadirlo | M | F-04 | Por hacer |
| Cierre de ola: medir de nuevo | M | — | — |

### Ola 2 · Tablets pequeñas y verticales
| Tarea | Carril | Hallazgo |
|---|---|---|
| Caja a 1024×600: la columna de cobro entera a la vista (teclado plegable o pasos) y conceptos del ticket sin truncar | M diseña · O1 construye | F-02 |
| Barra de estación que no se monta en vertical (pestañas en su propia fila, o chips de contexto plegados) | M diseña · O1 construye | F-03 |
| Arqueo de turno en vertical: una moneda debajo de la otra | O1 | F-03 |
| Estaciones a 1024×600 sin scroll: entrada, salida, turno, ventas | O1 (y O2 si se aprueba) | F-06 |
| Decidir qué hacer en vertical estrecho (768): disposición propia o desplazar | M + cliente | F-07 |

### Ola 3 · Navegación y lo que falta de producto
| Tarea | Carril | Hallazgo |
|---|---|---|
| Tarifas y paquetes (el contrato ya está) | O1 · [tarifas-editor](encargos/tarifas-editor.md) | T-7 |
| Avisar de que una sección abre a pantalla completa | M (tipo `Seccion`) · O1 (menú y tarjetas) | N-04 |
| Llegar a las otras estaciones alcanzables desde la barra | M diseña · O1 construye | N-06 |
| El acceso sale del directorio de personas | M | N-07, N-08 |
| Panel en tablet: rejillas sin celdas vacías y objetivos de 32 px | O1 | F-09 |

### Ola 4 · Auditoría fina por módulos
Una auditoría de obrera por área —parque, caja, restaurante, panel, acceso—, cada una con su lista de
archivos y las skills de interfaz y React. La maestra verifica, prioriza y encarga los arreglos. Las
encargadas pueden correr **en paralelo** si el cliente lo aprueba.

### Ola 5 · Cierre del frontend
- Medición completa y comprobación de T-1 a T-9.
- Prueba de instalación en una tablet Android real (el cliente).
- Llevar la medición al repo (`pnpm audit:ui`) si se aprueba la dependencia de Playwright.
- Actualizar PROGRESO, PENDIENTES y BITACORA, y abrir el plan del backend.

## 4. Decisiones que necesita el cliente

| # | Decisión | Propuesta |
|---|---|---|
| F-08 | Altura de la barra de estación en caja | Se queda en 48 (es navegación); los controles de cobro, a 56 |
| F-07 | Estaciones en tablet vertical estrecha | Disposición propia solo en caja y entrada; en el resto, desplazar es aceptable |
| F-12 | Teléfono | Fuera del objetivo; revisar al cerrar el frontend |
| — | HTTPS para instalar en tablets reales | Se resuelve con el despliegue (backend). Para probar antes: `chrome://flags` → «Insecure origins treated as secure» con la IP del equipo |
| — | Playwright como dependencia de desarrollo para `pnpm audit:ui` | Sí, en la Ola 5 |

## 5. Registro de olas

| Ola | Cerrada | Resultado de la medición | Cambios al plan |
|---|---|---|---|
| 0 | 2026-09-16 | Línea base: 0 scroll horizontal; F-01 a F-12 | Plan creado |
