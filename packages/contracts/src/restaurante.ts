/**
 * Contratos del restaurante: el plano de mesas — F6-01, B6-1.
 *
 * El número de mesas y sus sillas son **datos**, no constantes del código
 * (criterio de F6-01): DEC-7 habla de 7 a 10 mesas de 4 a 6 sillas, y el
 * relevamiento en sitio (F0-03) dirá cuántas son.
 *
 * La carta no tiene contrato propio: es el catálogo de productos (`productos.ts`) con lo que el
 * mesero ofrece marcado `enCarta`. Un solo precio con su calendario, un solo IVA y, si se cuenta, su
 * existencia (ADR-023).
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";
import { AreaDeComandaSchema, AreaDeProductoSchema, PrecioMinorSchema } from "./productos.ts";
import { FamilyAccountSchema } from "./account.ts";
import { DatosDelClienteSchema } from "./clientes.ts";

/**
 * Dónde está una mesa **en el local**, no en la pantalla — V3, D11.
 *
 * En CENTÍMETROS desde la esquina superior izquierda, y el centro de la mesa,
 * no su esquina: así girarla no la mueve de sitio. En unidades del local y no
 * en píxeles porque el mismo plano se pinta a 1366, en tablet y en móvil, y
 * porque las medidas reales del relevamiento (F0-03) entran tal cual.
 */
export const FormaMesaSchema = z.enum(["REDONDA", "CUADRADA", "RECTANGULAR"]);
export type FormaMesa = z.infer<typeof FormaMesaSchema>;

const Centimetros = z.number().int().min(0).max(5000);

export const DiningTableSchema = z.object({
  id: IdSchema,
  /**
   * Lo que se lee en la mesa y en la comanda: «3», «T1».
   *
   * Es una ETIQUETA, no la identidad: renumerar una mesa no reescribe los
   * pedidos ya cobrados, que guardaron el número que se imprimió ese día.
   */
  label: z.string().trim().min(1).max(20),
  zone: z.string().trim().min(1).max(40),
  seats: z.number().int().min(1).max(20),
  shape: FormaMesaSchema,
  /** Centro de la mesa, en cm desde la esquina superior izquierda del local. */
  x: Centimetros,
  y: Centimetros,
  /** Tamaño en cm. En una mesa redonda, el diámetro va en los dos. */
  width: Centimetros,
  height: Centimetros,
  /** Giro en grados. Solo cambia cómo se dibuja, nunca dónde está. */
  rotation: z.number().int().min(0).max(359).default(0),
  /**
   * Cuándo se retiró del salón. **Una mesa no se borra** (regla 5): los pedidos
   * y los cobros del pasado la nombran, y sin ella ese historial diría «mesa
   * desconocida». Retirada no se pinta en servicio ni se puede abrir.
   */
  retiredAt: TimestampSchema.optional(),
});
export type DiningTableDto = z.infer<typeof DiningTableSchema>;

export const FloorPlanSchema = z
  .array(DiningTableSchema)
  .min(1, "Un plano sin mesas no sirve para atender")
  .refine((mesas) => new Set(mesas.map((m) => m.id)).size === mesas.length, "Dos mesas con el mismo id")
  .refine(
    // Las retiradas conservan su número para el historial; solo las del salón
    // tienen que ser distintas entre sí, o la cocina no sabría a cuál llevar el plato.
    (mesas) => {
      const enSalon = mesas.filter((m) => !m.retiredAt).map((m) => m.label);
      return new Set(enSalon).size === enSalon.length;
    },
    "Dos mesas del salón con el mismo número: la cocina no sabría a cuál llevar el plato",
  );
export type FloorPlanDto = z.infer<typeof FloorPlanSchema>;

/**
 * Lo que no se mueve: paredes, puertas, el parque, la caja y la cocina.
 *
 * Va en su propia capa porque se edita pocas veces y porque en servicio nadie
 * debe poder tocarla (§2.3 de UX-MEJORAS: capa bloqueada).
 */
