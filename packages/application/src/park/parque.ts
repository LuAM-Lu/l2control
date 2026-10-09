/**
 * El parque en el servidor — B4-1, B4-2, B4-3, F5-02, F5-05 a F5-08, F5-14, ADR-010, DEC-21.
 *
 * Hasta aquí las estancias vivían en el navegador: la sala de otro equipo no veía a nadie, el
 * cronómetro era el reloj de la tablet y el precio del paquete y del excedente los ponía la pantalla.
 * Ahora cada cosa la decide quien debe:
 *
 *  · **La entrada** abre, en UNA transacción, las estancias con la hora del servidor, el paquete y sus
 *    condiciones copiados del tarifario vigente, y la cuenta de la familia con el precio de ese
 *    tarifario (en prepago, ya en la cola de la caja). El aforo se comprueba con un candado por
 *    sucursal: dos entradas a la vez no cuelan un niño de más. Una pulsera tiene una estancia activa.
 *  · **La salida** calcula el excedente con el reloj del servidor y las condiciones de la entrada
 *    (`settleAtExit`), lo añade a la cuenta (`registerExit`) y cierra las estancias. Si se carga a una
 *    mesa (F5-14, D-RES, B6-3), lo pendiente de esas estancias pasa a la cuenta de la mesa
 *    (`moveSessionLines`, el mismo mando que usa vincular pulseras) en la misma transacción.
 *  · **La sala** es la foto de los niños dentro con la hora del servidor, de la que la pantalla solo
 *    interpola (ADR-010). Las **huérfanas** (de un día anterior o de más de 8 horas, F5-13) van
 *    aparte: no cuentan en el aforo, no se cobran por olvidadas y las cierra la dirección.
 *  · **La recarga** suma un tramo de tiempo a una estancia y su precio a la cuenta (F5-11).
 *
 * La entrada y la salida llevan su clave: un reintento devuelve lo que ya se hizo, no lo repite.
 */
import { randomUUID } from "node:crypto";
import {
  CheckInCommandSchema,
  ConsultarPulseraSchema,
  EstadoPulseraSchema,
  type EstadoPulseraDto,
  CheckoutCommandSchema,
  CierreHuerfanaCommandSchema,
  AnularEntradaCommandSchema,
  RecargaCommandSchema,
  EstanciaSchema,
  FamilyAccountSchema,
  MonitorSnapshotSchema,
  NombrarEstanciaCommandSchema,
  PausaCommandSchema,
  ParkTermsSchema,
  TarifarioSchema,
  problemasDe,
  type CheckInResult,
  type CheckoutResult,
  type EstanciaDto,
  type FamilyAccountDto,
  type MonitorSnapshotDto,
  type ParkTermsDto,
  type PausaDto,
  type PricePackageDto,
  type RecargaResult,
  type Rechazo,
  type Resultado,
  type SettlementLineDto,
  type TarifarioDto,
} from "@l2/contracts";
import { annulEntry, chargeByUsage, moveSessionLines, registerExit, registerRecharge, type AccountLineDoc } from "@l2/domain-cash";
import { add, money } from "@l2/domain-money";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import {
  admits,
  epochMs,
  fixed,
  isOrphan,
  orphanAfterMs,
  wristbandSeriesProblem,
  openEnded,
  parkPolicy,
  computeSessionView,
  paquetePorUso,
  pauseProblem,
  pausedMs,
  isWristbandless,
  nextWristbandlessNumber,
  wristbandlessCode,
  WRISTBANDLESS_PREFIX,
  resumeProblem,
  settleAtExit,
  withRecharges,
  type Duration,
  type PaqueteDeUso,
  type ParkPolicy,
  type ParkSession as SesionDelDominio,
  type Pause,
} from "@l2/domain-park";
import type { Action } from "@l2/domain-identity";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import { ajustesDe, zonaDe } from "../sucursal/ajustes.ts";
import { catalogoEn, claveSecundaria, guardarVersion, siguienteNumero, vigenteDe } from "../caja/cuentas.ts";
import { asentarExistencias, comprobarExistencias } from "../inventario/existencias.ts";
import { asentarRegistroEn, cargaParaRegistrar, marcaDePapel, type EnPapel } from "../caja/papel-en.ts";
import { candadoDeMesas, cuentaDeMesaPara, cuentasDeLasMesas, mesaParaCuentaNueva, mesaSinCuenta, sessionsVinculadas } from "../restaurante/plano.ts";
import { claveDeNombre, representanteDeLaEntrada } from "./representantes.ts";

