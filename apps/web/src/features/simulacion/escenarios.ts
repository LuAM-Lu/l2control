/**
 * Escenarios del simulador — F1-19, FLUJOS.md §5.
 *
 * Cada escenario es una tarde guionizada: una lista de eventos del catálogo
 * (F1-20) con su instante. Se construyen con ayudantes que hablan el idioma
 * del local —«llega una familia», «se sientan en la mesa 3», «la cocina
 * tarda»— y **se validan contra el contrato al construirse**, igual que el
 * resto de datos de ejemplo (§11.4): un escenario mal escrito rompe al
 * arrancar, no a mitad de una demostración.
 *
 * Todo es determinista: sin azar ni reloj. Así cada pestaña genera
 * exactamente los mismos eventos y puede reconstruir el local sola.
 */
import {
  OperationEventSchema,
  type ExchangeRateDto,
  type OperationEventDto,
  type OrderItemDto,
  type ParkPolicyDto,
  type ParkSessionDto,
} from "@l2/contracts";
import type { EventoSinSello } from "./proyeccion.ts";

export type Escenario = Readonly<{
  id: string;
  nombre: string;
  descripcion: string;
  /** Instante simulado en que arranca (ISO). */
  inicio: string;
  duracionMin: number;
  politica: ParkPolicyDto;
  tasa: ExchangeRateDto;
  /** Ordenados por instante. */
  eventos: readonly OperationEventDto[];
}>;

const POLITICA: ParkPolicyDto = {
  graceMinutes: 5,
  penaltyBlockMinutes: 15,
  penaltyPricePerBlock: { minor: "150", currency: "USD" },
  warnBeforeMinutes: 10,
  capacityLimit: 30,
};

const PAQUETES = {
  "30": { id: "pkg-30", minutos: 30, minor: "300" },
  "60": { id: "pkg-60", minutos: 60, minor: "500" },
  "120": { id: "pkg-120", minutos: 120, minor: "900" },
  libre: { id: "pkg-libre", minutos: null, minor: "1200" },
} as const;
type Paquete = keyof typeof PAQUETES;

/** Evento sin identificador ni instante: los pone el guion. */
type Borrador = EventoSinSello;

