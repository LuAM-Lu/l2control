"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScanLine, TriangleAlert, Wallet, X } from "lucide-react";
import {
  CheckoutCommandSchema,
  WristbandCodeSchema,
  type FamilyAccountDto,
  type MonitorSnapshotDto,
} from "@l2/contracts";
import {
  Badge,
  Button,
  Container,
  Initial,
  MoneyDisplay,
  ScannerField,
  ScanPrompt,
  StatTile,
  avisar,
  formatMoneyVE,
  useServerClock,
} from "@l2/ui";
import { PackageOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { sum, toMajor } from "@l2/domain-money";
import { pendiente, previsualizarSalida } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { buildCheckoutPreview, moneyDtoToMajor } from "./settlement.ts";
import { formatClock } from "./time-format.ts";
import { useSala } from "./SalaProvider.tsx";
import { nombreDeEstancia } from "./view-model";
import { registrarSalida } from "./parque.acciones";
import { useActorEnSesion } from "../identity/sesion.ts";
import { puedeAbrirRuta } from "../identity/visibilidad.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * Salida y liquidación del parque — F5-14.
 *
 * Dos decisiones de diseño que vienen del negocio, no del código:
 *
 *  · **Se liquidan varios niños a la vez.** Una familia se va junta; obligar a
 *    cerrar de uno en uno y cobrar tres veces sería más lento y produciría
 *    tres documentos donde el negocio quiere uno.
 *  · **El desglose se muestra siempre.** Con el representante delante, «son
 *    6,50» sin explicación es una discusión; «5,00 del paquete más 1,50 por 7
 *    minutos de más» no lo es. El desglose es atención al cliente.
 *
 * Desde B4-3 la liquida el servidor, con su reloj y las condiciones con que entró cada niño: lo que
 * esta pantalla enseña antes de confirmar es su anticipo. Cada familia sale con su propia operación
 * (y su clave): dos familias en la misma salida son dos registros, cada uno con su cuenta.
 *
 * Cargar a una mesa llega con el restaurante (Etapa 6): hasta entonces todo va a la caja.
 */
export function CheckoutScreen({
  pulseraInicial = null,
}: {
  /** Desde la ficha del monitor: el niño ya viene elegido. Se valida igual
   *  que un escaneo, porque llega por la URL. */
  pulseraInicial?: string | null;
}) {
  const { ajustes } = useSucursal();
  const timeFormat = ajustes.formatoHora;
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Cerrar una salida es una acción terminada: se anuncia y la pantalla queda lista para la siguiente. */
  const anunciarCierre = (c: { ninos: number; total: string; destino: string }) =>
    avisar.ok(`${c.ninos} ${c.ninos === 1 ? "salida cerrada" : "salidas cerradas"} por ${formatMoneyVE(c.total, "USD")}`, {
      detalle: c.destino.charAt(0).toUpperCase() + c.destino.slice(1),
    });
  const { cuentas, adoptar: adoptarCuenta } = useCuentas();
  const { sala, quitar: quitarDeLaSala } = useSala();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  /** Una clave por familia y por intento: un reintento tras un corte no liquida dos veces (I-11). */
  const claves = useRef(new Map<string, string>());

  const actor = useActorEnSesion();
  const puedeCobrar = actor !== null && puedeAbrirRuta(actor, "/caja");

  // La hora del servidor, interpolada entre sondeos (ADR-010): el anticipo corre con ella.
  const ahora = useServerClock(sala ? Date.parse(sala.serverNow) : 0);
  const snapshot: MonitorSnapshotDto = useMemo(
    () =>
      sala
        ? { ...sala, serverNow: new Date(Math.max(ahora, Date.parse(sala.serverNow))).toISOString() }
        : { serverNow: new Date(0).toISOString(), policy: { graceMinutes: 0, penaltyBlockMinutes: 1, penaltyPricePerBlock: { minor: "0", currency: "USD" }, warnBeforeMinutes: 0, capacityLimit: 1 }, rate: null, shiftLabel: "", sessions: [] },
    [sala, ahora],
  );
  const snap = snapshot;

  const preview = useMemo(
    () => buildCheckoutPreview(snap, seleccionados),
    [snap, seleccionados],
  );

  const itemRefs = useRef(new Map<string, HTMLLIElement | null>());

  const handleScan = useCallback(
    (code: string) => {
      const parsed = WristbandCodeSchema.safeParse(code);
      if (!parsed.success) {
        setAviso(`Código no reconocido: ${code}`);
        return;
      }
      const limpio = parsed.data;
      const sesion = snapshot.sessions.find((s) => s.wristbandCode === limpio);

      if (!sesion) {
        // Fail-closed: si la pulsera no corresponde a nadie en sala, no se
        // inventa una salida. Puede ser de otro día o de otro local.
        setAviso(`La pulsera ${limpio} no corresponde a ningún niño en sala`);
        return;
      }
      if (seleccionados.includes(sesion.id)) {
        setAviso(`${nombreDeEstancia(sesion)} ya está en esta salida`);
        return;
      }
      setSeleccionados((prev) => [...prev, sesion.id]);
      setAviso(null);
      queueMicrotask(() => {
        const item = itemRefs.current.get(sesion.id);
        if (item) item.scrollIntoView({ block: "nearest" });
      });
    },
    [snapshot.sessions, seleccionados],
  );

  const inicial = useRef(pulseraInicial);
  useEffect(() => {
    const codigo = inicial.current;
    if (!codigo) return;
    inicial.current = null;
    handleScan(codigo);
  }, [handleScan]);

  const validarPulsera = useCallback(
    (code: string) => WristbandCodeSchema.safeParse(code).success,
    [],
  );

  const quitar = (id: string) =>
    setSeleccionados((prev) => prev.filter((x) => x !== id));

  const hayAlgo = preview.lines.length > 0;

  /**
   * Qué pasa con cada cuenta si esta salida se confirma (DEC-21). Se calcula
   * ANTES de confirmar para que el botón y el resumen digan exactamente lo
   * que va a ocurrir: nada, solo el excedente, o la cuenta entera.
   */
  const plan = useMemo(() => {
    const porCuenta = new Map<
      string,
      {
        cuenta: (typeof cuentas)[number];
        salen: string[];
        excedentes: { sessionId: string; concept: string; amount: { minor: string; currency: "USD" | "VES" | "USDT" } }[];
      }
    >();
    const sinCuenta: string[] = [];
    const cuentaDe = new Map(snapshot.sessions.map((x) => [x.id, x.accountId]));
    for (const l of preview.lines) {
      const c = cuentas.find((x) => x.id === cuentaDe.get(l.sessionId));
      // Sin nombre, la pulsera es el nombre: es lo que el niño lleva puesto.
      const nombre = nombreDeEstancia(l);
      if (!c) {
        sinCuenta.push(nombre);
        continue;
      }
      const g = porCuenta.get(c.id) ?? { cuenta: c, salen: [], excedentes: [] };
      g.salen.push(l.sessionId);
      if (l.penaltyBlocks > 0) {
        g.excedentes.push({
          sessionId: l.sessionId,
          concept: `Tiempo de más · ${nombre} (${l.penaltyBlocks === 1 ? "1 bloque" : `${l.penaltyBlocks} bloques`})`,
          amount: l.overdue,
        });
      }
      porCuenta.set(c.id, g);
    }
    const grupos = [...porCuenta.values()];
    const resultados = grupos.map((g) => previsualizarSalida(g.cuenta, g.salen, g.excedentes));
    return { resultados, grupos, sinCuenta };
  }, [preview.lines, cuentas, snapshot.sessions]);

  const porCobrar = plan.resultados.filter((c) => c.status === "POR_COBRAR");
  const aCobrar = sum(porCobrar.map(pendiente), "USD");

  async function confirmarSalida() {
    if (plan.sinCuenta.length > 0) {
      // Fail-closed: sin cuenta no se sabe quién paga ni qué se pagó ya.
      setAviso(`Sin cuenta: ${plan.sinCuenta.join(", ")}. No se puede cerrar su salida.`);
      return;
    }
    setEnviando(true);
    const hechas: FamilyAccountDto[] = [];
    const cerradas: string[] = [];
    let fallo: string | null = null;
    // Una operación por familia, cada una con su clave: estable si hay que reintentar tras un
    // corte, nueva si el servidor la rechazó.
    for (const g of plan.grupos) {
      const clave = claves.current.get(g.cuenta.id) ?? globalThis.crypto.randomUUID();
      claves.current.set(g.cuenta.id, clave);
      const cmd = CheckoutCommandSchema.parse({ idempotencyKey: clave, sessionIds: g.salen, disposition: { kind: "CAJA" } });
      const r = await registrarSalida(cmd).catch(() => null);
      if (!r) {
        fallo = "Sin conexión con el servidor: la salida no se registró. Vuelve a intentarlo.";
        break;
      }
      claves.current.delete(g.cuenta.id);
      if (!r.ok) {
        fallo = r.mensaje;
        break;
      }
      hechas.push(r.valor.account);
      cerradas.push(...cmd.sessionIds);
    }
    setEnviando(false);

    // Lo que sí salió se ve al momento, aunque otra familia de la misma salida fallara.
    for (const c of hechas) adoptarCuenta(c);
    quitarDeLaSala(cerradas);
    setSeleccionados((prev) => prev.filter((id) => !cerradas.includes(id)));
    if (fallo) {
      setAviso(fallo);
      return;
    }
    setAviso(null);

    const ninos = cerradas.length;
    const aCaja = hechas.filter((c) => c.status === "POR_COBRAR");
    const monto = sum(aCaja.map(pendiente), "USD");
    const unica = aCaja[0];
    if (aCaja.length === 1 && unica) {
      if (puedeCobrar) {
        router.push(`/caja?cuenta=${unica.id}&volver=/salida` as Route);
      } else {
        anunciarCierre({ ninos, total: toMajor(monto), destino: "enviado a caja" });
      }
      return;
    }
    if (aCaja.length > 1) {
      if (puedeCobrar) {
        router.push("/caja?volver=/salida" as Route);
      } else {
        anunciarCierre({ ninos, total: toMajor(monto), destino: "enviado a caja" });
      }
      return;
    }
    anunciarCierre({
      ninos,
      total: "0.00",
      destino: hechas.some((c) => c.status === "ABIERTA") ? "sin cargo por ahora: la familia sigue con niños dentro" : "sin cargo: estaba todo pagado",
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4 bajo:py-2">
          <div>
            <div>
              <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
                Salida del parque
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3 bajo:hidden">
                Pasa las pulseras de quienes se van
              </p>
            </div>
          </div>

          <div className="flex items-end gap-7">
            <StatTile label="En sala" value={sala ? snapshot.sessions.length : "—"} />
            <StatTile
              label="En esta salida"
              value={preview.lines.length}
              tone={hayAlgo ? "brand" : "idle"}
            />
          </div>
        </Container>
      </header>

      <Container as="main" ancho="operacion" className="grid flex-1 gap-5 py-4 apaisado:min-h-0 apaisado:grid-cols-[minmax(0,1fr)_360px] apaisado:grid-rows-[minmax(0,1fr)] bajo:py-3">
        <section className="flex min-w-0 flex-col gap-4 apaisado:min-h-0">
          <div className="shrink-0">
            <ScannerField
              onScan={handleScan}
              validate={validarPulsera}
              placeholder="Pasa la pulsera de quien se va…"
            />
          </div>

          {aviso && (
            <p
              role="alert"
              className="flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-3 text-[13px] text-state-warn"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {aviso}
            </p>
          )}

          <div className="-m-1 p-1 apaisado:min-h-0 apaisado:flex-1 apaisado:overflow-y-auto">
            {!hayAlgo ? (
              <ScanPrompt
                icon={<ScanLine size={40} aria-hidden="true" />}
                titulo="Pasa la pulsera de quien se va"
                detalle="Si se va la familia entera, pasa todas seguidas: se liquidan juntas, con el desglose de cada niño, y se cobra una sola vez."
                pasos={["Pasa las pulseras", "Revisa el desglose", puedeCobrar ? "Cobra en caja" : "Envía a caja"]}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {preview.lines.map((l) => {
                  const conExcedente = l.penaltyBlocks > 0;
                  return (
                    <li
                      key={l.sessionId}
                      ref={(el) => { itemRefs.current.set(l.sessionId, el); }}
                      className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                    >
                    <div className="flex items-start gap-3">
                      <Initial
                        name={nombreDeEstancia(l)}
                        tone={conExcedente ? "crit" : "ok"}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-display truncate text-lg leading-tight font-bold text-ink">
                          {nombreDeEstancia(l)}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-3">
                          <span className="tnum font-mono">{l.wristbandCode}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tnum">
                            {formatClock(Date.parse(l.startedAt), timeFormat)} →{" "}
                            {formatClock(Date.parse(l.endedAt), timeFormat)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tnum">{l.consumedMinutes} min en sala</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitar(l.sessionId)}
                        aria-label={`Quitar a ${nombreDeEstancia(l)} de esta salida`}
                        className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>

                    {/* El desglose, siempre visible. Es lo que evita la
                        discusión en taquilla. */}
                    <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-ink-2">Paquete contratado</dt>
                        <dd>
                          <MoneyDisplay
                            value={moneyDtoToMajor(l.packagePrice)}
                            currency={l.packagePrice.currency}
                            size="sm"
                            tone="muted"
                          />
                        </dd>
                      </div>

                      {conExcedente && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-state-warn">
                            Tiempo de más
                            <span className="tnum ml-1.5 text-ink-3">
                              ({l.billableOverdueMinutes} min ·{" "}
                              {l.penaltyBlocks === 1
                                ? "1 bloque"
                                : `${l.penaltyBlocks} bloques`}
                              )
                            </span>
                          </dt>
                          <dd>
                            <MoneyDisplay
                              value={moneyDtoToMajor(l.overdue)}
                              currency={l.overdue.currency}
                              size="sm"
                              tone="negative"
                            />
                          </dd>
                        </div>
                      )}

                      <div className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-1.5">
                        <dt className="font-semibold text-ink">Subtotal</dt>
                        <dd>
                          <MoneyDisplay
                            value={moneyDtoToMajor(l.total)}
                            currency={l.total.currency}
                            size="md"
                          />
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 bajo:gap-3 bajo:p-4 apaisado:min-h-0 apaisado:max-h-full apaisado:self-start">
          <div className="-m-1 flex flex-col gap-4 p-1 apaisado:min-h-0 apaisado:flex-1 apaisado:overflow-y-auto bajo:gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Liquidación</h2>

            {/* Las dos rutas del plan. Producen el mismo total; cambia a dónde
                va la deuda. */}
            {/* Qué le pasa a cada cuenta, antes de confirmar (DEC-21). */}
            {plan.resultados.length > 0 && (
              <ul className="flex flex-col gap-2">
                {plan.resultados.map((c) => {
                  const p = pendiente(c);
                  return (
                    <li
                      key={c.id}
                      className="rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2.5 text-[13px]"
                    >
                      <p className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-ink">{c.family}</span>
                        <Badge tone={c.mode === "PREPAGO" ? "idle" : "brand"}>
                          {c.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"}
                        </Badge>
                      </p>
                      <p className="tnum mt-1 text-ink-3">
                        {p.amount === 0n
                          ? "Todo pagado: sale sin cargo"
                          : c.status === "POR_COBRAR"
                            ? `A cobrar ahora: ${formatMoneyVE(toMajor(p), "USD")}`
                            : `Se acumula ${formatMoneyVE(toMajor(p), "USD")} hasta que salga el resto`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 flex shrink-0 flex-col gap-4 border-t border-line pt-4 bajo:mt-3 bajo:gap-3">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
                  A cobrar ahora
                </span>
                <MoneyDisplay value={toMajor(aCobrar)} currency="USD" size="lg" />
              </div>
              <p className="mt-1 text-[12px] text-ink-3">
                {preview.lines.length === 0
                  ? "Sin niños en esta salida"
                  : `${preview.lines.length} ${preview.lines.length === 1 ? "niño" : "niños"} · parque ${formatMoneyVE(moneyDtoToMajor(preview.total), "USD")}`}
              </p>
            </div>

            <Button
              surface="pos"
              variant="primary"
              disabled={!hayAlgo || enviando}
              onClick={() => void confirmarSalida()}
              className="w-full"
            >
              <Wallet size={17} aria-hidden="true" />
              {enviando
                ? "Registrando la salida…"
                : porCobrar.length === 0
                ? "Registrar salida sin cargo"
                : porCobrar.length === 1
                  ? (puedeCobrar ? `Cobrar ${formatMoneyVE(toMajor(aCobrar), "USD")} en caja` : `Enviar ${formatMoneyVE(toMajor(aCobrar), "USD")} a caja`)
                  : `Enviar ${porCobrar.length} cuentas a caja`}
            </Button>

            {!hayAlgo && (
              <Badge tone="idle" icon={<PackageOpen size={13} aria-hidden="true" />}>
                Esperando pulseras
              </Badge>
            )}
          </div>
        </aside>
      </Container>
    </div>
  );
}