export interface CasosParque {
  /** Los niños en sala, con la hora del servidor y la política vigente (aforo, avisos). */
  sala(ctx: Contexto, ahora?: number): Promise<Resultado<MonitorSnapshotDto>>;
  /**
   * Registra una entrada (`CheckInCommandSchema`): estancias y cuenta de la familia, juntas. `papel` solo lo
   * pasa `casosPapel` (B3-7, ADR-027): lo anotado en el formulario, con su hora real en `ahora`; no cuenta el
   * aforo, porque ya ocurrió.
   */
  entrar(ctx: Contexto, entrada: unknown, ahora?: number, papel?: EnPapel): Promise<Resultado<CheckInResult>>;
  /**
   * Registra la salida de niños de UNA familia (`CheckoutCommandSchema`) y liquida su tiempo de más. `papel`,
   * como en `entrar`: la salida anotada en el formulario, con su hora real en `ahora`.
   */
  salir(ctx: Contexto, entrada: unknown, ahora?: number, papel?: EnPapel): Promise<Resultado<CheckoutResult>>;
  /** Pone o corrige el nombre del niño de una estancia en sala (`NombrarEstanciaCommandSchema`, DEC-28). */
  nombrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstanciaDto>>;
  /** Recarga tiempo a una estancia en sala (`RecargaCommandSchema`, F5-11). */
  recargar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<RecargaResult>>;
  /**
   * Pausa el tiempo de un niño que sale a comer, o termina su pausa antes del máximo (`PausaCommandSchema`,
   * B4-7, M-27). Una pausa por visita; el máximo es el de los ajustes de la sucursal al pausar.
   */
  pausa(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstanciaDto>>;
  /**
   * Anula la entrada de un niño registrada por error (`AnularEntradaCommandSchema`, B4-10, M-27): sale de la sala sin
   * cobro, su paquete deja de cobrarse y su pulsera vuelve a servir. `autorizacion` es la 🔐 de administración cuando
   * quien la pide es supervisión. Si su paquete ya se cobró, primero se anula ese cobro en la caja.
   */
  anularEntrada(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<{ account: FamilyAccountDto }>>;
  /** Cierra una estancia huérfana (`CierreHuerfanaCommandSchema`, F5-13): sin tiempo de más, con motivo. */
  cerrarHuerfana(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<{ account: FamilyAccountDto }>>;
  /** Niños que entraron hoy y el mismo día de la semana pasada, en el día del local (Inicio). */
  atendidos(ctx: Contexto, ahora?: number): Promise<Resultado<{ hoy: number; semanaPasada: number }>>;
  /**
   * Si una pulsera se puede usar en una entrada (`ConsultarPulseraSchema`, V-1): libre, en sala, ya
   * usada o de otra serie. Es un aviso al pasarla; la entrada lo vuelve a comprobar con su candado.
   */
  pulsera(ctx: Contexto, entrada: unknown): Promise<Resultado<EstadoPulseraDto>>;
}

/** Quién ve la sala: quien trabaja con el parque o con sus cuentas (entrada, salida, salón y caja). */
const VEN_LA_SALA: readonly Action[] = ["parque.checkIn", "parque.checkOut", "parque.vincularMesa", "documento.emitir"];

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});
const sinTarifario: Rechazo = {
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: "Esta sucursal no tiene tarifario publicado: publícalo en Ajustes → Tarifas y paquetes.",
};

/** Una estancia con su familia y su niño (si tiene nombre). Las recargas van aparte: ver `estancias`. */
const CON_FAMILIA = {
  guardian: { select: { fullName: true } },
  kid: { select: { id: true, name: true, nickname: true } },
} as const;

type BusquedaDeEstancias = Omit<NonNullable<Parameters<Transaccion["parkSession"]["findMany"]>[0]>, "include" | "select">;

/**
 * Las estancias con lo que hace falta para contarlas: su familia, su niño y sus recargas en orden.
 * Las recargas van en su propia consulta: con tres relaciones en un `include`, Prisma lanza sus
 * consultas a la vez sobre la única conexión de la transacción (aviso de pg hoy, error en pg@9).
 */
async function estancias(tx: Transaccion, busqueda: BusquedaDeEstancias): Promise<FilaDeEstancia[]> {
  const filas = await tx.parkSession.findMany({ ...busqueda, include: CON_FAMILIA });
  if (filas.length === 0) return [];
  const recargas = await tx.parkSessionExtension.findMany({
    where: { sessionId: { in: filas.map((f) => f.id) } },
    select: { sessionId: true, minutes: true, packageName: true, priceMinor: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // La pausa por comida de cada una (B4-7), en su propia consulta (como las recargas).
  const pausas = await tx.parkSessionPause.findMany({
    where: { sessionId: { in: filas.map((f) => f.id) } },
    select: { sessionId: true, kind: true, at: true, maxMinutes: true },
  });
  // Los paquetes del tarifario con que entró cada estancia (B4-6): por ellos se cobra si sale antes de tiempo.
  const versiones = await tx.parkTariffVersion.findMany({
    where: { branchId: { in: [...new Set(filas.map((f) => f.branchId))] }, version: { in: [...new Set(filas.map((f) => f.tariffVersion))] } },
    select: { branchId: true, version: true, content: true },
  });
  const paquetesDe = new Map(
    versiones.map((v) => {
      const t = TarifarioSchema.safeParse(v.content);
      const activos = t.success ? t.data.packages.filter((p) => p.active).map((p) => ({ name: p.name, duration: p.duration, price: p.price })) : [];
      return [`${v.branchId}:${v.version}`, activos] as const;
    }),
  );
  return filas.map((f) => ({
    ...f,
    extensions: recargas.filter((r) => r.sessionId === f.id).map(({ sessionId: _, ...r }) => r),
    pauses: pausas.filter((x) => x.sessionId === f.id).map(({ sessionId: _, ...x }) => x),
    porUso: paquetesDe.get(`${f.branchId}:${f.tariffVersion}`) ?? [],
  }));
}

/** Una estancia, o `null`. */
async function estancia(tx: Transaccion, where: NonNullable<BusquedaDeEstancias["where"]>): Promise<FilaDeEstancia | null> {
  return (await estancias(tx, { where, take: 1 }))[0] ?? null;
}

/** Una estancia que tiene que existir (la acaba de leer o de escribir la misma transacción). */
async function estanciaQueExiste(tx: Transaccion, where: NonNullable<BusquedaDeEstancias["where"]>): Promise<FilaDeEstancia> {
  const f = await estancia(tx, where);
  if (!f) throw new Error("La estancia que se acaba de leer ya no está en la transacción.");
  return f;
}

/**
 * Los códigos de `n` niños que entran sin pulsera (B4-8): correlativos por sucursal («SP-00001»), sobre los que ya
 * se usaron (cada uno es de una visita, V-1). Con el candado del parque: dos entradas a la vez no repiten código.
 */
async function codigosSinPulsera(tx: Transaccion, branchId: string, n: number): Promise<string[]> {
  if (n === 0) return [];
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`parque:${branchId}`}, 0))::text AS candado`;
  const usados = await tx.parkSession.findMany({ where: { branchId, wristbandCode: { startsWith: WRISTBANDLESS_PREFIX } }, select: { wristbandCode: true } });
  const primero = nextWristbandlessNumber(usados.map((u) => u.wristbandCode));
  return Array.from({ length: n }, (_, i) => wristbandlessCode(primero + i));
}

/**
 * Las estancias que no son de una entrada anulada (B4-10). En SQL, «distinto de ANULADA» deja fuera también las que no
 * tienen tipo de cierre (las activas): por eso se dice el nulo aparte.
 */
const SIN_ANULADAS = { OR: [{ closureKind: null }, { closureKind: { not: "ANULADA" } }] };

/** Cómo decide la sucursal qué estancia es huérfana: su zona (qué día es hoy) y sus horas (D9, B4-4). */
type ReglaDeHuerfanas = Readonly<{ zona: string; afterMs: number }>;

async function reglaDeHuerfanas(tx: Transaccion, branchId: string): Promise<ReglaDeHuerfanas> {
  const a = await ajustesDe(tx, branchId);
  return { zona: a.zonaHoraria, afterMs: orphanAfterMs(a.horasHuerfana) };
}

/** El inicio del día del local en `ahora`: lo que empezó antes es de un día anterior. */
const inicioDelDia = (ahora: number, zona: string) => startOfDay(calendarDay(new Date(ahora).toISOString(), zona), zona);
const huerfana = (f: { startedAt: Date }, ahora: number, regla: ReglaDeHuerfanas) =>
  isOrphan(epochMs(f.startedAt.getTime()), epochMs(ahora), epochMs(inicioDelDia(ahora, regla.zona)), regla.afterMs);

export function casosParque(base: Base): CasosParque {
  return {
    async sala(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<MonitorSnapshotDto | Rechazo> => {
        let ve = false;
        for (const a of VEN_LA_SALA) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") ve = true;
        if (!ve) return rechazoDePermiso("DENEGADO");
        const vigente = await tarifarioDe(tx, ctx);
        if (!vigente) return sinTarifario;
        const { enSala, huerfanas } = await estanciasActivas(tx, ctx.branchId, ahora);
        return MonitorSnapshotSchema.parse({
          serverNow: new Date(ahora).toISOString(),
          policy: vigente.tarifario.policy,
          rate: null,
          shiftLabel: "",
          sessions: enSala,
          huerfanas,
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async entrar(ctx, entrada, ahora = Date.now(), papel) {
      const v = CheckInCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La entrada no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CheckInResult | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
          if (rechazo) return rechazo;
          // Un reintento de la misma entrada devuelve la que ya se hizo.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.cause === "ENTRADA" ? entradaHecha(tx, cmd.idempotencyKey, previa.accountId) : conflictoDeClave;

          // Desde papel (ADR-027): la carga abierta de este turno, y la hora real dentro de su ventana.
          const carga = papel ? await cargaParaRegistrar(tx, ctx, papel, ahora) : null;
          if (carga && "ok" in carga) return carga;

          const vigente = await tarifarioDe(tx, ctx);
          if (!vigente) return sinTarifario;
          const paquetes: PricePackageDto[] = [];
          for (const [i, e] of cmd.entries.entries()) {
            const p = vigente.tarifario.packages.find((x) => x.id === e.packageId && x.active);
            if (!p) return invalido("Ese paquete ya no está a la venta: elige otro.", ["entries", i, "packageId"], "PAQUETE_QUE_NO_SE_VENDE");
            paquetes.push(p);
          }
          // Los niños sin pulsera (B4-8) reciben aquí su código reservado, con el candado del parque.
          const generados = await codigosSinPulsera(tx, ctx.branchId, cmd.entries.filter((e) => e.sinPulsera).length);
          let siguiente = 0;
          const codigos = cmd.entries.map((e) => e.wristbandCode ?? generados[siguiente++]!);
          // Lo anotado en papel ya ocurrió: no se le cuenta el aforo (los niños que salieron ya no están).
          const pulseras = await comprobarPulserasYAforo(tx, ctx, codigos, vigente.tarifario.policy.capacityLimit, ahora, (i) => ["entries", i, "wristbandCode"], {
            sinAforo: carga !== null,
            generados: new Set(generados),
          });
          if (pulseras) return pulseras;

          // Medias (B4-9, P-6): quien no las trae paga el par del producto de medias de la sucursal, que sale del
          // inventario. Sin producto configurado o sin existencia, la entrada no se registra (fail-closed, ADR-023).
          const sinMedias = cmd.entries.flatMap((e, i) => (e.sinMedias ? [i] : []));
          let medias: Readonly<{ productId: string; name: string; amountMinor: bigint; taxCode: "GENERAL" | "REDUCIDA" | "EXENTA" }> | null = null;
          if (sinMedias.length > 0) {
            const { productoMedias } = await ajustesDe(tx, ctx.branchId);
            if (!productoMedias) {
              return invalido("El local no tiene elegido el producto de medias: se elige en Ajustes → Sucursal.", ["entries", sinMedias[0]!, "sinMedias"], "SIN_PRODUCTO_DE_MEDIAS");
            }
            const p = (await catalogoEn(tx, ahora))(productoMedias);
            if (!p) return invalido("Las medias no están a la venta: revísalas en Inventario → Productos.", ["entries", sinMedias[0]!, "sinMedias"], "MEDIAS_NO_SE_VENDEN");
            medias = { productId: productoMedias, ...p };
          }

          // La cédula del representante se exige (T-19), salvo en lo cargado desde papel: se anotó o no.
          const familia = await representanteDeLaEntrada(tx, ctx, cmd, ahora, !papel);
          if ("ok" in familia) return familia;
          const ninos: (string | null)[] = [];
          for (const [i, e] of cmd.entries.entries()) {
            const k = await ninoDeLaEntrada(tx, ctx, familia.id, e.kid, ahora);
            if (k === "AJENO") return invalido("Ese niño no es de esta familia.", ["entries", i, "kid", "id"], "NINO_DE_OTRA_FAMILIA");
            ninos.push(k);
          }

          // Sumar a la familia (B4-12): la cuenta abierta de este representante, con niños en la sala.
          const sumada = cmd.sumarA ? await cuentaParaSumar(tx, ctx, cmd.sumarA, familia.id, carga !== null) : null;
          if (sumada && "ok" in sumada) return sumada;

          const quien = await nombreDe(tx, ctx);
          const instante = new Date(ahora).toISOString();
          const accountId = sumada ? sumada.cuenta.id : randomUUID();
          const sesiones = cmd.entries.map(() => randomUUID());
          const orderNumber = sumada?.cuenta.orderNumber ?? (await siguienteNumero(tx, ctx));
          // El precio es el del tarifario vigente, no el que enseñaba la pantalla.
          const lineasNuevas = [
              ...cmd.entries.map((_, i) => ({
              id: `paq-${sesiones[i]}`,
              concept: `Paquete ${paquetes[i]!.name} · ${codigos[i]}`.slice(0, 80),
              kind: "PAQUETE",
              amount: paquetes[i]!.price,
              paid: false,
              sessionId: sesiones[i],
            })),
              // El par de medias de quien no las trajo: una venta del inventario, no tiempo (no lleva `sessionId`).
              ...(medias
                ? sinMedias.map((i) => ({
                    id: `med-${sesiones[i]}`,
                    concept: `${medias!.name} · ${codigos[i]}`.slice(0, 80),
                    kind: "RESTAURANTE" as const,
                    amount: { minor: String(medias!.amountMinor), currency: "USD" as const },
                    paid: false,
                    productId: medias!.productId,
                    taxCode: medias!.taxCode,
                  }))
                : []),
            ];
          let cuenta: FamilyAccountDto;
          if (sumada) {
            // Como una recarga: en prepago, lo nuevo vuelve a la caja; en cuenta abierta, se cobra todo al salir.
            const antes = sumada.cuenta;
            const status = antes.mode === "PREPAGO" || antes.status === "POR_COBRAR" ? "POR_COBRAR" : "ABIERTA";
            const { pendingSince: _, ...sinEspera } = antes;
            cuenta = FamilyAccountSchema.parse({
              ...sinEspera,
              version: sumada.version + 1,
              status,
              ...(status === "POR_COBRAR" ? { pendingSince: antes.status === "POR_COBRAR" ? (antes.pendingSince ?? instante) : instante } : {}),
              sessionIds: [...antes.sessionIds, ...sesiones],
              lines: [...antes.lines, ...lineasNuevas],
            });
          } else {
            const status = cmd.paymentMode === "PREPAGO" ? "POR_COBRAR" : "ABIERTA";
            cuenta = FamilyAccountSchema.parse({
              id: accountId,
              kind: "FAMILIA",
              version: 1,
              family: familia.fullName,
              mode: cmd.paymentMode,
              status,
              orderNumber,
              openedAt: instante,
              ...(status === "POR_COBRAR" ? { pendingSince: instante } : {}),
              sessionIds: sesiones,
              closedSessionIds: [],
              lines: lineasNuevas,
            });
          }
          // Lo que entra en la cuenta sale del estante (ADR-023): sin medias que dar, la entrada no se registra.
          const existencias = await comprobarExistencias(tx, ctx, sumada ? accountId : null, sumada ? sumada.cuenta.lines : null, cuenta.lines, () => [
            "entries",
            sinMedias[0] ?? 0,
            "sinMedias",
          ]);
          if ("ok" in existencias) return existencias;
          if (!sumada) await tx.account.create({
            data: {
              id: accountId,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              kind: "FAMILIA",
              orderNumber,
              openedAt: new Date(ahora),
              openedBy: ctx.quien?.userId ?? null,
              openedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            },
          });
          await guardarVersion(tx, ctx, cuenta, { cause: "ENTRADA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await asentarExistencias(tx, ctx, existencias, { accountId, version: sumada ? sumada.version + 1 : 1, ahora, quien: quien.nombre });
          const terms: ParkTermsDto = ParkTermsSchema.parse(vigente.tarifario.policy);
          await tx.parkSession.createMany({
            data: cmd.entries.map((_, i) => ({
              id: sesiones[i]!,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId,
              guardianId: familia.id,
              kidId: ninos[i]!,
              wristbandCode: codigos[i]!,
              packageId: paquetes[i]!.id,
              packageName: paquetes[i]!.name,
              mode: paquetes[i]!.mode,
              durationMinutes: paquetes[i]!.duration.kind === "fixed" ? paquetes[i]!.duration.minutes : null,
              priceMinor: BigInt(paquetes[i]!.price.minor),
              currency: "USD",
              terms,
              tariffVersion: vigente.version,
              startedAt: new Date(ahora),
              openedBy: ctx.quien?.userId ?? null,
              openedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              checkInKey: cmd.idempotencyKey,
              status: "ACTIVA",
            })),
          });
          const total = paquetes.reduce((acc, p) => add(acc, money(BigInt(p.price.minor), "USD")), money(0n, "USD"));
          await auditar(tx, ctx, {
            action: "parque.entrada",
            entityType: "account",
            entityId: accountId,
            after: {
              orderNumber,
              modo: cuenta.mode,
              ...(sumada ? { sumadaALaFamilia: true } : {}),
              ninos: cmd.entries.length,
              pulseras: codigos,
              ...(generados.length > 0 ? { sinPulsera: generados } : {}),
              tarifario: vigente.version,
              total: { minor: String(total.amount), currency: "USD" },
              ...(carga && papel ? { desdePapel: marcaDePapel(carga, papel, ahora) } : {}),
            },
          });
          if (carga && papel) {
            await asentarRegistroEn(tx, ctx, carga, papel, {
              tipo: "ENTRADA",
              accountId,
              operationKey: cmd.idempotencyKey,
              ocurrioEn: ahora,
              quien: quien.nombre,
              detalle: {
                orden: orderNumber,
                familia: familia.fullName,
                modo: cmd.paymentMode,
                ninos: cmd.entries.map((e, i) => ({ pulsera: codigos[i]!, nombre: e.kid.name ?? null })),
                total: { minor: String(total.amount), currency: "USD" },
              },
            });
          }
          return entradaHecha(tx, cmd.idempotencyKey, accountId);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.entrada", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos entradas a la vez con la misma clave (un doble toque que llegó por dos vías) o con una
        // pulsera que acaba de ocuparse: se vuelve a mirar con lo que ya quedó.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async salir(ctx, entrada, ahora = Date.now(), papel) {
      const v = CheckoutCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La salida no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CheckoutResult | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkOut");
          if (rechazo) return rechazo;
          // El reintento se detecta por la estancia (`checkOutKey` lo pone solo una salida): con una
          // mesa de por medio, la operación guarda más de una cuenta con la misma clave, así que no
          // sirve buscarla por el asiento de una cuenta cualquiera.
          const yaSalio = await tx.parkSession.findFirst({ where: { checkOutKey: cmd.idempotencyKey } });
          if (yaSalio) return salidaHecha(tx, cmd.idempotencyKey, yaSalio.accountId);

          // Desde papel (ADR-027): la carga abierta de este turno, y la hora real de salida dentro de su ventana.
          const carga = papel ? await cargaParaRegistrar(tx, ctx, papel, ahora) : null;
          if (carga && "ok" in carga) return carga;

          const filas = await estancias(tx, { where: { id: { in: cmd.sessionIds }, branchId: ctx.branchId } });
          if (filas.length !== cmd.sessionIds.length) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Una de esas estancias no está en esta sucursal." };
          }
          const porId = new Map(filas.map((f) => [f.id, f]));
          const enOrden = cmd.sessionIds.map((id) => porId.get(id)!);
          const salida = enOrden.find((f) => f.status !== "ACTIVA");
          if (salida) return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(salida)} ya salió.` };
          // Una huérfana no se liquida por la salida: se le cobraría el tiempo que estuvo olvidada.
          const regla = await reglaDeHuerfanas(tx, ctx.branchId);
          const olvidada = enOrden.find((f) => huerfana(f, ahora, regla));
          if (olvidada) {
            return { ok: false, motivo: "CONFLICTO", mensaje: `La estancia de ${nombreDeFila(olvidada)} está a revisar: la cierra la dirección desde Inicio.` };
          }
          if (new Set(enOrden.map((f) => f.accountId)).size > 1) {
            return invalido("Cada familia sale por separado: registra primero una y luego la otra.", ["sessionIds"], "VARIAS_FAMILIAS");
          }
          const accountId = enOrden[0]!.accountId;
          const actual = (await vigenteDe(tx, accountId))!;
          if (actual.cuenta.status === "INCOBRABLE") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta de esta familia se dio por incobrable: la salida la resuelve supervisión." };
          }

          // Una pulsera vinculada a una mesa sale a su mesa, sin preguntar (B4-14, M-34): lo que se debe de ella, con
          // su tiempo de más, va a esa cuenta aunque la pantalla diga otra cosa. Mezclar vinculadas con sueltas, o con
          // otra mesa, se niega: cada cuenta sale por su lado.
          const vinculadas = await sessionsVinculadas(tx, ctx.branchId);
          const susMesas = enOrden.map((f) => vinculadas.get(f.id) ?? null);
          let disposicion = cmd.disposition;
          if (susMesas.some((m) => m !== null)) {
            const mesas = new Set(susMesas.map((m) => m?.accountId ?? "suelta"));
            if (mesas.size > 1) {
              return invalido(
                "Unos niños están vinculados a una mesa y otros no (o a mesas distintas): registra su salida por separado.",
                ["sessionIds"],
                "VINCULADAS_MEZCLADAS",
              );
            }
            const suya = susMesas[0]!;
            if (cmd.disposition.kind === "MESA" && (cmd.disposition.tableId !== suya.tableId || (cmd.disposition.cuentaId !== undefined && cmd.disposition.cuentaId !== suya.accountId))) {
              return { ok: false, motivo: "CONFLICTO", mensaje: `Esa pulsera está vinculada a la mesa ${suya.label}: su salida va a esa cuenta.` };
            }
            disposicion = { kind: "MESA", tableId: suya.tableId, cuentaId: suya.accountId };
          }

          // Cargar la deuda a una mesa (F5-14, D-RES, B6-3): la «cuenta unificada» que es el diferencial
          // del producto. El candado de las mesas (I-05) es el mismo de la vinculación y del plano.
          let mesaInfo: Readonly<{ accountId: string; tableId: string; label: string; vigente: NonNullable<Awaited<ReturnType<typeof vigenteDe>>> }> | null = null;
          if (disposicion.kind === "MESA") {
            const tableId = disposicion.tableId;
            await candadoDeMesas(tx, ctx.branchId);
            // A cuál de las cuentas de la mesa (B6-7): la que eligió la salida, o la única.
            const destino = await cuentaDeMesaPara(tx, ctx.branchId, tableId, disposicion.cuentaId);
            if ("ok" in destino) return { ...destino, ...(destino.problemas ? { problemas: destino.problemas.map((p) => ({ ...p, path: ["disposition", "cuentaId"] })) } : {}) };
            const abierta = destino.abierta;
            const vigente = abierta ? await vigenteDe(tx, abierta) : null;
            // Una mesa sin cuenta no la abre una salida del parque: el mesero sienta primero a la familia (B6-9, M-33).
            if (!vigente) {
              const r = await mesaParaCuentaNueva(tx, ctx.branchId, tableId);
              if ("ok" in r) return { ...r, ...(r.problemas ? { problemas: r.problemas.map((p) => ({ ...p, path: ["disposition", "tableId"] })) } : {}) };
              return mesaSinCuenta(["disposition", "tableId"]);
            }
            mesaInfo = { accountId: vigente.cuenta.id, tableId, label: vigente.cuenta.tableLabel ?? "?", vigente };
          }

          // Salir antes de tiempo en cuenta abierta (B4-6, M-18): se cobra el paquete que cubre lo que estuvo.
          // En prepago no: lo pagado al entrar no se devuelve, y la entrada lo avisa.
          const porUso = new Map<string, PaqueteDeUso>();
          if (actual.cuenta.mode === "CUENTA_ABIERTA") {
            for (const f of enOrden) {
              const p = paqueteParaCobrarPorUso(f, ahora);
              if (p) porUso.set(f.id, p);
            }
          }
          const lineas = enOrden.map((f) => liquidacionDe(f, ahora, porUso.get(f.id) ?? null));
          const lineaPorUso = (f: FilaDeEstancia, i: number) => ({
            id: `uso-${f.id}`,
            concept: `Paquete ${porUso.get(f.id)!.name} por uso (${lineas[i]!.consumedMinutes} min) · ${f.wristbandCode}`,
            amountMinor: porUso.get(f.id)!.price.amount,
            minutos: lineas[i]!.consumedMinutes,
          });
          let base = actual.cuenta;
          // Lo de un niño vinculado a una mesa ya no está aquí (B6-3): se cobra por uso en la cuenta de la mesa.
          const enUnaMesa: number[] = [];
          // Las estancias cuyo ajuste quedó asentado: el desglose solo dice «por uso» de esas.
          const asentado = new Set<string>();
          enOrden.forEach((f, i) => {
            if (!porUso.has(f.id)) return;
            const c = chargeByUsage(base, f.id, lineaPorUso(f, i));
            if (c) {
              base = c;
              asentado.add(f.id);
            } else enUnaMesa.push(i);
          });
          let despues = registerExit(
            base,
            cmd.sessionIds,
            lineas.map((l, i) => ({
              sessionId: l.sessionId,
              concept: `Tiempo de más · ${nombreDeFila(enOrden[i]!)} (${l.penaltyBlocks === 1 ? "1 bloque" : `${l.penaltyBlocks} bloques`})`,
              amountMinor: BigInt(l.overdue.minor),
            })),
          );
          // Lo que se debía de estas estancias —el paquete, si seguía pendiente, y el excedente recién
          // calculado— pasa a la mesa entera: la familia paga todo junto, ahí (D2).
          let lineasParaLaMesa: AccountLineDoc[] = [];
          if (mesaInfo) {
            const movido = moveSessionLines(despues, cmd.sessionIds, mesaInfo.accountId, () => randomUUID());
            despues = movido.familia;
            lineasParaLaMesa = movido.lineasNuevas;
          }
          const instante = new Date(ahora).toISOString();
          const { pendingSince: _, ...sinEspera } = despues;
          const nueva = FamilyAccountSchema.parse({
            ...sinEspera,
            version: actual.version + 1,
            ...(despues.status === "POR_COBRAR"
              ? { pendingSince: actual.cuenta.status === "POR_COBRAR" ? (actual.cuenta.pendingSince ?? instante) : instante }
              : {}),
          });
          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, nueva, { cause: "SALIDA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          if (enUnaMesa.length > 0) {
            // El mismo candado que la vinculación y el plano (I-05); en la misma transacción se puede volver a tomar.
            await candadoDeMesas(tx, ctx.branchId);
            for (const mesaId of [...(await cuentasDeLasMesas(tx, ctx.branchId)).values()].flat().map((c) => c.id)) {
              const esLaDestino = mesaInfo !== null && mesaInfo.accountId === mesaId;
              const vigente = esLaDestino ? mesaInfo!.vigente : (await vigenteDe(tx, mesaId))!;
              let cuenta = vigente.cuenta;
              for (const i of enUnaMesa) {
                const c = chargeByUsage(cuenta, enOrden[i]!.id, lineaPorUso(enOrden[i]!, i));
                if (!c) continue;
                cuenta = c;
                asentado.add(enOrden[i]!.id);
              }
              if (cuenta === vigente.cuenta) continue;
              if (esLaDestino) {
                mesaInfo = { ...mesaInfo!, vigente: { ...vigente, cuenta } };
              } else {
                const mesa = FamilyAccountSchema.parse({ ...cuenta, version: vigente.version + 1 });
                await guardarVersion(tx, ctx, mesa, { cause: "SALIDA", operationKey: claveSecundaria(cmd.idempotencyKey, mesaId), ahora, quien: quien.nombre });
              }
            }
          }
          if (mesaInfo) {
            const mesa: FamilyAccountDto = FamilyAccountSchema.parse({
              ...mesaInfo.vigente.cuenta,
              sessionIds: [...new Set([...mesaInfo.vigente.cuenta.sessionIds, ...cmd.sessionIds])],
              lines: [...mesaInfo.vigente.cuenta.lines, ...lineasParaLaMesa],
              version: mesaInfo.vigente.version + 1,
            });
            await guardarVersion(tx, ctx, mesa, { cause: "SALIDA", operationKey: claveSecundaria(cmd.idempotencyKey, mesaInfo.accountId), ahora, quien: quien.nombre });
          }
          await tx.parkSession.updateMany({
            where: { id: { in: cmd.sessionIds }, status: "ACTIVA" },
            data: {
              status: "CERRADA",
              endedAt: new Date(ahora),
              closedBy: ctx.quien?.userId ?? null,
              closedByName: quien.nombre,
              checkOutKey: cmd.idempotencyKey,
              closureKind: "SALIDA",
              // D9: a quién se entregó; si no fue su representante, quién.
              pickedUpByGuardian: cmd.recogida.kind === "REPRESENTANTE",
              pickedUpByName: cmd.recogida.kind === "OTRA_PERSONA" ? cmd.recogida.nombre : null,
            },
          });
          const excedente = lineas.reduce((acc, l) => add(acc, money(BigInt(l.overdue.minor), "USD")), money(0n, "USD"));
          await auditar(tx, ctx, {
            action: "parque.salida",
            entityType: "account",
            entityId: accountId,
            before: { version: actual.version, status: actual.cuenta.status },
            after: {
              version: nueva.version,
              status: nueva.status,
              pulseras: enOrden.map((f) => f.wristbandCode),
              excedente: { minor: String(excedente.amount), currency: "USD" },
              // El nombre de quien lo recogió queda en la estancia, no en el asiento (§7.6).
              recogidoPorOtraPersona: cmd.recogida.kind === "OTRA_PERSONA",
              cargadoAMesa: mesaInfo ? mesaInfo.label : null,
              ...(carga && papel ? { desdePapel: marcaDePapel(carga, papel, ahora) } : {}),
            },
          });
          if (carga && papel) {
            await asentarRegistroEn(tx, ctx, carga, papel, {
              tipo: "SALIDA",
              accountId,
              operationKey: cmd.idempotencyKey,
              ocurrioEn: ahora,
              quien: quien.nombre,
              detalle: {
                orden: actual.cuenta.orderNumber ?? 0,
                familia: actual.cuenta.family,
                ninos: enOrden.map((f) => ({ pulsera: f.wristbandCode, nombre: f.kid?.nickname ?? f.kid?.name ?? null })),
                excedente: { minor: String(excedente.amount), currency: "USD" },
              },
            });
          }
          // Si el paquete ya no se debía en ninguna cuenta (p. ej., la mesa ya lo cobró), no hubo ajuste:
          // el desglose dice lo contratado, como lo dirá un reintento.
          const desglose = lineas.map((l, i) => (porUso.has(l.sessionId) && !asentado.has(l.sessionId) ? liquidacionDe(enOrden[i]!, ahora) : l));
          return { lines: desglose, account: nueva };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.salida", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Otra operación cambió la cuenta a la vez (la caja la cobró, otra salida de un hermano): se
        // vuelve a mirar con su versión nueva.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async recargar(ctx, entrada, ahora = Date.now()) {
      const v = RecargaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La recarga no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<RecargaResult | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
          if (rechazo) return rechazo;
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.cause !== "RECARGA") return conflictoDeClave;
            const f = await estanciaQueExiste(tx, { id: cmd.sessionId });
            return { session: estanciaDe(f), account: (await vigenteDe(tx, previa.accountId))!.cuenta };
          }
          const f = await estancia(tx, { id: cmd.sessionId, branchId: ctx.branchId });
          if (!f) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa estancia no está en esta sucursal." };
          if (f.status !== "ACTIVA") return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(f)} ya salió.` };
          if (huerfana(f, ahora, await reglaDeHuerfanas(tx, ctx.branchId))) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa estancia está a revisar: la cierra la dirección." };
          }
          if (f.durationMinutes === null) {
            return invalido("El tiempo abierto no se recarga: se cobra entero al salir.", ["sessionId"], "TIEMPO_ABIERTO");
          }
          const vigente = await tarifarioDe(tx, ctx);
          if (!vigente) return sinTarifario;
          const p = vigente.tarifario.packages.find((x) => x.id === cmd.packageId && x.active);
          if (!p || p.duration.kind !== "fixed") {
            return invalido("Ese paquete no sirve para recargar: elige uno de tiempo fijo que esté a la venta.", ["packageId"], "PAQUETE_QUE_NO_SE_RECARGA");
          }
          const actual = (await vigenteDe(tx, f.accountId))!;
          if (actual.cuenta.status === "INCOBRABLE") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta de esta familia se dio por incobrable: no admite recargas." };
          }
          // Un invitado de un cumpleaños está en el horario del evento (B10-2): no se le recarga tiempo.
          if (actual.cuenta.kind === "EVENTO") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Es un invitado de un cumpleaños: su tiempo es el del evento y no se recarga." };
          }
          const quien = await nombreDe(tx, ctx);
          const extension = await tx.parkSessionExtension.create({
            data: {
              tenantId: ctx.tenantId,
              sessionId: f.id,
              minutes: p.duration.minutes,
              packageId: p.id,
              packageName: p.name,
              priceMinor: BigInt(p.price.minor),
              currency: "USD",
              operationKey: cmd.idempotencyKey,
              createdAt: new Date(ahora),
              createdBy: ctx.quien?.userId ?? null,
              createdByName: quien.nombre,
            },
          });
          const despues = registerRecharge(actual.cuenta, {
            id: `rec-${extension.id}`,
            concept: `Recarga ${p.name} · ${f.wristbandCode}`,
            sessionId: f.id,
            amountMinor: BigInt(p.price.minor),
          });
          const instante = new Date(ahora).toISOString();
          const { pendingSince: _, ...sinEspera } = despues;
          const nueva = FamilyAccountSchema.parse({
            ...sinEspera,
            version: actual.version + 1,
            ...(despues.status === "POR_COBRAR"
              ? { pendingSince: actual.cuenta.status === "POR_COBRAR" ? (actual.cuenta.pendingSince ?? instante) : instante }
              : {}),
          });
          await guardarVersion(tx, ctx, nueva, { cause: "RECARGA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: "parque.recarga",
            entityType: "park_session",
            entityId: f.id,
            after: { minutos: p.duration.minutes, paquete: p.name, precio: p.price, cuenta: nueva.orderNumber ?? null },
          });
          const recargada = await estanciaQueExiste(tx, { id: f.id });
          return { session: estanciaDe(recargada), account: nueva };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.recarga", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Otra operación cambió la cuenta a la vez: se vuelve a mirar con su versión nueva.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async pausa(ctx, entrada, ahora = Date.now()) {
      const v = PausaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La pausa no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const accion = cmd.accion === "PAUSAR" ? "parque.pausar" : "parque.reanudar";
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<EstanciaDto | Rechazo> => {
          // La lleva quien atiende la sala, como la recarga.
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
          if (rechazo) return rechazo;
          // El reintento (se cortó la red) devuelve la estancia como quedó.
          const previa = await tx.parkSessionPause.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.sessionId !== cmd.sessionId || previa.kind !== (cmd.accion === "PAUSAR" ? "PAUSA" : "REANUDA")) return conflictoDeClave;
            return estanciaDe(await estanciaQueExiste(tx, { id: cmd.sessionId }));
          }
          const f = await estancia(tx, { id: cmd.sessionId, branchId: ctx.branchId });
          if (!f) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa estancia no está en esta sucursal." };
          if (f.status !== "ACTIVA") return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(f)} ya salió.` };
          if (huerfana(f, ahora, await reglaDeHuerfanas(tx, ctx.branchId))) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa estancia está a revisar: la cierra la dirección." };
          }
          const pausaActual = pausaDelDominio(f);
          const sesion = pausaActual ? { pause: pausaActual } : {};
          const quien = await nombreDe(tx, ctx);
          if (cmd.accion === "PAUSAR") {
            if (pauseProblem(sesion) === "YA_PAUSO") {
              return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(f)} ya usó su pausa: hay una por visita.`, problemas: [{ path: ["sessionId"], message: "YA_PAUSO" }] };
            }
            const { pausaMaximaMin } = await ajustesDe(tx, ctx.branchId);
            await tx.parkSessionPause.create({
              data: {
                tenantId: ctx.tenantId,
                sessionId: f.id,
                kind: "PAUSA",
                at: new Date(ahora),
                maxMinutes: pausaMaximaMin,
                operationKey: cmd.idempotencyKey,
                createdBy: ctx.quien?.userId ?? null,
                createdByName: quien.nombre,
              },
            });
            await auditar(tx, ctx, { action: accion, entityType: "park_session", entityId: f.id, after: { pulsera: f.wristbandCode, maxMinutos: pausaMaximaMin } });
          } else {
            const problema = resumeProblem(sesion, epochMs(ahora));
            if (problema) {
              return {
                ok: false,
                motivo: "CONFLICTO",
                mensaje: problema === "SIN_PAUSA" ? `${nombreDeFila(f)} no está en pausa.` : `La pausa de ${nombreDeFila(f)} ya terminó: su tiempo corre.`,
                problemas: [{ path: ["sessionId"], message: problema }],
              };
            }
            await tx.parkSessionPause.create({
              data: {
                tenantId: ctx.tenantId,
                sessionId: f.id,
                kind: "REANUDA",
                at: new Date(ahora),
                operationKey: cmd.idempotencyKey,
                createdBy: ctx.quien?.userId ?? null,
                createdByName: quien.nombre,
              },
            });
            await auditar(tx, ctx, {
              action: accion,
              entityType: "park_session",
              entityId: f.id,
              after: { pulsera: f.wristbandCode, minutos: Math.round(pausedMs(pausaActual, epochMs(ahora)) / 60_000) },
            });
          }
          return estanciaDe(await estanciaQueExiste(tx, { id: f.id }));
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos equipos pausan a la vez: la base deja una sola pausa (o un solo fin); se vuelve a mirar.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async anularEntrada(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AnularEntradaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "No se anuló: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<{ account: FamilyAccountDto } | Rechazo> => {
          // Administración por sí misma, confirmando con su PIN; supervisión, con la de administración (B4-10).
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "parque.anularEntrada", autorizacion, ahora, { confirmarConPin: true });
          if (!permiso.ok) return permiso;
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.cause === "ANULAR_ENTRADA" ? { account: (await vigenteDe(tx, previa.accountId))!.cuenta } : conflictoDeClave;
          const f = await estancia(tx, { id: cmd.sessionId, branchId: ctx.branchId });
          if (!f) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa estancia no está en esta sucursal." };
          if (f.status !== "ACTIVA") return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(f)} ya salió: su visita no se anula.` };
          const actual = (await vigenteDe(tx, f.accountId))!;
          if (actual.cuenta.status === "INCOBRABLE") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta de esta familia se dio por incobrable: la resuelve supervisión." };
          }
          if (actual.cuenta.kind === "EVENTO") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Es un invitado de un cumpleaños: su visita es del evento. Registra su salida." };
          }
          const quien = await nombreDe(tx, ctx);
          // Quien autoriza (la administración que puso su PIN, o quien opera si lo puede por sí misma), con su rol.
          const autorizoId = permiso.autorizadoPor ?? ctx.quien!.userId!;
          const persona = await tx.staffUser.findUniqueOrThrow({ where: { id: autorizoId }, select: { fullName: true, role: true } });
          const autorizo = { id: autorizoId, name: persona.fullName, role: persona.role === "SUPERVISOR" ? ("SUPERVISOR" as const) : ("ADMIN" as const) };
          const instante = new Date(ahora).toISOString();
          const anulada = annulEntry(actual.cuenta, f.id, {
            motivo: "ENTRADA_POR_ERROR",
            detalle: cmd.motivo.slice(0, 120),
            autorizadaPor: { id: autorizo.id, name: autorizo.name, role: autorizo.role },
            en: instante,
          });
          if (!anulada) {
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: `El paquete de ${nombreDeFila(f)} ya se cobró: anula ese cobro en la caja y después anula la entrada.`,
              problemas: [{ path: ["sessionId"], message: "YA_COBRADA" }],
            };
          }
          const { pendingSince: _, ...sinEspera } = anulada;
          const nueva = FamilyAccountSchema.parse({
            ...sinEspera,
            version: actual.version + 1,
            ...(anulada.status === "POR_COBRAR" ? { pendingSince: actual.cuenta.pendingSince ?? instante } : {}),
          });
          await guardarVersion(tx, ctx, nueva, { cause: "ANULAR_ENTRADA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await tx.parkSession.update({
            where: { id: f.id },
            data: {
              status: "CERRADA",
              endedAt: new Date(ahora),
              closedBy: ctx.quien?.userId ?? null,
              closedByName: quien.nombre,
              checkOutKey: cmd.idempotencyKey,
              closureKind: "ANULADA",
              closureReason: cmd.motivo,
            },
          });
          await auditar(tx, ctx, {
            action: "parque.anular_entrada",
            entityType: "park_session",
            entityId: f.id,
            reason: cmd.motivo,
            before: { entro: f.startedAt.toISOString(), pulsera: f.wristbandCode, paquete: f.packageName },
            after: { cuenta: nueva.orderNumber ?? null, status: nueva.status, autorizadoPor: autorizo.name },
          });
          return { account: nueva };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.anular_entrada", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async cerrarHuerfana(ctx, entrada, ahora = Date.now()) {
      const v = CierreHuerfanaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "No se cerró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<{ account: FamilyAccountDto } | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.cerrarHuerfana");
          if (rechazo) return rechazo;
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.cause === "CIERRE_ADMINISTRATIVO" ? { account: (await vigenteDe(tx, previa.accountId))!.cuenta } : conflictoDeClave;
          const f = await estancia(tx, { id: cmd.sessionId, branchId: ctx.branchId });
          if (!f) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa estancia no está en esta sucursal." };
          if (f.status !== "ACTIVA") return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(f)} ya salió.` };
          if (!huerfana(f, ahora, await reglaDeHuerfanas(tx, ctx.branchId))) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa estancia no está a revisar: si el niño se va, se registra su salida." };
          }
          const actual = (await vigenteDe(tx, f.accountId))!;
          // Sin tiempo de más: nadie sabe cuándo se fue (H-19). Lo contratado se sigue debiendo.
          const despues = actual.cuenta.status === "INCOBRABLE" ? actual.cuenta : registerExit(actual.cuenta, [f.id], []);
          const instante = new Date(ahora).toISOString();
          const { pendingSince: _, ...sinEspera } = despues;
          const nueva = FamilyAccountSchema.parse({
            ...sinEspera,
            version: actual.version + 1,
            ...(despues.status === "POR_COBRAR"
              ? { pendingSince: actual.cuenta.status === "POR_COBRAR" ? (actual.cuenta.pendingSince ?? instante) : instante }
              : {}),
          });
          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, nueva, { cause: "CIERRE_ADMINISTRATIVO", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await tx.parkSession.update({
            where: { id: f.id },
            data: {
              status: "CERRADA",
              endedAt: new Date(ahora),
              closedBy: ctx.quien?.userId ?? null,
              closedByName: quien.nombre,
              checkOutKey: cmd.idempotencyKey,
              closureKind: "ADMINISTRATIVA",
              closureReason: cmd.motivo,
            },
          });
          await auditar(tx, ctx, {
            action: "parque.cierre_administrativo",
            entityType: "park_session",
            entityId: f.id,
            reason: cmd.motivo,
            before: { entro: f.startedAt.toISOString(), pulsera: f.wristbandCode },
            after: { cuenta: nueva.orderNumber ?? null, status: nueva.status },
          });
          return { account: nueva };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.cierre_administrativo", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async pulsera(ctx, entrada) {
      const v = ConsultarPulseraSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Ese código no es de una pulsera.", problemas: problemasDe(v.error) };
      const codigo = v.data.codigo;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoPulseraDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
        if (rechazo) return rechazo;
        // El prefijo de los niños sin pulsera (B4-8) es del servidor: una pulsera con él no es del lote.
        if (isWristbandless(codigo)) {
          return { codigo, estado: "FUERA_DE_SERIE", mensaje: `Los códigos que empiezan por ${WRISTBANDLESS_PREFIX} son de los niños que entran sin pulsera: pasa una pulsera del lote.` };
        }
        const { pulseras: serie } = await ajustesDe(tx, ctx.branchId);
        if (wristbandSeriesProblem(codigo, { prefix: serie.prefijo, length: serie.longitud })) {
          const como = [serie.prefijo ? `empiezan por ${serie.prefijo}` : null, serie.longitud ? `tienen ${serie.longitud} caracteres` : null].filter(Boolean).join(" y ");
          return { codigo, estado: "FUERA_DE_SERIE", mensaje: `${codigo} no es de la serie del local: las pulseras ${como}.` };
        }
        const previa = await tx.parkSession.findFirst({
          where: { branchId: ctx.branchId, wristbandCode: codigo, ...SIN_ANULADAS },
          select: { status: true },
        });
        if (!previa) return { codigo, estado: "LIBRE", mensaje: null };
        return previa.status === "ACTIVA"
          ? { codigo, estado: "ACTIVA", mensaje: `La pulsera ${codigo} ya está activa en sala.` }
          : { codigo, estado: "USADA", mensaje: `La pulsera ${codigo} ya se usó en otra visita: pon una nueva.` };
      });
      return "ok" in r ? r : { ok: true, valor: EstadoPulseraSchema.parse(r) };
    },

    async atendidos(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<{ hoy: number; semanaPasada: number } | Rechazo> => {
        let ve = false;
        for (const a of VEN_LA_SALA) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") ve = true;
        if (!ve) return rechazoDePermiso("DENEGADO");
        const zona = await zonaDe(tx, ctx.branchId);
        const dia = calendarDay(new Date(ahora).toISOString(), zona);
        const desde = startOfDay(dia, zona);
        const hace7 = startOfDay(calendarDay(new Date(desde - 7 * 86_400_000 + 12 * 3_600_000).toISOString(), zona), zona);
        const cuantos = (de: number, a: number) =>
          tx.parkSession.count({ where: { branchId: ctx.branchId, startedAt: { gte: new Date(de), lt: new Date(a) } } });
        return { hoy: await cuantos(desde, ahora + 1), semanaPasada: await cuantos(hace7, hace7 + (ahora + 1 - desde)) };
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async nombrar(ctx, entrada, ahora = Date.now()) {
      const v = NombrarEstanciaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El nombre no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstanciaDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
        if (rechazo) return rechazo;
        const f = await tx.parkSession.findFirst({ where: { id: cmd.sessionId, branchId: ctx.branchId } });
        if (!f) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa estancia no está en esta sucursal." };
        if (f.status !== "ACTIVA") return { ok: false, motivo: "CONFLICTO", mensaje: "Ese niño ya salió." };
        const datos = { name: cmd.name, nickname: cmd.nickname ?? null };
        let kidId = f.kidId;
        if (kidId) {
          // Ya tenía nombre: se corrige el del niño, y el directorio lo ve igual.
          await tx.kid.update({ where: { id: kidId }, data: datos });
        } else {
          // Si la familia ya tiene un niño con ese nombre, es él; si no, nace en el directorio.
          const suyos = await tx.kid.findMany({ where: { guardianId: f.guardianId }, select: { id: true, name: true } });
          const mismo = suyos.find((k) => claveDeNombre(k.name) === claveDeNombre(cmd.name));
          if (mismo) await tx.kid.update({ where: { id: mismo.id }, data: datos });
          kidId =
            mismo?.id ??
            (await tx.kid.create({ data: { tenantId: ctx.tenantId, guardianId: f.guardianId, ...datos, createdAt: new Date(ahora) }, select: { id: true } })).id;
          await tx.parkSession.update({ where: { id: f.id }, data: { kidId } });
        }
        await auditar(tx, ctx, { action: "parque.nombrar", entityType: "park_session", entityId: f.id, after: { kidId } });
        return estanciaDe(await estanciaQueExiste(tx, { id: f.id }));
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}

/* ─────────────────────────────────────────────────────────────── de la base */

type FilaDeEstancia = Awaited<ReturnType<Transaccion["parkSession"]["findFirstOrThrow"]>> & {
  guardian: { fullName: string };
  kid: { id: string; name: string; nickname: string | null } | null;
  extensions: { minutes: number; packageName: string; priceMinor: bigint; createdAt: Date }[];
  /** Su pausa por comida (B4-7): la PAUSA y, si la terminaron antes, la REANUDA. */
  pauses: { kind: string; at: Date; maxMinutes: number | null }[];
  /** Los paquetes activos del tarifario con que entró (B4-6). */
  porUso: EstanciaDto["porUso"];
};

/**
 * Las estancias abiertas de la sucursal en `ahora`: los niños en sala y, aparte, las huérfanas (D9).
 * La sala las enseña y el cierre de la jornada no se hace mientras quede alguna (JORNADA §5, C2).
 */
export async function estanciasActivas(tx: Transaccion, branchId: string, ahora: number): Promise<{ enSala: EstanciaDto[]; huerfanas: EstanciaDto[] }> {
  const filas = await estancias(tx, { where: { branchId, status: "ACTIVA" }, orderBy: { startedAt: "asc" } });
  const regla = await reglaDeHuerfanas(tx, branchId);
  return {
    enSala: filas.filter((f) => !huerfana(f, ahora, regla)).map(estanciaDe),
    huerfanas: filas.filter((f) => huerfana(f, ahora, regla)).map(estanciaDe),
  };
}

/** Lo contratado: el paquete y sus recargas (F5-11). */
function duracionDe(f: FilaDeEstancia): Duration {
  return withRecharges(f.durationMinutes === null ? openEnded : fixed(f.durationMinutes), f.extensions.map((e) => e.minutes));
}

/**
 * Lo que una entrada comprueba de sus pulseras antes de ocuparlas (B4-2, B4-5, V-1) y el aforo: la serie del
 * local, ninguna repetida, ninguna activa en sala (I-04) ni usada en otra visita, y que quepan. Toma el candado
 * del parque, que ordena dos entradas a la vez: lo que mira y lo que ocupa van juntos. La usan la entrada de
 * una familia y la de los invitados de un cumpleaños (B10-2). `null` si todo está bien; si no, el rechazo.
 */
export async function comprobarPulserasYAforo(
  tx: Transaccion,
  ctx: Contexto,
  codigos: readonly string[],
  aforo: number,
  ahora: number,
  ruta: (i: number) => (string | number)[],
  opciones: Readonly<{ sinAforo?: boolean; generados?: ReadonlySet<string> }> = {},
): Promise<Rechazo | null> {
  // V-1: la serie de pulseras del local, si ya se fijó con el primer lote (D-PUL).
  const { pulseras: serie } = await ajustesDe(tx, ctx.branchId);
  const generados = opciones.generados ?? new Set<string>();
  for (const [i, codigo] of codigos.entries()) {
    // El código de un niño sin pulsera (B4-8) lo pone el servidor: no es de ningún lote ni se puede traer de fuera.
    if (generados.has(codigo)) continue;
    if (isWristbandless(codigo)) {
      return invalido(`Los códigos que empiezan por ${WRISTBANDLESS_PREFIX} son de los niños que entran sin pulsera: pasa una pulsera del lote.`, ruta(i), "PULSERA_RESERVADA");
    }
    const problema = wristbandSeriesProblem(codigo, { prefix: serie.prefijo, length: serie.longitud });
    if (problema) {
      const como = [serie.prefijo ? `empiezan por ${serie.prefijo}` : null, serie.longitud ? `tienen ${serie.longitud} caracteres` : null].filter(Boolean).join(" y ");
      return invalido(`La pulsera ${codigo} no es de la serie del local: las pulseras ${como}.`, ruta(i), "PULSERA_FUERA_DE_SERIE");
    }
  }
  const repetida = codigos.findIndex((c, i) => codigos.indexOf(c) !== i);
  if (repetida >= 0) return invalido(`La pulsera ${codigos[repetida]} está dos veces en esta entrada.`, ruta(repetida), "PULSERA_REPETIDA");

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`parque:${ctx.branchId}`}, 0))::text AS candado`;
  const activas = await tx.parkSession.findMany({ where: { branchId: ctx.branchId, status: "ACTIVA" }, select: { wristbandCode: true, startedAt: true } });
  const ocupadas = new Set(activas.map((a) => a.wristbandCode));
  const ocupada = codigos.findIndex((c) => ocupadas.has(c));
  // I-04: una pulsera, una estancia activa (también una huérfana, hasta que la dirección la cierre).
  if (ocupada >= 0) return invalido(`La pulsera ${codigos[ocupada]} ya está activa en sala.`, ruta(ocupada), "PULSERA_ACTIVA");
  // V-1: una pulsera, una visita. Una que ya salió no vuelve a entrar (la base también lo impide); la de una entrada
  // anulada por error (B4-10) sí, porque esa visita no existió.
  const usadas = await tx.parkSession.findMany({
    where: { branchId: ctx.branchId, status: { not: "ACTIVA" }, ...SIN_ANULADAS, wristbandCode: { in: [...codigos] } },
    select: { wristbandCode: true },
  });
  const usada = codigos.findIndex((c) => usadas.some((u) => u.wristbandCode === c));
  if (usada >= 0) return invalido(`La pulsera ${codigos[usada]} ya se usó en otra visita: pon una nueva.`, ruta(usada), "PULSERA_USADA");

  // Lo anotado en papel ya ocurrió (B3-7): el aforo no se le cuenta, porque no se puede rechazar lo que pasó.
  if (opciones.sinAforo) return null;

  // Una huérfana no ocupa sitio: casi seguro ese niño ya no está (F5-13).
  const regla = await reglaDeHuerfanas(tx, ctx.branchId);
  const dentro = activas.filter((a) => !huerfana(a, ahora, regla)).length;
  if (!admits(dentro, codigos.length, aforo)) {
    const libres = Math.max(0, aforo - dentro);
    return {
      ok: false,
      motivo: "CONFLICTO",
      mensaje: libres === 0 ? `Aforo completo (${aforo}): no entra nadie más.` : `Aforo: quedan ${libres} ${libres === 1 ? "plaza" : "plazas"} y esta entrada trae ${codigos.length}.`,
    };
  }
  return null;
}

