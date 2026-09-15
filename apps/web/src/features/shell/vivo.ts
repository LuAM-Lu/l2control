/**
 * Lo que está pasando AHORA en el local — F9-08, FLUJOS flujo E.
 *
 * Funciones puras: reciben el estado del local, las cuentas y el instante, y
 * devuelven las cinco zonas del tablero ya resueltas, cada una con lo suyo y
 * con **por qué es urgente**. La pantalla solo pinta.
 *
 * El criterio de F9-08 dice «todo cambia sin recargar»; el de aquí dice qué es
 * «todo»: lo que a la administración le haría levantarse de la silla.
 */
import type { FamilyAccountDto, ParkPolicyDto } from "@l2/contracts";
import { nivelEspera, type UmbralEspera } from "@l2/domain-orders";
import { sum, type Money } from "@l2/domain-money";
import { computeSessionView } from "@l2/domain-park";
import type { EstadoLocal } from "../simulacion/proyeccion.ts";
import { pendiente } from "../cuentas/cuentas.ts";
import { toEpochMs, toParkPolicy, toParkSession } from "../park/mappers.ts";

/** Una zona en apuros se dice con palabras, no solo con color (§8.2). */
export type Alerta = Readonly<{ texto: string; tono: "warn" | "crit" }>;

export type ZonaParque = Readonly<{
  enSala: number;
  aforo: number;
  porVencer: number;
  vencidas: number;
  alertas: readonly Alerta[];
}>;

export type ZonaCocina = Readonly<{
  enCola: number;
  enPreparacion: number;
  listas: number;
  /** Espera de la comanda viva más antigua, en ms. */
  masAntiguaMs: number;
  sinTicket: number;
  impresorasCaidas: readonly string[];
  alertas: readonly Alerta[];
}>;

export type ZonaMesas = Readonly<{
  ocupadas: number;
  total: number;
  pidenCuenta: number;
  porLimpiar: number;
  /** Minutos que lleva esperando la mesa que pidió la cuenta hace más rato. */
  esperaCuentaMin: number;
  alertas: readonly Alerta[];
}>;

export type ZonaCaja = Readonly<{
  porCobrar: number;
  pendiente: Money;
  /** Cuentas cuya familia ya salió del parque: es dinero que se puede ir por la puerta. */
  familiasFuera: number;
  esperaMax: number;
  alertas: readonly Alerta[];
}>;

export type Puesto = Readonly<{
  id: string;
  nombre: string;
  /** Quién tiene sesión abierta ahí, o `null` si no hay nadie. */
  quien: string | null;
  rol: string | null;
  desdeMin: number;
}>;

export type ZonaPersonas = Readonly<{
  puestos: readonly Puesto[];
  alertas: readonly Alerta[];
}>;

export type PanelVivo = Readonly<{
  parque: ZonaParque;
  cocina: ZonaCocina;
  mesas: ZonaMesas;
  caja: ZonaCaja;
  personas: ZonaPersonas;
  /** Cuántas cosas piden atención ahora mismo, sumando las cinco zonas. */
  urgencias: number;
}>;

/** Los puestos que deberían tener a alguien en hora de servicio (D7). */
export const PUESTOS_DE_SERVICIO: readonly { id: string; nombre: string }[] = [
  { id: "caja", nombre: "Caja" },
  { id: "taquilla", nombre: "Taquilla" },
  { id: "salon", nombre: "Salón" },
  { id: "cocina", nombre: "Cocina" },
];

const minutos = (desde: string, ahora: number) => (ahora > 0 ? Math.max(0, Math.floor((ahora - Date.parse(desde)) / 60_000)) : 0);