/** Guion: se le dictan eventos en minutos desde el inicio. */
function guion(id: string, inicio: string) {
  const t0 = Date.parse(inicio);
  const lista: OperationEventDto[] = [];
  let n = 0;
  let codigo = 1000;

  const en = (min: number) => new Date(t0 + Math.round(min * 60_000)).toISOString();
  const emitir = (min: number, borrador: Borrador) => {
    lista.push({ ...borrador, id: `${id}-${++n}`, at: en(min) } as OperationEventDto);
  };

  /** Un niño que entra: devuelve su estancia para poder cerrarla o vincularla. */
  const nino = (min: number, familia: string, nombre: string, paquete: Paquete): ParkSessionDto => {
    const p = PAQUETES[paquete];
    const numero = ++codigo;
    const sesion: ParkSessionDto = {
      id: `${id}-s${numero}`,
      wristbandCode: `AK-${numero}`,
      kid: { id: `${id}-k${numero}`, name: `${nombre} ${familia.split(" ").at(-1)}`, nickname: nombre },
      mode: p.minutos === null ? "POSTPAGO" : "PREPAGO",
      duration: p.minutos === null ? { kind: "openEnded" } : { kind: "fixed", minutes: p.minutos },
      startedAt: en(min),
      packageId: p.id,
      packagePrice: { minor: p.minor, currency: "USD" },
    };
    emitir(min, { type: "estancia.abierta", session: sesion, family: familia });
    return sesion;
  };

  const sale = (min: number, ...sesiones: ParkSessionDto[]) => {
    for (const s of sesiones) emitir(min, { type: "estancia.cerrada", sessionId: s.id });
  };

  /** Una mesa entera: se sientan, piden, la cocina prepara, pagan y se va. */
  const mesa = (
    min: number,
    numero: number,
    personas: number,
    ninos: readonly ParkSessionDto[],
    pedidos: readonly { min: number; items: readonly OrderItemDto[]; cocina?: number }[],
    pideCuenta: number,
  ) => {
    // El id es el del plano de mesas (mesas/plano.ts): la mesa 3 del guion es
    // la mesa 3 que ve el mesero, no una mesa paralela con el mismo número.
    const tableId = `mesa-${numero}`;
    emitir(min, { type: "mesa.abierta", tableId, label: String(numero), guests: personas });
    if (ninos.length > 0) {
      emitir(min + 1, { type: "mesa.vinculada", tableId, sessionIds: ninos.map((s) => s.id) });
    }
    pedidos.forEach((p, i) => {
      const orderId = `${id}-m${numero}-p${i + 1}`;
      const cocina = p.cocina ?? 14;
      emitir(p.min, { type: "pedido.enviado", orderId, tableId, items: [...p.items] });
      emitir(p.min + 2, { type: "pedido.aceptado", orderId });
      emitir(p.min + 2 + cocina, { type: "pedido.listo", orderId });
      emitir(p.min + 4 + cocina, { type: "pedido.entregado", orderId });
    });
    emitir(pideCuenta, { type: "mesa.pide_cuenta", tableId });
    emitir(pideCuenta + 6, { type: "mesa.por_limpiar", tableId });
    emitir(pideCuenta + 12, { type: "mesa.libre", tableId });
    return tableId;
  };

  const turno = (min: number) => {
    emitir(min, { type: "sesion.iniciada", userName: "Marisol Prieto", role: "Caja", device: "Mostrador" });
    emitir(min, { type: "sesion.iniciada", userName: "Ana Rojas", role: "Monitor de parque", device: "Tablet taquilla" });
    emitir(min, { type: "sesion.iniciada", userName: "Jesús Mendoza", role: "Servicio de mesas", device: "Tablet mesero" });
    emitir(min, { type: "sesion.iniciada", userName: "Diego Salas", role: "Cocina", device: "Tablet cocina" });
  };

  const cerrar = (): readonly OperationEventDto[] => {
    lista.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    // La validación no es ceremonia: si el guion produce algo que el servidor
    // nunca emitiría, revienta aquí, al cargar, y no en plena demostración.
    return OperationEventSchema.array().parse(lista);
  };

  return { nino, sale, mesa, turno, emitir, cerrar };
}

const tasa = (inicio: string): ExchangeRateDto => ({
  id: "rate-sim",
  pair: "USD/VES",
  value: "228.41",
  source: "BCV",
  capturedAt: new Date(Date.parse(inicio) - 6 * 3_600_000).toISOString(),
  confirmed: true,
});

const pizza = (n = 1): OrderItemDto => ({ name: "Pizza margarita", quantity: n });
const jugo = (n = 1): OrderItemDto => ({ name: "Jugo de naranja", quantity: n });
const tequenos = (n = 1): OrderItemDto => ({ name: "Tequeños", quantity: n });
const hamburguesa = (n = 1): OrderItemDto => ({ name: "Hamburguesa", quantity: n });
const malta = (n = 1): OrderItemDto => ({ name: "Malta", quantity: n });

/* ═══════════════════════════════════════════════ O1 · tarde tranquila ══ */

function tardeTranquila(): Escenario {
  const inicio = "2026-09-12T18:00:00.000Z"; // 14:00 en Caracas
  const g = guion("o1", inicio);
  g.turno(0);

  // Flujo A de FLUJOS.md: 2 adultos, 2 niños, mesa 3.
  const vale = g.nino(5, "Ana Rojas", "Vale", "60");
  const santi = g.nino(5.5, "Ana Rojas", "Santiago", "30");
  g.mesa(12, 3, 2, [vale, santi], [{ min: 15, items: [jugo(2), pizza()] }], 50);
  g.sale(52, santi); // 22 min de más: se ve en rojo antes de salir
  g.sale(66, vale);

  const mateo = g.nino(20, "Luis Guerrero", "Mateo", "120");
  g.mesa(25, 5, 2, [mateo], [{ min: 28, items: [hamburguesa(), malta()] }], 110);
  g.sale(140, mateo);

  const camila = g.nino(35, "Laura Nieves", "Camila", "libre");
  g.sale(120, camila);

  const emi = g.nino(60, "Elena Paredes", "Emiliano", "60");
  const isa = g.nino(60.5, "Elena Paredes", "Isa", "60");
  g.mesa(70, 1, 3, [emi, isa], [{ min: 72, items: [tequenos(3), malta(2)] }], 125);
  g.sale(126, emi, isa);

  return {
    id: "O1",
    nombre: "Tarde tranquila",
    descripcion: "Cuatro familias, tres mesas, una a una. Los cinco flujos sin fricción.",
    inicio,
    duracionMin: 180,
    politica: POLITICA,
    tasa: tasa(inicio),
    eventos: g.cerrar(),
  };
}