/** El tarifario vigente de la sucursal, revalidado; `null` si nunca se publicó (o ya no se entiende). */
export async function tarifarioDe(tx: Transaccion, ctx: Contexto): Promise<{ version: number; tarifario: TarifarioDto } | null> {
  const fila = await tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId }, orderBy: { version: "desc" } });
  const t = fila ? TarifarioSchema.safeParse(fila.content) : null;
  return fila && t?.success ? { version: fila.version, tarifario: t.data } : null;
}

/** La estancia como viaja, validada con el contrato al salir (fail-closed). */
function estanciaDe(f: FilaDeEstancia): EstanciaDto {
  return EstanciaSchema.parse({
    id: f.id,
    wristbandCode: f.wristbandCode,
    kid: f.kid ? { id: f.kid.id, name: f.kid.name, ...(f.kid.nickname ? { nickname: f.kid.nickname } : {}) } : {},
    mode: f.mode,
    duration: duracionDe(f),
    startedAt: f.startedAt.toISOString(),
    packageId: f.packageId,
    packagePrice: { minor: String(f.priceMinor), currency: "USD" },
    accountId: f.accountId,
    guardianId: f.guardianId,
    guardianName: f.guardian.fullName,
    packageName: f.packageName,
    terms: f.terms,
    recargas: f.extensions.map((e) => ({
      minutes: e.minutes,
      packageName: e.packageName,
      price: { minor: String(e.priceMinor), currency: "USD" },
      at: e.createdAt.toISOString(),
    })),
    porUso: f.porUso,
    ...(pausaDe(f) ? { pausa: pausaDe(f) } : {}),
  });
}