export const ElementoFijoSchema = z.object({
  id: IdSchema,
  kind: z.enum(["PARED", "PUERTA", "PARQUE", "CAJA", "COCINA", "BARRA"]),
  /** Esquina superior izquierda, en cm. Aquí sí es la esquina: son rectángulos. */
  x: Centimetros,
  y: Centimetros,
  width: Centimetros,
  height: Centimetros,
  /** Lo que se escribe encima, si lleva algo: «Parque», «Caja». */
  label: z.string().trim().max(40).optional(),
  /**
   * Contorno propio, en cm, para lo que no es un rectángulo: una barra en L es
   * UNA pieza, no dos cajas pegadas. Si viene, manda sobre el rectángulo, que
   * pasa a ser solo su caja envolvente (para colocar el rótulo).
   */
  points: z.array(z.object({ x: Centimetros, y: Centimetros })).min(3).max(24).optional(),
});
export type ElementoFijoDto = z.infer<typeof ElementoFijoSchema>;

/**
 * El plano del local: sus medidas, sus mesas y su estructura — F6-01, V3.
 *
 * Fail-closed: una mesa fuera de las paredes o dos mesas encima no son un
 * plano que se pueda publicar. Se comprueba aquí, en el contrato, para que el
 * editor (V4) y el servidor apliquen la misma regla sin repetirla.
 */
export const PlanoLocalSchema = z
  .object({
    /** Medidas del local en cm. */
    width: Centimetros,
    height: Centimetros,
    tables: FloorPlanSchema,
    fixtures: z.array(ElementoFijoSchema),
  })
  .superRefine((plano, ctx) => {
    const caja = (m: { x: number; y: number; width: number; height: number }) => ({
      x1: m.x - m.width / 2,
      y1: m.y - m.height / 2,
      x2: m.x + m.width / 2,
      y2: m.y + m.height / 2,
    });
    plano.fixtures.forEach((f, i) => {
      for (const p of f.points ?? []) {
        if (p.x > plano.width || p.y > plano.height) {
          ctx.addIssue({ code: "custom", path: ["fixtures", i], message: `${f.label ?? f.kind} se sale del local` });
          return;
        }
      }
    });
    const enSalon = plano.tables.filter((m) => !m.retiredAt);
    if (new Set(enSalon.map((m) => m.label)).size !== enSalon.length) {
      ctx.addIssue({ code: "custom", path: ["tables"], message: "Dos mesas en el salón con el mismo número" });
    }
    enSalon.forEach((m, i) => {
      const c = caja(m);
      if (c.x1 < 0 || c.y1 < 0 || c.x2 > plano.width || c.y2 > plano.height) {
        ctx.addIssue({ code: "custom", path: ["tables", i], message: `La mesa ${m.label} se sale del local` });
      }
    });
    for (let i = 0; i < enSalon.length; i += 1) {
      for (let j = i + 1; j < enSalon.length; j += 1) {
        const a = caja(enSalon[i]!);
        const b = caja(enSalon[j]!);
        if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) {
          ctx.addIssue({
            code: "custom",
            path: ["tables", j],
            message: `Las mesas ${enSalon[i]!.label} y ${enSalon[j]!.label} están una encima de otra`,
          });
        }
      }
    }
  });
export type PlanoLocalDto = z.infer<typeof PlanoLocalSchema>;

/**
 * El plano publicado de la sucursal (B6-1): la última versión, con quién y cuándo. `null` en un local
 * que todavía no lo ha dibujado: el salón dice dónde se dibuja, no inventa mesas.
 */
export const PlanoPublicadoSchema = z.object({
  plano: PlanoLocalSchema.nullable(),
  version: z.number().int().min(1).nullable(),
  publicadoEn: TimestampSchema.nullable(),
  publicadoPor: z.string().nullable(),
});
export type PlanoPublicadoDto = z.infer<typeof PlanoPublicadoSchema>;

/**
 * Publicar un plano nuevo. `sobre` es la versión que se editó (`null` si no había ninguna): si otra
 * persona publicó entre medias, choca en vez de pisarla. La hora de retirar una mesa la pone el
 * servidor.
 */
export const PublicarPlanoCommandSchema = z.strictObject({
  plano: PlanoLocalSchema,
  sobre: z.number().int().min(1).nullable(),
});
export type PublicarPlanoCommand = z.infer<typeof PublicarPlanoCommandSchema>;

/* ──────────────────────────────────────── el pedido del mesero (B6-2, ADR-022) */

/** Un plato que pide la tablet: el producto, cuántos, la nota para la cocina y el precio que enseñó. */
export const LineaPedidaSchema = z.strictObject({
  productId: z.uuid("Producto desconocido"),
  cantidad: z.number().int().min(1, "Al menos uno").max(50, "Hasta 50 de un plato por pedido"),
  nota: z.string().trim().max(80, "Una nota corta: hasta 80 caracteres").optional(),
  /** Para comprobarlo, no para creerlo: si el precio cambió desde que se enseñó, no se pide. */
  precioMinor: PrecioMinorSchema,
});
export type LineaPedidaDto = z.infer<typeof LineaPedidaSchema>;