/* ═══════════════════════════════════════════ P1 · sábado a las cuatro ══ */

const FAMILIAS = [
  "Ana Rojas", "Luis Guerrero", "Marisol Prieto", "Pedro Bermúdez", "Laura Nieves",
  "Rosa Alcántara", "Jorge Salas", "Elena Paredes", "Carolina Méndez", "Tomás Díaz",
  "Lucía Pérez", "Andrés Castillo", "Paula Rivas", "Daniel Suárez",
];
const NINOS = [
  "Vale", "Santiago", "Mateo", "Isa", "Camila", "Diego", "Antonella", "Emiliano",
  "Sofi", "Leo", "Lucía", "Tomás", "Martina", "Samuel", "Victoria", "Gabriel",
  "Luciana", "Andrés", "Paula", "Daniel", "Mía", "Sebastián", "Valeria", "Adrián",
  "Elena", "Joaquín", "Renata", "Matías",
];
const TURNO_PAQUETES: readonly Paquete[] = ["60", "30", "120", "60", "libre", "60", "30"];

function sabadoALasCuatro(): Escenario {
  const inicio = "2026-09-12T20:00:00.000Z"; // 16:00 en Caracas
  const g = guion("p1", inicio);
  g.turno(0);

  let mesas = 0;
  FAMILIAS.forEach((familia, i) => {
    const llega = i * 1.7;
    const a = g.nino(llega, familia, NINOS[i * 2]!, TURNO_PAQUETES[i % TURNO_PAQUETES.length]!);
    const b = g.nino(llega + 0.4, familia, NINOS[i * 2 + 1]!, TURNO_PAQUETES[(i + 3) % TURNO_PAQUETES.length]!);

    // Una de cada dos familias se sienta. La cocina, con el local lleno, tarda.
    if (i % 2 === 0 && mesas < 7) {
      mesas += 1;
      g.mesa(
        llega + 6,
        mesas,
        2 + (i % 3),
        [a, b],
        [
          { min: llega + 9, items: [pizza(), jugo(2)], cocina: 18 + (i % 4) * 3 },
          { min: llega + 40, items: [tequenos(2), malta()], cocina: 12 },
        ],
        llega + 80,
      );
    }

    const extra = (i % 3) * 4; // algunos se pasan de su tiempo
    const dura = (p: ParkSessionDto) => (p.duration.kind === "fixed" ? p.duration.minutes : 95);
    g.sale(llega + dura(a) + extra, a);
    g.sale(llega + 0.4 + dura(b) + extra, b);
  });

  return {
    id: "P1",
    nombre: "Sábado a las cuatro",
    descripcion: "Catorce familias en 25 minutos: aforo casi lleno, siete mesas y la cocina desbordada.",
    inicio,
    duracionMin: 150,
    politica: POLITICA,
    tasa: tasa(inicio),
    eventos: g.cerrar(),
  };
}

/* ═══════════════════════════════════════ X3 · impresora sin papel ══ */

