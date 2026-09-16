Construye el editor de «Tarifas y paquetes» del back-office (tareas F5-04 y F5-06) y haz que la entrada al parque, la salida y el tablero de Inicio usen el tarifario publicado en vez del de ejemplo fijo.

CONTEXTO QUE YA EXISTE (léelo antes de escribir):
- packages/contracts/src/park.ts → PricePackageSchema (id, name, mode PREPAGO|POSTPAGO, duration fixed{minutes}|openEnded, price, active), ParkPolicySchema (graceMinutes, penaltyBlockMinutes, penaltyPricePerBlock, warnBeforeMinutes, capacityLimit) y TarifarioSchema { packages, policy }, que valida el conjunto: al menos un paquete a la venta, precios mayores que cero y en dólares, nombres no repetidos entre los activos, pase libre (openEnded) solo en POSTPAGO, y el aviso de «por vencer» menor que el paquete activo más corto. NO lo modifiques.
- Un paquete se RETIRA con active: false; nunca se borra (las estancias de ayer lo nombran por su id).
- apps/web/src/features/mesas/CartaProvider.tsx y EditorCarta.tsx → el patrón EXACTO a copiar (proveedor con publicar; editor con borrador, deshacer, rehacer, «Publicar», hoja de edición montada con key, error del contrato visible junto a «Publicar»). Léelos enteros.
- apps/web/src/demo/parque.ts → DEMO_PACKAGES y la política dentro de demoSnapshot().
- apps/web/app/layout.tsx → dónde se montan los proveedores.
- apps/web/src/features/park/CheckInScreen.tsx, PackagePicker.tsx y CheckoutScreen.tsx → quienes usan paquetes y política.
- apps/web/app/(admin)/panel/page.tsx y apps/web/src/features/shell/EnVivo.tsx → Inicio recibe la política como prop `politica`.
- packages/ui/src/index.ts → componentes disponibles. packages/domain/money/src/index.ts → fromMajor(texto, "USD"), que LANZA si el texto no es un número.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. apps/web/src/demo/parque.ts
   - Extrae la política de demoSnapshot a una constante exportada DEMO_POLICY (mismos valores) y haz que demoSnapshot la use.
   - Exporta TARIFARIO_DEMO: TarifarioDto = TarifarioSchema.parse({ packages: DEMO_PACKAGES, policy: DEMO_POLICY }).

2. NUEVO apps/web/src/features/park/TarifarioProvider.tsx
   Copia el patrón de CartaProvider: contexto con { tarifario: TarifarioDto; publicar(t: TarifarioDto): void }, clave de sessionStorage "l2:tarifario:v1", validación con TarifarioSchema (safeParse al cargar, parse al publicar). Exporta TarifarioProvider({ inicial, children }) y useTarifario(), que lanza un Error claro fuera del proveedor. Con comentario de cabecera y el TODO del backend, como CartaProvider.

3. apps/web/app/layout.tsx
   Monta <TarifarioProvider inicial={TARIFARIO_DEMO}> justo dentro de <CartaProvider>. src/demo SOLO se importa desde app/**.

4. NUEVO apps/web/src/features/park/EditorTarifario.tsx ("use client")
   Pantalla del panel con el estilo de EditorCarta:
   - <Container ancho="panel"> y <PageHeader> con migas: Abby Kingdom (/panel) / Parque (/panel/parque) / Tarifas y paquetes.
   - BORRADOR local de todo el tarifario, con Deshacer, Rehacer, «Descartar cambios» y «Publicar». Publicar valida con TarifarioSchema.safeParse y, si falla, muestra el mensaje del primer error en texto visible junto al botón.
   - Sección «Paquetes»: filas con nombre, duración legible («30 min», «1 h», «1 h 30 min», «Tiempo libre»), modo («Se paga al entrar» / «Se paga al salir») y precio con <MoneyDisplay>. Acciones: «Editar» y «Retirar» (active: false, con <Dialog> de confirmación que explique que se conserva para las estancias anteriores). Los retirados, aparte, plegados, con «Volver a la venta».
   - «Añadir paquete» y «Editar» en <Sheet> montada con key: nombre; tipo («Tiempo fijo» o «Tiempo libre»); si es fijo, minutos (entero > 0, error junto al campo); precio en dólares como texto (acepta coma, fromMajor dentro de try/catch, error junto al campo si no es > 0). Tiempo fijo ⇒ mode PREPAGO; tiempo libre ⇒ mode POSTPAGO y duration { kind: "openEnded" }. Id nuevo con el mismo método que EditorCarta (contador, nunca releer Date.now() en bucle).
   - Sección «Reglas del parque»: campos numéricos para gracia (min, ≥ 0; el texto aclara que 0 es «sin gracia»), bloque de excedente (min, > 0), precio por bloque (dólares, ≥ 0), aviso antes de vencer (min, ≥ 0) y aforo (niños, > 0). Cada campo con su error junto a él. Debajo, una frase de ejemplo que se recalcula con los valores del borrador: «Con estas reglas, un niño que se pasa 20 minutos paga 2 bloques: $ 3.00» (bloques = techo((minutos pasados − gracia) / bloque), 0 si no supera la gracia; calcula el dinero con multiply de @l2/domain-money, nunca con number).
   - Superficie de administración (min-h-8), tokens de color como EditorCarta, estado con color + icono + texto, cifras con tnum, sin emoji, textos en español de Venezuela. Estados vacíos con texto.

5. apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx
   Añade "parque/tarifas": () => <EditorTarifario /> al mapa PANTALLAS.

6. apps/web/src/features/shell/navigation.ts
   Sección id "tarifas": href: rutaSeccion("parque", "tarifas"); quita necesita; conserva accion "catalogo.modificar"; tarea "F5-04"; proposito: "Paquetes por tiempo, gracia, excedente, aviso y aforo. Se edita en borrador y la entrada lo usa al publicar."

7. La entrada usa el tarifario publicado
   - CheckInScreen deja de recibir packages y capacityLimit por props: los toma de useTarifario() (packages = solo los active; capacityLimit = policy.capacityLimit). El paquete por defecto sigue siendo "pkg-60" si está activo; si no, el primero activo.
   - apps/web/app/(estacion)/entrada/page.tsx deja de pasar packages y capacityLimit (y de importar DEMO_PACKAGES si ya no lo usa).
   - OJO: donde se busca un paquete por id para una entrada ya creada, usa la lista COMPLETA, retirados incluidos.

8. La salida y el tablero usan la política publicada
   - CheckoutScreen: construye const snap = useMemo(() => ({ ...snapshot, policy: tarifario.policy }), [snapshot, tarifario.policy]) y usa snap en lugar de snapshot en todo el componente.
   - EnVivo: toma la política de useTarifario() en lugar de la prop politica. Quita la prop politica de EnVivo y de InicioScreen, y deja de pasarla en apps/web/app/(admin)/panel/page.tsx.
   - El monitor (/monitor) calcula su modelo en el SERVIDOR y no puede leer el proveedor: NO lo toques. Deja un comentario TODO(F5-06/backend) en apps/web/app/(estacion)/monitor/page.tsx diciendo que la política vendrá del servidor.

NO HAGAS:
- No toques nada fuera de apps/. Si algo necesitara cambiar en packages/, no lo hagas y dilo en el resumen.
- No añadas dependencias ni cambies package.json.
- No toques el simulador (apps/web/src/features/simulacion): sus escenarios tienen su propia política a propósito.
- No borres ni renombres archivos existentes.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú, desde la raíz de la copia, y lee su salida: no lo des por supuesto). Después, resume qué archivos tocaste, qué decisiones tomaste y qué quedó pendiente.