/**
 * Enviar un pedido a cocina. `pedidoId` lo genera la tablet: reenviar el mismo (se cortó la red) no pide
 * dos veces. El precio, el IVA y la existencia son del servidor.
 *
 * A qué cuenta va (B6-7): `cuentaId` la nombra (una de las de la mesa, o una de pie). Sin ella, la de la
 * mesa `tableId` si tiene una sola, o una nueva si no tiene ninguna; con dos o más, la tablet tiene que
 * decir cuál. Sin mesa ni cuenta no hay a quién cobrarle.
 */
export const EnviarPedidoCommandSchema = z
  .strictObject({
    pedidoId: z.uuid("Pedido desconocido"),
    tableId: IdSchema.optional(),
    cuentaId: z.uuid("Cuenta desconocida").optional(),
    lineas: z.array(LineaPedidaSchema).min(1, "Un pedido sin platos no se envía").max(40, "Hasta 40 platos distintos por pedido"),
  })
  .refine((c) => c.tableId !== undefined || c.cuentaId !== undefined, { path: ["cuentaId"], message: "El pedido es de una mesa o de una cuenta de pie" });
export type EnviarPedidoCommand = z.infer<typeof EnviarPedidoCommandSchema>;

/**
 * Volver a imprimir la comanda de un pedido (sale marcada «reimpresión»). Con cocina y barra (B6-10), `area` dice cuál;
 * sin ella, la única que tenga.
 */
export const ReimprimirComandaCommandSchema = z.strictObject({ pedidoId: z.uuid("Pedido desconocido"), area: AreaDeComandaSchema.optional() });

/**
 * El mesero marca servido lo que llega a la mesa (B6-8, D-SERV; B6-11): los platos `lineas` (su posición en el pedido) o,
 * sin decirlos, «Servir todo» lo que falte. Lo ya servido queda como estaba.
 */
export const ServirPedidoCommandSchema = z.strictObject({
  pedidoId: z.uuid("Pedido desconocido"),
  lineas: z.array(z.number().int().min(0).max(39)).min(1, "Elige un plato").max(40).optional(),
  /**
   * Al pedir la cuenta, «¿Ya se sirvió todo?» → «Sí» (B6-13): se marcan servidos sin hora exacta (no se sabe cuándo
   * llegaron), y la atención no los mide como espera.
   */
  sinHora: z.boolean().optional(),
});

/**
 * Las mesas por limpiar (B6-14, M-35): sin cuentas abiertas y con su última cuenta de hoy cerrada después de la última
 * vez que se dejaron limpias. `desde`: cuándo se cerró esa cuenta.
 */
export const MesasPorLimpiarSchema = z.object({ mesas: z.array(z.object({ tableId: z.string().min(1).max(64), desde: TimestampSchema })) });
export type MesasPorLimpiarDto = z.infer<typeof MesasPorLimpiarSchema>;
/** Dejar limpia una mesa (B6-14): el mesero, y la caja y supervisión por si se olvida. */
export const MarcarMesaLimpiaCommandSchema = z.strictObject({ tableId: z.string().min(1, "Mesa desconocida").max(64) });

/** Las notas rápidas de un plato (B6-12): las más escritas para ese producto en los últimos 60 días, y las de su categoría. */
export const NotasRapidasQuerySchema = z.strictObject({ productId: z.uuid("Producto desconocido") });
export const NotasRapidasSchema = z.object({ notas: z.array(z.string().min(1).max(80)).max(5) });
export type NotasRapidasDto = z.infer<typeof NotasRapidasSchema>;

/** Deshacer, en el momento, un plato marcado servido por error (B6-11). */
export const DeshacerServidoCommandSchema = z.strictObject({ pedidoId: z.uuid("Pedido desconocido"), linea: z.number().int().min(0).max(39) });
export type DeshacerServidoCommand = z.infer<typeof DeshacerServidoCommandSchema>;