/** La pausa de una estancia como la entrega el servidor (B4-7), o `undefined` si no la tuvo. */
function pausaDe(f: FilaDeEstancia): PausaDto | undefined {
  const inicio = f.pauses.find((x) => x.kind === "PAUSA");
  if (!inicio || inicio.maxMinutes === null) return undefined;
  const fin = f.pauses.find((x) => x.kind === "REANUDA");
  return { desde: inicio.at.toISOString(), hasta: fin ? fin.at.toISOString() : null, maxMin: inicio.maxMinutes };
}

/** La pausa en la forma del dominio, para medir la estancia sin ella. */
function pausaDelDominio(f: FilaDeEstancia): Pause | undefined {
  const p = pausaDe(f);
  return p ? { startedAt: epochMs(Date.parse(p.desde)), endedAt: p.hasta ? epochMs(Date.parse(p.hasta)) : null, maxMinutes: p.maxMin } : undefined;
}

/** Cómo se nombra a un niño en la cuenta y en los avisos: su apodo, su nombre o su pulsera (DEC-28). */
function nombreDeFila(f: FilaDeEstancia): string {
  return f.kid?.nickname ?? f.kid?.name ?? f.wristbandCode;
}

/** La estancia y sus condiciones en la forma del dominio, para medirla. */
function paraMedir(f: FilaDeEstancia): { sesion: SesionDelDominio; politica: ParkPolicy } {
  const t = ParkTermsSchema.parse(f.terms);
  return {
    sesion: {
      id: f.id,
      wristbandCode: f.wristbandCode,
      mode: f.mode as "PREPAGO" | "POSTPAGO",
      duration: duracionDe(f),
      startedAt: epochMs(f.startedAt.getTime()),
      // Lo que estuvo comiendo no cuenta (B4-7): ni consume su tiempo ni se cobra como tiempo de más.
      ...(pausaDelDominio(f) ? { pause: pausaDelDominio(f)! } : {}),
    },
    politica: parkPolicy({
      graceMinutes: t.graceMinutes,
      penaltyBlockMinutes: t.penaltyBlockMinutes,
      penaltyPricePerBlock: money(BigInt(t.penaltyPricePerBlock.minor), "USD"),
      warnBeforeMinutes: t.warnBeforeMinutes,
    }),
  };
}

