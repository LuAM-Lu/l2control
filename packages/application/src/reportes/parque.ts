/**
 * El informe del parque — B11-6 (M-37, U-4).
 *
 * De solo lectura, para quien ve la sucursal (`reportes.verSucursal`). De las estancias que empezaron en el periodo:
 *  · los niños por día y por hora de entrada, y el aforo pico (`picoDeAforo`);
 *  · el dinero del tiempo, línea por línea **donde terminó**: en la cuenta de la familia o, si se vinculó la pulsera, en
 *    la de una mesa (se sigue `movedTo`). Paquetes, recargas («Sube a…») y tiempo de más; lo anulado y lo cambiado por uso
 *    no cuentan (cuenta la línea que lo cobró), y lo regalado va aparte;
 *  · las estancias: cuánto duraron sin sus pausas por comida, las que salieron antes de tiempo y las cobradas por uso;
 *  · las excepciones: sin pulsera, a revisar, recogidos por otra persona y medias.
 */
import {
  ConsultaDelParqueSchema,
  InformeDelParqueSchema,
  TarifarioSchema,
  problemasDe,
  type AccountLineDto,
  type ExcepcionDelParqueDto,
  type InformeDelParqueDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { allocate, money } from "@l2/domain-money";
import { picoDeAforo } from "@l2/domain-park";
import { importeVE } from "@l2/domain-printing";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";

const USD = (minor: bigint) => ({ minor: String(minor), currency: "USD" as const });
const MIN = 60_000;

type Linea = Pick<AccountLineDto, "id" | "concept" | "kind" | "amount" | "sessionId" | "productId" | "movedTo"> & {
  cortesia?: unknown;
  anulacion?: unknown;
  porUso?: unknown;
};

export interface CasosInformeDelParque {
  /** El parque en un periodo (`ConsultaDelParqueSchema`): niños, dinero del tiempo, estancias y excepciones. */
  parque(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<InformeDelParqueDto>>;
}

/**
 * Contra qué se compara un periodo (B11-8): hasta una semana, los mismos días de la semana anterior (hoy contra el mismo día
 * de la semana pasada; esta semana contra la anterior hasta el mismo día); un mes desde su día 1, los mismos días del mes
 * anterior; si no, un periodo igual de largo, justo antes.
 */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string; con: "SEMANA" | "MES" | "PERIODO" } {
  const largo = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
  if (largo <= 7) return { desde: addDays(desde, -7), hasta: addDays(hasta, -7), con: "SEMANA" };
  if (desde.endsWith("-01") && largo <= 31 && desde.slice(0, 7) === hasta.slice(0, 7)) {
    const [a, m] = desde.split("-").map(Number) as [number, number];
    const mes = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
    const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
    // Un mes entero contra el mes anterior entero; si no, hasta el mismo día.
    const entero = Number(hasta.slice(8, 10)) === new Date(Date.UTC(a, m, 0)).getUTCDate();
    const dia = entero ? ultimo : Math.min(Number(hasta.slice(8, 10)), ultimo);
    return { desde: `${mes}-01`, hasta: `${mes}-${String(dia).padStart(2, "0")}`, con: "MES" };
  }
  return { desde: addDays(desde, -largo), hasta: addDays(desde, -1), con: "PERIODO" };
}

export function casosInformeDelParque(base: Base): CasosInformeDelParque {
  return {
    async parque(ctx, entrada, ahora = Date.now()) {
      const v = ConsultaDelParqueSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: v.error.issues[0]?.message ?? "El informe no se pudo pedir: revisa el periodo.", problemas: problemasDe(v.error) };
      const q = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<InformeDelParqueDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const zona = ajustes.zonaHoraria;
        const hoy = calendarDay(new Date(ahora).toISOString(), zona);
        const diaDe = (d: Date) => calendarDay(d.toISOString(), zona);
        const HORA = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: zona });
        const SEMANA = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zona });
        const DIA_DE_LA_SEMANA: Readonly<Record<string, number>> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

        // B11-8: el periodo pedido y el anterior se calculan igual.
        const calcular = async (desde: string, hasta: string) => {
        const inicio = new Date(startOfDay(desde, zona));
        const fin = new Date(startOfDay(addDays(hasta, 1), zona));

        const estancias = await tx.parkSession.findMany({
          where: { branchId: ctx.branchId, startedAt: { gte: inicio, lt: fin } },
          include: { kid: { select: { name: true, nickname: true } }, guardian: { select: { fullName: true } }, pauses: true, extensions: true },
          orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        });
        const ids = new Set(estancias.map((e) => e.id));
        const tarifa = await tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId }, orderBy: { version: "desc" } });
        const t = tarifa ? TarifarioSchema.safeParse(tarifa.content) : null;
        const aforo = t?.success ? t.data.policy.capacityLimit : 30;

        // Las cuentas donde están las líneas del parque: las de las familias y, siguiendo lo movido, las de las mesas.
        const cuentas = new Map<string, { kind: string; lineas: Linea[] }>();
        let porLeer = [...new Set(estancias.map((e) => e.accountId))];
        for (let paso = 0; paso < 6 && porLeer.length > 0; paso++) {
          const versiones = await tx.accountVersion.findMany({
            where: { accountId: { in: porLeer } },
            orderBy: [{ accountId: "asc" }, { version: "desc" }],
            distinct: ["accountId"],
            select: { accountId: true, content: true },
          });
          const clases = new Map((await tx.account.findMany({ where: { id: { in: porLeer } }, select: { id: true, kind: true } })).map((a) => [a.id, a.kind]));
          const siguientes = new Set<string>();
          for (const ver of versiones) {
            const lineas = ((ver.content as { lines?: Linea[] }).lines ?? []).filter((l) => (l.sessionId && ids.has(l.sessionId)) || l.id.startsWith("med-"));
            cuentas.set(ver.accountId, { kind: clases.get(ver.accountId) ?? "FAMILIA", lineas });
            for (const l of lineas) if (l.movedTo && !cuentas.has(l.movedTo)) siguientes.add(l.movedTo);
          }
          porLeer = [...siguientes];
        }

        // Cada línea del tiempo donde terminó: sin lo movido (cuenta la copia), lo anulado ni lo cambiado por uso.
        type Dinero = { paquetes: bigint; recargas: bigint; tiempoDeMas: bigint };
        const porEstancia = new Map<string, Dinero>();
        const dinero = { paquetes: [0, 0n], recargas: [0, 0n], tiempoDeMas: [0, 0n], enMesas: [0, 0n], regalado: [0, 0n] } as Record<string, [number, bigint]>;
        const sumar = (k: string, monto: bigint) => {
          dinero[k]![0] += 1;
          dinero[k]![1] += monto;
        };
        const cobradasPorUso = new Set<string>();
        for (const c of cuentas.values()) {
          for (const l of c.lineas) {
            if (!l.sessionId || !ids.has(l.sessionId)) continue;
            if (l.porUso) cobradasPorUso.add(l.sessionId);
            if (l.movedTo || l.anulacion || l.porUso || (l.kind !== "PAQUETE" && l.kind !== "EXCEDENTE")) continue;
            const monto = BigInt(l.amount.minor);
            if (l.cortesia) {
              sumar("regalado", monto);
              continue;
            }
            const clase = l.kind === "EXCEDENTE" ? "tiempoDeMas" : l.concept.startsWith("Sube a ") ? "recargas" : "paquetes";
            sumar(clase, monto);
            if (c.kind === "MESA") sumar("enMesas", monto);
            const d = porEstancia.get(l.sessionId) ?? { paquetes: 0n, recargas: 0n, tiempoDeMas: 0n };
            d[clase as keyof Dinero] += monto;
            porEstancia.set(l.sessionId, d);
          }
        }
        // Las medias (B4-9): una venta del inventario al entrar, en la cuenta de la familia (`med-<estancia>`).
        const medias = new Map<string, Linea>();
        for (const c of cuentas.values()) for (const l of c.lineas) if (l.id.startsWith("med-") && ids.has(l.id.slice(4))) medias.set(l.id.slice(4), l);

        // Una que sigue abierta cuenta hasta ahora, pero no más allá de cuando dejó de contar en el aforo: pasadas sus horas
        // de huérfana o al cambiar el día (D9, F5-13).
        const intervalo = (e: (typeof estancias)[number]) => ({
          desde: e.startedAt.getTime(),
          hasta:
            e.endedAt?.getTime() ??
            Math.min(ahora, fin.getTime(), e.startedAt.getTime() + ajustes.horasHuerfana * 60 * MIN, startOfDay(addDays(diaDe(e.startedAt), 1), zona)),
        });
        const pausaMs = (e: (typeof estancias)[number]) => {
          const pausa = e.pauses.find((x) => x.kind === "PAUSA");
          if (!pausa) return 0;
          const reanuda = e.pauses.find((x) => x.kind === "REANUDA");
          const tope = pausa.at.getTime() + (pausa.maxMinutes ?? 0) * MIN;
          const hasta = Math.min(reanuda?.at.getTime() ?? tope, tope, e.endedAt?.getTime() ?? ahora);
          return Math.max(0, hasta - pausa.at.getTime());
        };

        // Por día, por hora de entrada y por día de la semana y hora (B11-8: cuándo viene la gente).
        const dias = new Map<string, (typeof estancias)[number][]>();
        const horas = new Map<number, number>();
        const semana = new Map<string, number>();
        for (const e of estancias) {
          const d = diaDe(e.startedAt);
          dias.set(d, [...(dias.get(d) ?? []), e]);
          const h = Number(HORA.format(e.startedAt)) % 24;
          horas.set(h, (horas.get(h) ?? 0) + 1);
          const clave = `${DIA_DE_LA_SEMANA[SEMANA.format(e.startedAt)] ?? 1}|${h}`;
          semana.set(clave, (semana.get(clave) ?? 0) + 1);
        }
        const porDia = [...dias].map(([dia, xs]) => {
          const s = xs.reduce((a, e) => {
            const d = porEstancia.get(e.id);
            return d ? { paquetes: a.paquetes + d.paquetes, recargas: a.recargas + d.recargas, tiempoDeMas: a.tiempoDeMas + d.tiempoDeMas } : a;
          }, { paquetes: 0n, recargas: 0n, tiempoDeMas: 0n });
          return {
            dia,
            ninos: xs.length,
            pico: picoDeAforo(xs.map(intervalo))?.ninos ?? 0,
            paquetes: USD(s.paquetes),
            recargas: USD(s.recargas),
            tiempoDeMas: USD(s.tiempoDeMas),
            total: USD(s.paquetes + s.recargas + s.tiempoDeMas),
          };
        });

        // Las estancias.
        const salieron = estancias.filter((e) => e.status === "CERRADA" && e.closureKind === "SALIDA" && e.endedAt);
        const usado = (e: (typeof estancias)[number]) => (e.endedAt!.getTime() - e.startedAt.getTime() - pausaMs(e)) / MIN;
        const conPausa = estancias.filter((e) => e.pauses.some((x) => x.kind === "PAUSA"));
        const promedio = (xs: readonly number[]) => (xs.length === 0 ? null : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length));
        const contratado = (e: (typeof estancias)[number]) => (e.durationMinutes === null ? null : e.durationMinutes + e.extensions.reduce((n, x) => n + x.minutes, 0));

        // Por paquete: los niños que entraron con él y lo que se cobró de paquetes de esas estancias.
        const paquetes = new Map<string, { ninos: number; monto: bigint }>();
        for (const e of estancias) {
          const x = paquetes.get(e.packageName) ?? { ninos: 0, monto: 0n };
          x.ninos += 1;
          x.monto += porEstancia.get(e.id)?.paquetes ?? 0n;
          paquetes.set(e.packageName, x);
        }

        // Las excepciones.
        const nino = (e: (typeof estancias)[number]) => e.kid?.nickname ?? e.kid?.name ?? "Sin nombre";
        const excepcion = (e: (typeof estancias)[number], tipo: ExcepcionDelParqueDto["tipo"], en: Date, detalle: string): ExcepcionDelParqueDto => ({
          tipo,
          en: en.toISOString(),
          nino: nino(e),
          pulsera: e.wristbandCode,
          representante: e.guardian.fullName,
          detalle,
        });
        const excepciones: ExcepcionDelParqueDto[] = [];
        for (const e of estancias) {
          if (e.wristbandCode.startsWith("SP-")) excepciones.push(excepcion(e, "SIN_PULSERA", e.startedAt, `Entró sin pulsera: su código es ${e.wristbandCode}`));
          if (e.closureKind === "ADMINISTRATIVA") excepciones.push(excepcion(e, "A_REVISAR", e.endedAt ?? e.startedAt, `Cerrada por la dirección${e.closureReason ? `: ${e.closureReason}` : ""}${e.closedByName ? ` (${e.closedByName})` : ""}`));
          else if (e.status === "ACTIVA" && diaDe(e.startedAt) < hoy) excepciones.push(excepcion(e, "A_REVISAR", e.startedAt, "Sin salida registrada desde otro día"));
          if (e.pickedUpByGuardian === false) excepciones.push(excepcion(e, "RECOGIDO_POR_OTRO", e.endedAt ?? e.startedAt, `Lo recogió ${e.pickedUpByName ?? "otra persona"}, no su representante`));
          const m = medias.get(e.id);
          if (m) excepciones.push(excepcion(e, "MEDIAS", e.startedAt, `${m.concept.split(" · ")[0]}: ${importeVE(BigInt(m.amount.minor), "USD")}`));
        }
        excepciones.sort((a, b) => Date.parse(a.en) - Date.parse(b.en));

        const pico = picoDeAforo(estancias.map(intervalo));
        const total = (dinero.paquetes![1] ?? 0n) + (dinero.recargas![1] ?? 0n) + (dinero.tiempoDeMas![1] ?? 0n);
        const conCuanto = (k: string) => ({ cantidad: dinero[k]![0], monto: USD(dinero[k]![1]) });
        return {
          resumen: {
            ninos: estancias.length,
            pico: pico ? { ninos: pico.ninos, en: new Date(pico.en).toISOString() } : null,
            aforo,
            minutosPromedio: promedio(salieron.map(usado)),
            dinero: USD(total),
            // B11-8: lo del tiempo entre los niños que entraron (la parte entera: allocate da el resto a los primeros).
            porNino: estancias.length > 0 ? USD(allocate(money(total, "USD"), estancias.length).at(-1)!.amount) : USD(0n),
          },
          porSemanaYHora: [...semana]
            .map(([k, ninos]) => ({ dia: Number(k.split("|")[0]), hora: Number(k.split("|")[1]), ninos }))
            .sort((a, b) => a.dia - b.dia || a.hora - b.hora),
          porDia,
          porHora: [...horas].sort((a, b) => a[0] - b[0]).map(([hora, ninos]) => ({ hora, ninos })),
          dinero: {
            paquetes: conCuanto("paquetes"),
            recargas: { ...conCuanto("recargas"), minutos: estancias.reduce((n, e) => n + e.extensions.reduce((m, x) => m + x.minutes, 0), 0) },
            tiempoDeMas: conCuanto("tiempoDeMas"),
            enMesas: conCuanto("enMesas"),
            regalado: conCuanto("regalado"),
            porPaquete: [...paquetes]
              .sort((a, b) => b[1].ninos - a[1].ninos || a[0].localeCompare(b[0], "es"))
              .map(([paquete, x]) => ({ paquete, ninos: x.ninos, monto: USD(x.monto) })),
          },
          estancias: {
            salieron: salieron.length,
            enSala: estancias.filter((e) => e.status === "ACTIVA").length,
            pausas: conPausa.length,
            minutosDePausaPromedio: promedio(conPausa.map((e) => pausaMs(e) / MIN)),
            antesDeTiempo: salieron.filter((e) => {
              const c = contratado(e);
              return c !== null && usado(e) < c;
            }).length,
            porUso: new Set([...cobradasPorUso, ...salieron.filter((e) => e.durationMinutes === null).map((e) => e.id)]).size,
            invitadosDeCumpleanos: estancias.filter((e) => e.eventReservationId !== null).length,
          },
          excepciones,
        };
        };

        const actual = await calcular(q.desde, q.hasta);
        const previo = periodoAnterior(q.desde, q.hasta);
        const antes = await calcular(previo.desde, previo.hasta);
        return InformeDelParqueSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          periodo: { desde: q.desde, hasta: q.hasta },
          ...actual,
          anterior: {
            ...previo,
            ninos: antes.resumen.ninos,
            dinero: antes.resumen.dinero,
            porNino: antes.resumen.porNino,
            minutosPromedio: antes.resumen.minutosPromedio,
            pico: antes.resumen.pico?.ninos ?? null,
          },
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
