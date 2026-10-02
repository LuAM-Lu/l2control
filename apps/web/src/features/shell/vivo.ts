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
import type { Route } from "next";
import type { FamilyAccountDto, ParkPolicyDto, PedidoDto } from "@l2/contracts";
import { sum, type Money } from "@l2/domain-money";
import { computeSessionView } from "@l2/domain-park";
import type { EstadoLocal } from "../operacion/proyeccion.ts";
import { pendiente } from "../cuentas/cuentas.ts";
import { toEpochMs, toParkPolicy, toParkSession } from "../park/mappers.ts";
import { rutaSeccion } from "./navigation.ts";

/** Donde se resuelve todo lo de la tasa: la pantalla de tasas, no la caja (B2-1c). */
const TASAS = rutaSeccion("ajustes", "tasas");

/**
 * Una zona en apuros se dice con palabras, no solo con color (§8.2), y **lleva
 * a donde se resuelve**: un aviso que obliga a buscar la pantalla se ignora.
 */
export type Alerta = Readonly<{
  texto: string;
  tono: "warn" | "crit";
  href: Route;
  /** Qué se va a hacer allí, en imperativo corto: «Ver la sala», «Cobrar». */
  accion: string;
}>;

export type ZonaParque = Readonly<{
  enSala: number;
  aforo: number;
  porVencer: number;
  vencidas: number;
  alertas: readonly Alerta[];
}>;

/** Las comandas de hoy (B6-2, ADR-022): la cocina trabaja con el papel; aquí importa si salió. */
export type ZonaComandas = Readonly<{
  hoy: number;
  /** Esperando a la impresora o imprimiéndose. */
  enCola: number;
  /** No salieron en papel: la cocina no sabe que existen. */
  noSalieron: number;
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
  comandas: ZonaComandas;
  mesas: ZonaMesas;
  caja: ZonaCaja;
  personas: ZonaPersonas;
  /** Cuántas cosas piden atención ahora mismo, sumando las cinco zonas. */
  urgencias: number;
}>;

/**
 * Los puestos que deberían tener a alguien en hora de servicio (D7). La cocina no: trabaja con la
 * comanda impresa y no entra en el sistema (ADR-022), así que «sin nadie en cocina» sería siempre falso.
 */
export const PUESTOS_DE_SERVICIO: readonly { id: string; nombre: string }[] = [
  { id: "caja", nombre: "Caja" },
  { id: "taquilla", nombre: "Taquilla" },
  { id: "salon", nombre: "Salón" },
];

/** Las rutas son literales: así las comprueba el tipado de rutas de Next. */
const aviso = (texto: string, tono: "warn" | "crit", href: Route, accion: string): Alerta => ({
  texto,
  tono,
  href,
  accion,
});

const minutos = (desde: string, ahora: number) => (ahora > 0 ? Math.max(0, Math.floor((ahora - Date.parse(desde)) / 60_000)) : 0);

export function panelVivo({
  estado,
  cuentas,
  ahora,
  politica,
  pedidos = [],
  enServicio,
  tasaConfirmada,
  alertasDeTasa = [],
  huerfanas = 0,
}: {
  estado: EstadoLocal;
  cuentas: readonly FamilyAccountDto[];
  ahora: number;
  politica: ParkPolicyDto;
  /** Los pedidos de hoy con su comanda, del servidor (B6-2). */
  pedidos?: readonly PedidoDto[];
  /** Si el local está abierto: fuera de servicio, un puesto vacío no es noticia. */
  enServicio: boolean;
  /** Si hay tasa vigente (ADR-005). Sin ella no se cobra en bolívares. */
  tasaConfirmada: boolean;
  /** Lo que el servidor dice de la tasa: una del BCV que no se aplicó sola, o la que falta (ADR-019). */
  alertasDeTasa?: readonly { mensaje: string; tono: "warn" | "crit" }[];
  /** Estancias a revisar (F5-13): abiertas desde otro día o con más de 8 horas. */
  huerfanas?: number;
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
        ? [aviso(`${vencidas} ${vencidas === 1 ? "estancia cumplida" : "estancias cumplidas"} sin liquidar`, "crit", "/monitor", "Ver la sala")]
        : []),
      // Solo mientras no haya ninguna cumplida: si ya se pasó el tiempo, el
      // aviso de «va a pasar» es ruido encima del que importa.
      ...(vencidas === 0 && porVencer > 0
        ? [aviso(`${porVencer} por vencer en los próximos minutos`, "warn", "/monitor", "Ver la sala")]
        : []),
      ...(huerfanas > 0
        ? [aviso(`${huerfanas} ${huerfanas === 1 ? "estancia" : "estancias"} a revisar: sin salida registrada`, "warn", "/monitor", "Revisar")]
        : []),
      ...(estado.sesiones.length >= politica.capacityLimit
        ? [aviso("Aforo lleno", "warn", "/entrada", "Ver la entrada")]
        : []),
    ],
  };

  /* ── comandas ── */
  const noSalieron = pedidos.filter((p) => p.comanda.estado === "NO_SALIO").length;
  const comandas: ZonaComandas = {
    hoy: pedidos.length,
    enCola: pedidos.filter((p) => p.comanda.estado === "EN_COLA").length,
    noSalieron,
    alertas:
      noSalieron > 0
        ? [aviso(noSalieron === 1 ? "Una comanda no salió en papel" : `${noSalieron} comandas no salieron en papel`, "crit", "/mesas", "Volver a imprimir")]
        : [],
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
        ? [aviso(`Una mesa pidió la cuenta hace ${esperaCuentaMin} min`, "warn", "/mesas", "Ver el salón")]
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
      // Sin tasa vigente no se cobra en bolívares (ADR-005): es lo primero que hay que resolver,
      // y se resuelve en la pantalla de tasas, no en la caja (B2-1c).
      ...(tasaConfirmada ? [] : [aviso("Sin tasa vigente: la caja no cobra en bolívares", "crit", TASAS, "Ver tasas")]),
      ...alertasDeTasa.map((a) => aviso(a.mensaje, a.tono, TASAS, "Revisar")),
      ...(fuera.length > 0
        ? [aviso(`${fuera.length} ${fuera.length === 1 ? "cuenta" : "cuentas"} con la familia ya fuera`, "crit", "/caja", "Cobrar")]
        : []),
      ...(esperaMax >= 10 ? [aviso(`Alguien lleva ${esperaMax} min esperando en caja`, "warn", "/caja", "Cobrar")] : []),
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
        ? [aviso(`Sin nadie en ${vacios.map((p) => p.nombre.toLowerCase()).join(", ")}`, "warn", "/acceso", "Ver dispositivos")]
        : [],
  };

  const urgencias = [parque, comandas, mesas, caja, personas].reduce((n, z) => n + z.alertas.length, 0);
  return { parque, comandas, mesas, caja, personas, urgencias };
}