/** Lo contratado de una estancia: el paquete y cada recarga, que ya están en la cuenta como líneas propias. */
function contratadoDe(f: FilaDeEstancia) {
  return f.extensions.reduce((acc, e) => add(acc, money(e.priceMinor, "USD")), money(f.priceMinor, "USD"));
}

/**
 * Salir antes de tiempo en cuenta abierta (B4-6, M-18): el paquete que se cobra en lugar de lo contratado, el
 * más barato del tarifario con que entró que cubre lo que estuvo. `null` si se pasó (se cobra como siempre,
 * con el tiempo de más) o si lo contratado ya es lo más barato.
 */
function paqueteParaCobrarPorUso(f: FilaDeEstancia, hasta: number): PaqueteDeUso | null {
  const { sesion, politica } = paraMedir(f);
  if (settleAtExit(sesion, politica, epochMs(hasta)).overdue.amount > 0n) return null;
  const paquetes: PaqueteDeUso[] = f.porUso.map((p) => ({
    name: p.name,
    duration: p.duration.kind === "fixed" ? fixed(p.duration.minutes) : openEnded,
    price: money(BigInt(p.price.minor), "USD"),
  }));
  return paquetePorUso(paquetes, computeSessionView(sesion, politica, epochMs(hasta)).elapsedMs, politica.graceMinutes, contratadoDe(f));
}