/** Lo que importa de una comanda (ADR-022 §2): si salió en papel. `@l2/domain-orders` lo decide. */
export const EstadoDeComandaSchema = z.enum(["EN_COLA", "IMPRESA", "NO_SALIO", "DESCARTADA"]);
export type EstadoDeComandaDto = z.infer<typeof EstadoDeComandaSchema>;
/** El de un pedido entero (B6-10): el de sus papeles, o `SIN_PAPEL` si todo lo suyo se sirve sin comanda. */
export const EstadoDelPedidoSchema = z.enum(["EN_COLA", "IMPRESA", "NO_SALIO", "DESCARTADA", "SIN_PAPEL"]);
export type EstadoDelPedidoDto = z.infer<typeof EstadoDelPedidoSchema>;

/** Un papel de un pedido (B6-10): la comanda de cocina o la de barra. `area: null`, la de un pedido de antes, con todo. */
export const ComandaDelPedidoSchema = z.object({
  area: AreaDeComandaSchema.nullable(),
  estado: EstadoDeComandaSchema,
  /** Dónde salió o tenía que salir. */
  impresora: z.string().nullable(),
  /** Por qué no salió, si no salió. */
  error: z.string().nullable(),
  /** Cuántas veces se volvió a imprimir. */
  reimpresiones: z.number().int().min(0),
});
export type ComandaDelPedidoDto = z.infer<typeof ComandaDelPedidoSchema>;

export const PedidoSchema = z.object({
  id: IdSchema,
  /** El correlativo de la comanda en la sucursal: el que se canta en la cocina. */
  numero: z.number().int().min(1),
  /** La mesa del pedido; sin ella, es de una cuenta de pie (B6-7). */
  tableId: IdSchema.nullable(),
  /** El número de la mesa el día del pedido; «De pie» si no tiene. */
  mesa: z.string(),
  /**
   * El nombre de su cuenta, si tiene uno propio (B6-7): la familia en una mesa compartida, o quien pide de
   * pie. La comanda lo lleva debajo de la mesa para que la cocina sepa a quién va.
   */
  nombreCuenta: z.string().nullable(),
  cuentaId: IdSchema,
  lineas: z
    .array(
      z.object({
        productId: IdSchema,
        nombre: z.string(),
        cantidad: z.number().int().min(1),
        nota: z.string().nullable(),
        /** En qué papel salió (B6-10). Sin ella, un pedido de antes: todo en uno. */
        area: AreaDeProductoSchema.optional(),
        /** Cuándo y quién lo sirvió en la mesa (B6-11); sin servir, `null`. */
        servido: z.object({ en: TimestampSchema, por: z.string(), sinHora: z.boolean().default(false) }).nullable().default(null),
      }),
    )
    .min(1),
  enviadoEn: TimestampSchema,
  enviadoPor: z.string(),
  /** Sus papeles (B6-10), cocina primero; vacío si todo se sirve sin comanda. */
  comandas: z.array(ComandaDelPedidoSchema).default([]),
  /** El pedido entero: lo que más atención pide de sus papeles (`comandas`), con la impresora y el error de ese. */
  comanda: z.object({
    estado: EstadoDelPedidoSchema,
    /** Dónde salió o tenía que salir (la impresora de comandas). */
    impresora: z.string().nullable(),
    /** Por qué no salió, si no salió. */
    error: z.string().nullable(),
    /** Cuántas veces se volvió a imprimir. */
    reimpresiones: z.number().int().min(0),
  }),
  /**
   * El último papel «ANULAR» de este pedido (B6-6), si se anuló algo: si salió o no, para que la tablet avise
   * cuando la cocina no se enteró. `null` si no se anuló nada.
   */
  anulacion: z.object({ estado: EstadoDeComandaSchema, error: z.string().nullable() }).nullable().default(null),
  /** Cada papel «ANULAR» por área (B6-10): el último de cada una. */
  anulaciones: z.array(z.object({ area: AreaDeComandaSchema.nullable(), estado: EstadoDeComandaSchema, error: z.string().nullable() })).default([]),
  /** Cuándo se sirvió su último plato y quién (B6-8, D-SERV; B6-11); si falta alguno, `null`: sigue esperando. */
  servido: z.object({ en: TimestampSchema, por: z.string() }).nullable().default(null),
});
export type PedidoDto = z.infer<typeof PedidoSchema>;

/** Los pedidos de la sucursal de hoy, del más nuevo al más viejo. */
export const PedidosDelLocalSchema = z.object({ pedidos: z.array(PedidoSchema) });
export type PedidosDelLocalDto = z.infer<typeof PedidosDelLocalSchema>;

