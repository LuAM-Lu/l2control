Construye el editor de «Carta y precios» del back-office (tarea F6-03) y haz que el salón (/mesas) use la carta publicada en vez de la de ejemplo fija.

CONTEXTO QUE YA EXISTE (léelo antes de escribir):
- packages/contracts/src/restaurante.ts → MenuItemSchema (id, name, category, price, available, retiredAt opcional) y MenuSchema (valida: ids únicos, al menos un plato sin retirar, dos platos en venta no pueden llamarse igual). NO lo modifiques.
- apps/web/src/features/mesas/PlanoProvider.tsx → el patrón EXACTO a copiar para el proveedor de la carta.
- apps/web/src/features/mesas/EditorPlano.tsx → el patrón de pantalla de edición del panel (borrador local + «Publicar»).
- apps/web/src/features/mesas/MesasScreen.tsx y TomaPedido.tsx → quien consume la carta hoy.
- apps/web/app/layout.tsx → dónde se montan los proveedores.
- packages/ui/src/index.ts → los componentes disponibles (Container, PageHeader, Button, Input, Sheet, Dialog, Badge, MoneyDisplay, formatMoneyVE, avisar, cn).
- packages/domain/money/src/index.ts → fromMajor(texto, "USD") convierte a Money { amount: bigint, currency } y LANZA InvalidAmountError si el texto no es un número válido.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO apps/web/src/features/mesas/CartaProvider.tsx
   Copia el patrón de PlanoProvider: contexto con { carta: MenuDto; publicar(carta: MenuDto): void }, clave de sessionStorage "l2:carta:v1", al cargar valida con MenuSchema.safeParse (si falla, borra la clave y sigue con la inicial), publicar valida con MenuSchema.parse. Exporta CartaProvider({ inicial, children }) y useCarta(), que lanza un Error claro si se usa fuera del proveedor.

2. apps/web/app/layout.tsx
   Monta <CartaProvider inicial={CARTA_DEMO}> justo dentro de <PlanoProvider>. Importa CARTA_DEMO de "../src/demo/restaurante". Regla de arquitectura: src/demo SOLO se importa desde app/**; nunca desde src/features.

3. NUEVO apps/web/src/features/mesas/EditorCarta.tsx ("use client")
   Pantalla del panel, con el mismo estilo que EditorPlano:
   - <Container ancho="panel"> y <PageHeader> con migas: Abby Kingdom (/panel) / Restaurante (/panel/restaurante) / Carta y precios.
   - Trabaja sobre un BORRADOR local copiado de useCarta().carta. Botones «Publicar» y «Descartar cambios», activos solo si hay cambios. Publicar valida el borrador con MenuSchema.safeParse: si falla, muestra el mensaje del primer error en un texto visible junto al botón (no solo un aviso flotante) y no publica; si pasa, llama a publicar() y avisar.ok(...).
   - Platos agrupados por categoría, en el orden en que aparecen. Cada fila: nombre, precio con <MoneyDisplay> (o formatMoneyVE), chip «Agotado» si available es false, y acciones: «Editar», «Agotar»/«Reponer», «Retirar».
   - «Retirar» NUNCA borra: pone retiredAt con la hora actual (new Date().toISOString()), tras una confirmación en <Dialog> que explique que el plato deja de ofrecerse pero se conserva para las cuentas y recibos anteriores. Los retirados se listan aparte, plegados, al final, con la acción «Volver a la carta» (quita retiredAt).
   - «Añadir plato» y «Editar» abren un <Sheet> con: nombre, categoría (botones con las categorías existentes + opción de escribir una nueva) y precio en dólares como texto. Convierte el precio así: reemplaza la coma decimal por punto, llama a fromMajor(texto, "USD") dentro de try/catch; si lanza o el monto no es mayor que cero, muestra el error JUNTO AL CAMPO. Guarda el precio como { minor: m.amount.toString(), currency: "USD" }. PROHIBIDO usar number o toFixed para dinero.
   - Id de un plato nuevo: nombre en minúsculas, sin acentos (normalize("NFD").replace(/\p{M}/gu, "")), espacios a guiones, más un sufijo con Date.now().toString(36); debe ser único en el borrador.
   - Superficie de administración: objetivos táctiles de al menos 32 px (min-h-8), colores solo con las clases de tokens que ya usa EditorPlano, estado con color + icono + texto, cifras con la clase tnum, sin emoji, todos los textos en español de Venezuela.
   - Estados vacíos visibles: si una categoría o la lista de retirados está vacía, dilo con texto.

4. apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx
   Añade al mapa PANTALLAS la entrada "restaurante/carta": () => <EditorCarta />, con su import.

5. apps/web/src/features/shell/navigation.ts
   En la sección id "carta": href: rutaSeccion("restaurante", "carta"), quita la propiedad necesita, conserva accion "catalogo.modificar" y tarea "F6-03". Cambia proposito a: "Platos, categorías y precios. Se edita en borrador y el salón la ve al publicar. Los modificadores llegan después (F6-04)."

6. /mesas usa la carta publicada
   - MesasScreen deja de recibir la prop carta y la toma de useCarta().
   - apps/web/app/(estacion)/mesas/page.tsx deja de importar CARTA_DEMO y de pasar la prop.
   - TomaPedido NO ofrece platos retirados (filtra los que tienen retiredAt, también al calcular las categorías). Los agotados siguen como están.
   - OJO: donde se busca un plato por id para pintar pedidos ya hechos o calcular importes (carta.find(...)), usa la carta COMPLETA, retirados incluidos: un pedido de antes puede nombrar un plato retirado.

NO HAGAS:
- No toques nada fuera de apps/. Si algo necesitara cambiar en packages/, no lo hagas y dilo en el resumen.
- No añadas dependencias ni cambies package.json.
- No añadas modificadores de plato ni tipos de IVA: no están en el contrato todavía.
- No borres ni renombres archivos existentes.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores. Después, resume qué archivos tocaste, qué decisiones tomaste y qué quedó pendiente.