/** El desglose de la salida de una estancia en `hasta` (el instante del servidor, ADR-010). */
function liquidacionDe(f: FilaDeEstancia, hasta: number, porUso: PaqueteDeUso | null = null): SettlementLineDto {
  const { sesion, politica } = paraMedir(f);
  const s = settleAtExit(sesion, politica, epochMs(hasta));
  // Lo contratado, o el paquete por uso si salió antes de tiempo en cuenta abierta (B4-6).
  const contratado = contratadoDe(f);
  const paquete = porUso ? porUso.price : contratado;
  return {
    sessionId: f.id,
    wristbandCode: f.wristbandCode,
    kid: f.kid ? { id: f.kid.id, name: f.kid.name, ...(f.kid.nickname ? { nickname: f.kid.nickname } : {}) } : {},
    startedAt: f.startedAt.toISOString(),
    endedAt: new Date(hasta).toISOString(),
    consumedMinutes: s.consumedMinutes,
    billableOverdueMinutes: s.billableOverdueMinutes,
    penaltyBlocks: s.penaltyBlocks,
    packagePrice: { minor: String(contratado.amount), currency: "USD" },
    porUso: porUso ? { paquete: porUso.name, precio: { minor: String(porUso.price.amount), currency: "USD" } } : null,
    overdue: { minor: String(s.overdue.amount), currency: "USD" },
    total: { minor: String(add(paquete, s.overdue).amount), currency: "USD" },
  };
}