/** Lo que devuelve enviar un pedido: el pedido con su comanda y la cuenta de la mesa como quedó. */
export const PedidoEnviadoSchema = z.object({ pedido: PedidoSchema, cuenta: FamilyAccountSchema });
export type PedidoEnviadoDto = z.infer<typeof PedidoEnviadoSchema>;

/* ──────────────────────────────── abrir una cuenta en el salón (B6-7, M-27) */

/**
 * Sentar a una familia: abre su cuenta en una mesa, o una cuenta de pie si no hay mesa. Una mesa admite
 * varias (mesas compartidas, P-3). Desde B6-9 (M-33) cada una es de un cliente con nombre, cédula y teléfono: quien
 * consume primero y paga al final tiene que poder cobrarse si se va. La cuenta se llama como él.
 *
 * `cuentaId` lo genera la tablet: reenviar la misma (se cortó la red) no abre dos. `vistas` son las
 * cuentas abiertas que la tablet veía en esa mesa: si otro equipo abrió una mientras tanto, choca en vez
 * de abrir dos para la misma familia.
 */
export const AbrirCuentaDelSalonCommandSchema = z
  .strictObject({
    cuentaId: z.uuid("Cuenta desconocida"),
    tableId: IdSchema.optional(),
    cliente: DatosDelClienteSchema,
    comensales: z.number().int().min(1, "Al menos una persona").max(30, "Hasta 30 personas"),
    vistas: z.number().int().min(0).max(20),
  });
export type AbrirCuentaDelSalonCommand = z.infer<typeof AbrirCuentaDelSalonCommandSchema>;

/** Cuántas cuentas abiertas admite una mesa compartida: más que eso ya no es una mesa, es un error. */
export const CUENTAS_POR_MESA = 6;

/* ────────────────────────────────── vincular pulseras a una mesa (F6-05, B6-3) */

/**
 * Vincula estancias del parque a la mesa `tableId`: su paquete y su excedente pendientes pasan a la
 * cuenta de la mesa, para que la familia pague una sola vez (D2). Puede juntar niños de más de una
 * familia (una mesa compartida); cada estancia se vincula una vez.
 */
export const VincularPulserasCommandSchema = z.strictObject({
  idempotencyKey: IdSchema,
  tableId: IdSchema,
  /** La cuenta de la mesa a la que van (B6-7): obligatoria si la mesa tiene más de una. */
  cuentaId: z.uuid("Cuenta desconocida").optional(),
  sessionIds: z
    .array(IdSchema)
    .min(1, "Elige al menos un niño")
    .max(30, "Demasiados niños de una vez")
    .refine((ids) => new Set(ids).size === ids.length, "Un niño se vincula una vez"),
});
export type VincularPulserasCommand = z.infer<typeof VincularPulserasCommandSchema>;

/** Lo que devuelve vincular: la cuenta de la mesa como quedó, y la de cada familia con lo que se le movió. */
export const VincularPulserasResultSchema = z.object({
  mesa: FamilyAccountSchema,
  familias: z.array(FamilyAccountSchema),
});
export type VincularPulserasResultDto = z.infer<typeof VincularPulserasResultSchema>;

/* ─────────────────────────────── desvincular una pulsera (B6-15, M-37) */

/**
 * Desvincula una estancia de la cuenta de su mesa: lo que se debe de ella vuelve a la cuenta de su familia, o pasa a
 * otra cuenta de mesa del salón (otra mesa, u otra persona de una mesa compartida), y su salida va ahí. Lo cobrado no se
 * mueve. Una cuenta de pie no recibe a un niño: su salida del parque va a una mesa o a su familia.
 */
export const DesvincularPulseraCommandSchema = z.strictObject({
  idempotencyKey: IdSchema,
  /** La cuenta de la mesa de la que sale. */
  desdeCuentaId: z.uuid("Cuenta desconocida"),
  sessionId: IdSchema,
  destino: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("FAMILIA") }),
    z.strictObject({ kind: z.literal("MESA"), cuentaId: z.uuid("Cuenta desconocida") }),
  ]),
});
export type DesvincularPulseraCommand = z.infer<typeof DesvincularPulseraCommandSchema>;

/** Lo que devuelve desvincular: la cuenta de la mesa de la que salió y la que lo recibió, como quedaron. */
export const DesvincularPulseraResultSchema = z.object({
  desde: FamilyAccountSchema,
  destino: FamilyAccountSchema,
});
export type DesvincularPulseraResultDto = z.infer<typeof DesvincularPulseraResultSchema>;