function impresoraSinPapel(): Escenario {
  const inicio = "2026-09-12T19:00:00.000Z"; // 15:00 en Caracas
  const g = guion("x3", inicio);
  g.turno(0);

  const ninos = [
    g.nino(2, "Ana Rojas", "Vale", "60"),
    g.nino(4, "Luis Guerrero", "Mateo", "60"),
    g.nino(6, "Laura Nieves", "Camila", "120"),
    g.nino(8, "Elena Paredes", "Emiliano", "60"),
  ];
  g.mesa(10, 2, 2, [ninos[0]!], [{ min: 12, items: [pizza(), jugo()] }], 70);
  g.mesa(14, 4, 3, [ninos[1]!], [{ min: 22, items: [hamburguesa(2), malta(2)], cocina: 20 }], 75);
  g.mesa(16, 6, 2, [ninos[2]!], [{ min: 25, items: [tequenos(2)], cocina: 18 }], 80);

  g.emitir(20, { type: "impresora.fallo", printer: "Cocina", detail: "Sin papel" });
  g.emitir(38, { type: "impresora.recuperada", printer: "Cocina" });

  g.sale(64, ninos[0]!);
  g.sale(66, ninos[1]!);
  g.sale(70, ninos[3]!);
  g.sale(92, ninos[2]!);

  return {
    id: "X3",
    nombre: "Impresora de cocina sin papel",
    descripcion: "A los 20 minutos la impresora de cocina se queda sin papel con pedidos entrando.",
    inicio,
    duracionMin: 100,
    politica: POLITICA,
    tasa: tasa(inicio),
    eventos: g.cerrar(),
  };
}

/* ═══════════════════════════════════ X5 · plato equivocado ya en cocina ══ */

function platoEquivocado(): Escenario {
  const inicio = "2026-09-12T21:00:00.000Z"; // 17:00 en Caracas
  const g = guion("x5", inicio);
  g.turno(0);

  // Mesa 2: la hamburguesa se envió normal y era sin queso. La cocina ya la
  // estaba haciendo cuando se anuló. La anulación NO se da por vista en el
  // guion: la tiene que confirmar quien esté en la cocina (FLUJOS C5).
  g.emitir(1, { type: "mesa.abierta", tableId: "mesa-2", label: "2", guests: 3 });
  g.emitir(3, { type: "pedido.enviado", orderId: "x5-m2-p1", tableId: "mesa-2", items: [hamburguesa(), jugo(2)] });
  g.emitir(5, { type: "pedido.aceptado", orderId: "x5-m2-p1" });
  g.emitir(8, {
    type: "pedido.anulado",
    orderId: "x5-m2-p1",
    reason: "La hamburguesa era sin queso y se envió normal",
    authorizedBy: "Luis Guerrero",
  });
  g.emitir(9, {
    type: "pedido.enviado",
    orderId: "x5-m2-p2",
    tableId: "mesa-2",
    items: [{ ...hamburguesa(), note: "Sin queso" }, jugo(2)],
  });
  g.emitir(11, { type: "pedido.aceptado", orderId: "x5-m2-p2" });
  g.emitir(24, { type: "pedido.listo", orderId: "x5-m2-p2" });
  g.emitir(26, { type: "pedido.entregado", orderId: "x5-m2-p2" });
  g.emitir(40, { type: "mesa.pide_cuenta", tableId: "mesa-2" });
  g.emitir(46, { type: "mesa.por_limpiar", tableId: "mesa-2" });
  g.emitir(52, { type: "mesa.libre", tableId: "mesa-2" });

  // Mientras tanto, otra mesa normal: la cocina no para por una anulación.
  g.mesa(4, 5, 2, [], [{ min: 6, items: [pizza(), malta(2)], cocina: 16 }], 45);

  return {
    id: "X5",
    nombre: "Plato equivocado ya en cocina",
    descripcion: "Se anula una hamburguesa que la cocina ya empezó. La tarjeta queda tachada hasta que alguien la da por vista.",
    inicio,
    duracionMin: 60,
    politica: POLITICA,
    tasa: tasa(inicio),
    eventos: g.cerrar(),
  };
}

export const ESCENARIOS: readonly Escenario[] = [
  tardeTranquila(),
  sabadoALasCuatro(),
  impresoraSinPapel(),
  platoEquivocado(),
];

export function escenarioPorId(id: string | null): Escenario | null {
  return ESCENARIOS.find((e) => e.id === id) ?? null;
}