/** Lo que dejó una entrada: sus estancias y la cuenta de la familia como está ahora. */
/**
 * La cuenta a la que se suma una entrada (B4-12): de una familia (no un cumpleaños), de este representante, con algún
 * niño todavía en la sala y que no se dio por perdida. Desde papel no se suma: lo anotado entra como se anotó.
 */
async function cuentaParaSumar(
  tx: Transaccion,
  ctx: Contexto,
  accountId: string,
  guardianId: string,
  desdePapel: boolean,
): Promise<Readonly<{ cuenta: FamilyAccountDto; version: number }> | Rechazo> {
  const noSeSuma = (mensaje: string): Rechazo => ({ ok: false, motivo: "CONFLICTO", mensaje, problemas: [{ path: ["sumarA"], message: "NO_SE_SUMA" }] });
  if (desdePapel) return noSeSuma("Lo cargado desde papel entra como se anotó: no se suma a otra cuenta.");
  const fila = await tx.account.findUnique({ where: { id: accountId }, select: { branchId: true, kind: true } });
  if (!fila || fila.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no está en esta sucursal." };
  if (fila.kind !== "FAMILIA") return noSeSuma("Solo se suma a la cuenta de una familia del parque.");
  const vigente = (await vigenteDe(tx, accountId))!;
  if (vigente.cuenta.status === "INCOBRABLE") return noSeSuma("Esa cuenta se dio por incobrable: abre una nueva.");
  const enSala = await tx.parkSession.findMany({ where: { accountId, status: "ACTIVA" }, select: { guardianId: true } });
  if (enSala.length === 0) return noSeSuma("Esa familia ya no tiene niños en la sala: entra con una cuenta nueva.");
  if (enSala.some((s) => s.guardianId !== guardianId)) return noSeSuma("Esa cuenta es de otro representante.");
  return { cuenta: vigente.cuenta, version: vigente.version };
}

export async function entradaHecha(tx: Transaccion, clave: string, accountId: string): Promise<CheckInResult> {
  const filas = await estancias(tx, { where: { checkInKey: clave }, orderBy: { wristbandCode: "asc" } });
  const cuenta: FamilyAccountDto = (await vigenteDe(tx, accountId))!.cuenta;
  const orden = new Map(cuenta.sessionIds.map((id, i) => [id, i]));
  filas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
  return { sessions: filas.map(estanciaDe), account: cuenta };
}

/** Lo que dejó una salida: su desglose (con la hora en que se cerró) y la cuenta como está ahora. */
async function salidaHecha(tx: Transaccion, clave: string, accountId: string): Promise<CheckoutResult> {
  const filas = await estancias(tx, { where: { checkOutKey: clave } });
  const cuenta = (await vigenteDe(tx, accountId))!.cuenta;
  const lines: SettlementLineDto[] = [];
  // Una a una: dentro de la transacción, nunca dos consultas a la vez (§5).
  for (const f of filas) lines.push(liquidacionDe(f, f.endedAt!.getTime(), await porUsoAsentado(tx, cuenta, f)));
  return { lines, account: cuenta };
}

/**
 * El paquete por uso que asentó la salida de una estancia (B4-6), para que el reintento devuelva el mismo
 * desglose. Lo que se calcula es lo mismo que calculó la salida (las condiciones y el tarifario de la
 * entrada, y la hora en que se cerró); se da por asentado si su línea `uso-` está en la cuenta de la
 * familia o en la de la mesa adonde se fue el paquete.
 */
async function porUsoAsentado(tx: Transaccion, familia: FamilyAccountDto, f: FilaDeEstancia): Promise<PaqueteDeUso | null> {
  if (familia.mode !== "CUENTA_ABIERTA") return null;
  const p = paqueteParaCobrarPorUso(f, f.endedAt!.getTime());
  if (!p) return null;
  const id = `uso-${f.id}`;
  if (familia.lines.some((l) => l.id === id)) return p;
  const mesas = new Set(familia.lines.filter((l) => l.sessionId === f.id && l.movedTo).map((l) => l.movedTo!));
  for (const mesaId of mesas) {
    const mesa = await vigenteDe(tx, mesaId);
    if (mesa?.cuenta.lines.some((l) => l.id === id)) return p;
  }
  return null;
}

/**
 * El niño de una entrada: uno del directorio de la familia (`kid.id`), uno nuevo con nombre, o nadie
 * todavía (DEC-28: en la puerta no se pide el nombre). `"AJENO"` si el que cita es de otra familia.
 */
async function ninoDeLaEntrada(
  tx: Transaccion,
  ctx: Contexto,
  guardianId: string,
  kid: { id?: string | undefined; name?: string | undefined; nickname?: string | undefined },
  ahora: number,
): Promise<string | null | "AJENO"> {
  if (kid.id) {
    const k = await tx.kid.findUnique({ where: { id: kid.id }, select: { guardianId: true } });
    return k && k.guardianId === guardianId ? kid.id : "AJENO";
  }
  if (!kid.name) return null;
  const suyos = await tx.kid.findMany({ where: { guardianId }, select: { id: true, name: true } });
  const mismo = suyos.find((k) => claveDeNombre(k.name) === claveDeNombre(kid.name!));
  if (mismo) return mismo.id;
  const nuevo = await tx.kid.create({
    data: { tenantId: ctx.tenantId, guardianId, name: kid.name, nickname: kid.nickname ?? null, createdAt: new Date(ahora) },
    select: { id: true },
  });
  return nuevo.id;
}