export function panelVivo({
  estado,
  cuentas,
  ahora,
  politica,
  umbral,
  enServicio,
}: {
  estado: EstadoLocal;
  cuentas: readonly FamilyAccountDto[];
  ahora: number;
  politica: ParkPolicyDto;
  umbral: UmbralEspera;
  /** Si el local está abierto: fuera de servicio, un puesto vacío no es noticia. */
  enServicio: boolean;
}): PanelVivo {
  /* ── parque ── */
  const reglas = toParkPolicy(politica);
  const instante = toEpochMs(new Date(ahora > 0 ? ahora : 0).toISOString());
  const estancias = ahora > 0 ? estado.sesiones.map((s) => computeSessionView(toParkSession(s), reglas, instante)) : [];
  const porVencer = estancias.filter((e) => e.status === "POR_VENCER").length;
  const vencidas = estancias.filter((e) => e.status === "VENCIDA" || e.status === "EN_GRACIA").length;
  const parque: ZonaParque = {
    enSala: estado.sesiones.length,
    aforo: politica.capacityLimit,
    porVencer,
    vencidas,
    alertas: [
      ...(vencidas > 0
        ? [{ texto: `${vencidas} ${vencidas === 1 ? "estancia cumplida" : "estancias cumplidas"} sin liquidar`, tono: "crit" as const }]
        : []),
      ...(estado.sesiones.length >= politica.capacityLimit ? [{ texto: "Aforo lleno", tono: "warn" as const }] : []),
    ],
  };

  /* ── cocina ── */
  const pedidos = Object.values(estado.pedidos);
  const vivas = pedidos.filter((p) => p.estado === "ENVIADO" || p.estado === "EN_PREPARACION");
  const masAntiguaMs = vivas.reduce((max, p) => Math.max(max, ahora > 0 ? ahora - Date.parse(p.enviadoEn) : 0), 0);
  const caidas = Object.entries(estado.impresoras)
    .filter(([, i]) => i.estado === "FALLO")
    .map(([nombre]) => nombre);
  const cocina: ZonaCocina = {
    enCola: vivas.filter((p) => p.estado === "ENVIADO").length,
    enPreparacion: vivas.filter((p) => p.estado === "EN_PREPARACION").length,
    listas: pedidos.filter((p) => p.estado === "LISTO").length,
    masAntiguaMs,
    sinTicket: vivas.filter((p) => !p.impreso).length,
    impresorasCaidas: caidas,
    alertas: [
      ...(vivas.length > 0 && nivelEspera(masAntiguaMs, umbral) === "ATRASADA"
        ? [{ texto: `Una comanda lleva ${Math.floor(masAntiguaMs / 60_000)} min`, tono: "crit" as const }]
        : []),
      ...caidas.map((n) => ({ texto: `Impresora de ${n.toLowerCase()} caída`, tono: "crit" as const })),
    ],
  };

  /* ── mesas ── */
  const abiertas = Object.values(estado.mesas);
  const piden = abiertas.filter((m) => m.estado === "PIDE_CUENTA");
  const esperaCuentaMin = piden.reduce((max, m) => Math.max(max, minutos(m.desde, ahora)), 0);
  const mesas: ZonaMesas = {
    ocupadas: abiertas.filter((m) => m.estado === "OCUPADA").length,
    total: abiertas.length,
    pidenCuenta: piden.length,
    porLimpiar: abiertas.filter((m) => m.estado === "POR_LIMPIAR").length,
    esperaCuentaMin,
    alertas:
      esperaCuentaMin >= 5
        ? [{ texto: `Una mesa pidió la cuenta hace ${esperaCuentaMin} min`, tono: "warn" as const }]
        : [],
  };

  /* ── caja ── */
  const porCobrar = cuentas.filter((c) => c.status === "POR_COBRAR");
  const fuera = porCobrar.filter((c) => c.sessionIds.length > 0 && c.closedSessionIds.length === c.sessionIds.length);
  const esperaMax = porCobrar.reduce((max, c) => Math.max(max, minutos(c.pendingSince ?? c.openedAt, ahora)), 0);
  const caja: ZonaCaja = {
    porCobrar: porCobrar.length,
    pendiente: sum(porCobrar.map(pendiente), "USD"),
    familiasFuera: fuera.length,
    esperaMax,
    alertas: [
      ...(fuera.length > 0
        ? [{ texto: `${fuera.length} ${fuera.length === 1 ? "cuenta" : "cuentas"} con la familia ya fuera`, tono: "crit" as const }]
        : []),
      ...(esperaMax >= 10 ? [{ texto: `Alguien lleva ${esperaMax} min esperando en caja`, tono: "warn" as const }] : []),
    ],
  };

  /* ── personas conectadas (D7) ── */
  const puestos = PUESTOS_DE_SERVICIO.map((p) => {
    const sesion = estado.conectados[p.id] ?? null;
    return {
      id: p.id,
      nombre: p.nombre,
      quien: sesion?.userName ?? null,
      rol: sesion?.role ?? null,
      desdeMin: sesion ? minutos(sesion.desde, ahora) : 0,
    };
  });
  const vacios = puestos.filter((p) => p.quien === null);
  const personas: ZonaPersonas = {
    puestos,
    alertas:
      enServicio && vacios.length > 0
        ? [{ texto: `Sin nadie en ${vacios.map((p) => p.nombre.toLowerCase()).join(", ")}`, tono: "warn" as const }]
        : [],
  };

  const urgencias = [parque, cocina, mesas, caja, personas].reduce((n, z) => n + z.alertas.length, 0);
  return { parque, cocina, mesas, caja, personas, urgencias };
}

/** «12:05» de reloj de pared, para la comanda más antigua. */
export function reloj(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
