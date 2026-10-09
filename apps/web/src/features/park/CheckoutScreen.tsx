"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ScanLine, TriangleAlert, Wallet, X } from "lucide-react";
import {
  CheckoutCommandSchema,
  WristbandCodeSchema,
  type FamilyAccountDto,
  type MonitorSnapshotDto,
  type RecogidaDto,
} from "@l2/contracts";
import {
  Badge,
  Button,
  Container,
  FiltroSegmentado,
  Initial,
  MoneyDisplay,
  ScannerField,
  ScanPrompt,
  StatTile,
  avisar,
  cn,
  formatMoneyVE,
} from "@l2/ui";
import { HandHeart, HandPlatter, PackageOpen } from "lucide-react";
import { isWristbandless } from "@l2/domain-park";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { sum, toMajor } from "@l2/domain-money";
import { pendiente, previsualizarSalida } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { buildCheckoutPreview, moneyDtoToMajor } from "./settlement.ts";
import { usePlano } from "../mesas/PlanoProvider.tsx";
import { cuentasDeLaMesa } from "../mesas/mesas.ts";
import { useAhoraDeLaSala, useSala } from "./SalaProvider.tsx";
import { nombreDeEstancia } from "./view-model";
import { registrarSalida } from "./parque.acciones";
import { useActorEnSesion } from "../identity/sesion.ts";
import { puedeAbrirRuta } from "../identity/visibilidad.ts";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { BotonCamara, LectorCamara } from "../lector/LectorCamara";

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
 * Cargar a una mesa (F5-14, B6-3): lo pendiente de la salida pasa a la cuenta de la mesa y se cobra allí.
 * Por defecto va a caja. La mesa la elige quien registra la salida: el servidor comprueba que exista y no
 * esté retirada, y si ya tiene cuenta abierta la carga en esa (una mesa, una cuenta: I-05).
 */
export function CheckoutScreen({
  pulseraInicial = null,
}: {
  /** Desde la ficha del monitor: el niño ya viene elegido. Se valida igual
   *  que un escaneo, porque llega por la URL. */
  pulseraInicial?: string | null;
}) {
  const hora = useHora();
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  /** En el teléfono (B4-5), dos pasos: las pulseras y luego la liquidación. */
  const [pasoMovil, setPasoMovil] = useState<"PULSERAS" | "LIQUIDACION">("PULSERAS");
  /** La cámara del teléfono como lector (V-2). */
  const [camara, setCamara] = useState(false);
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
  /**
   * A quién se entrega cada familia (D9): su representante u otra persona, con su nombre. No se da
   * por supuesto: quien atiende lo marca, y queda constancia en la salida.
   */
  const [recogidas, setRecogidas] = useState<Record<string, { kind: "REPRESENTANTE" } | { kind: "OTRA_PERSONA"; nombre: string }>>({});

  /** Dónde se paga la salida (F5-14, B6-3): en caja, o cargada a una mesa del plano (la cuenta de la mesa). */
  const [destino, setDestino] = useState<"CAJA" | "MESA">("CAJA");
  const [mesaElegida, setMesaElegida] = useState<string | null>(null);
  const { plano } = usePlano();
  const mesas = useMemo(() => (plano?.tables ?? []).filter((m) => !m.retiredAt), [plano]);
  /**
   * A qué se puede cargar (B6-7): una opción por mesa, y en una mesa compartida una por familia, porque el
   * parque va a la cuenta de la familia de los niños, no a la mesa. `clave` es lo que se elige.
   */
  const opcionesDeMesa = useMemo(
    () =>
      mesas.flatMap((m) => {
        const suyas = cuentasDeLaMesa(cuentas, m.id);
        const nombre = (family: string) => (family === `Mesa ${m.label}` ? null : family);
        if (suyas.length <= 1) return [{ clave: m.id, tableId: m.id, cuentaId: suyas[0]?.id, mesa: m.label, familia: suyas[0] ? nombre(suyas[0].family) : null }];
        return suyas.map((c) => ({ clave: c.id, tableId: m.id, cuentaId: c.id, mesa: m.label, familia: nombre(c.family) ?? "Primera cuenta" }));
      }),
    [mesas, cuentas],
  );
  /**
   * Las pulseras vinculadas a una mesa salen a su mesa, sin elegir (B4-14, M-34): la cuenta del salón que las tiene. Si
   * se mezclan con otras (sueltas o de otra mesa), salen por separado.
   */
  const deMesa = useMemo(() => {
    if (seleccionados.length === 0) return { mesa: null, mezcla: false };
    const suyas = seleccionados.map((id) => cuentas.find((c) => c.kind === "MESA" && c.status !== "COBRADA" && c.sessionIds.includes(id)) ?? null);
    const distintas = new Set(suyas.map((c) => c?.id ?? "suelta"));
    if (suyas.every((c) => c === null)) return { mesa: null, mezcla: false };
    return { mesa: distintas.size === 1 ? suyas[0]! : null, mezcla: distintas.size > 1 };
  }, [seleccionados, cuentas]);
  const opcionVinculada = deMesa.mesa ? (opcionesDeMesa.find((o) => o.cuentaId === deMesa.mesa!.id) ?? opcionesDeMesa.find((o) => o.tableId === deMesa.mesa!.tableId) ?? null) : null;
  const opcionElegida = opcionVinculada ?? opcionesDeMesa.find((o) => o.clave === mesaElegida) ?? null;
  const etiquetaDeMesa = opcionElegida ? `${opcionElegida.mesa}${opcionElegida.familia ? ` · ${opcionElegida.familia}` : ""}` : null;

  const actor = useActorEnSesion();
  const puedeCobrar = actor !== null && puedeAbrirRuta(actor, "/caja");

  // La hora del servidor según el reloj de la sala (ADR-010, B4-13): el desglose corre con ella.
  const ahora = useAhoraDeLaSala();
  const snapshot: MonitorSnapshotDto = useMemo(
    () =>
      sala
        ? { ...sala, serverNow: new Date(Math.max(ahora, Date.parse(sala.serverNow))).toISOString() }
        : { serverNow: new Date(0).toISOString(), policy: { graceMinutes: 0, penaltyBlockMinutes: 1, penaltyPricePerBlock: { minor: "0", currency: "USD" }, warnBeforeMinutes: 0, capacityLimit: 1 }, rate: null, shiftLabel: "", sessions: [], huerfanas: [] },
    [sala, ahora],
  );
  const snap = snapshot;

  const preview = useMemo(
    () => buildCheckoutPreview(snap, seleccionados, (accountId) => cuentas.find((c) => c.id === accountId)?.mode === "CUENTA_ABIERTA"),
    [snap, seleccionados],
  );

  const itemRefs = useRef(new Map<string, HTMLLIElement | null>());

  /** Los niños en sala que entraron sin pulsera (B4-8): la salida los elige por su nombre. */
  const sinPulsera = useMemo(() => snapshot.sessions.filter((s) => isWristbandless(s.wristbandCode)), [snapshot.sessions]);
  const [eligiendoSinPulsera, setEligiendoSinPulsera] = useState(false);

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
      setPasoMovil("PULSERAS");
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
        porUso: { sessionId: string; concept: string; amount: { minor: string; currency: "USD" | "VES" | "USDT" }; minutos: number }[];
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
      const g = porCuenta.get(c.id) ?? { cuenta: c, salen: [], excedentes: [], porUso: [] };
      g.salen.push(l.sessionId);
      if (l.penaltyBlocks > 0) {
        g.excedentes.push({
          sessionId: l.sessionId,
          concept: `Tiempo de más · ${nombre} (${l.penaltyBlocks === 1 ? "1 bloque" : `${l.penaltyBlocks} bloques`})`,
          amount: l.overdue,
        });
      }
      if (l.porUso) {
        g.porUso.push({
          sessionId: l.sessionId,
          concept: `Paquete ${l.porUso.paquete} por uso (${l.consumedMinutes} min) · ${l.wristbandCode}`,
          amount: l.porUso.precio,
          minutos: l.consumedMinutes,
        });
      }
      porCuenta.set(c.id, g);
    }
    const grupos = [...porCuenta.values()];
    const resultados = grupos.map((g) => previsualizarSalida(g.cuenta, g.salen, g.excedentes, g.porUso));
    return { resultados, grupos, sinCuenta };
  }, [preview.lines, cuentas, snapshot.sessions]);

  // La cuenta del día de un cumpleaños (B10-2) no se cobra cuando sale un invitado: su saldo lo paga quien
  // reservó, en la caja, cuando quiera. Sus invitados salen sin cargo.
  const porCobrar = plan.resultados.filter((c) => c.status === "POR_COBRAR" && c.kind !== "EVENTO");
  // D9: cada familia de la salida dice a quién se entrega; «otra persona», con su nombre.
  const faltaRecogida = plan.grupos.some((g) => {
    const r = recogidas[g.cuenta.id];
    return !r || (r.kind === "OTRA_PERSONA" && r.nombre.trim().length < 2);
  });
  const aCobrar = sum(porCobrar.map(pendiente), "USD");

  async function confirmarSalida() {
    if (faltaRecogida) {
      setAviso("Marca a quién se entrega cada familia antes de registrar la salida.");
      return;
    }
    if (deMesa.mezcla) {
      setAviso("Unos niños están vinculados a una mesa y otros no: registra su salida por separado.");
      return;
    }
    if (destino === "MESA" && !opcionElegida) {
      setAviso("Elige la mesa a la que se carga la salida.");
      return;
    }
    // Con mesa, lo pendiente de estos niños pasa a la cuenta de la mesa (el servidor lo comprueba: I-05).
    const disposicion =
      (destino === "MESA" || opcionVinculada) && opcionElegida
        ? { kind: "MESA" as const, tableId: opcionElegida.tableId, ...(opcionElegida.cuentaId ? { cuentaId: opcionElegida.cuentaId } : {}) }
        : { kind: "CAJA" as const };
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
      const recogida: RecogidaDto = recogidas[g.cuenta.id] ?? { kind: "REPRESENTANTE" };
      const cmd = CheckoutCommandSchema.parse({ idempotencyKey: clave, sessionIds: g.salen, disposition: disposicion, recogida });
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
    setRecogidas((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !hechas.some((c) => c.id === id))));
    if (fallo) {
      setAviso(fallo);
      return;
    }
    setPasoMovil("PULSERAS");
    setAviso(null);

    const ninos = cerradas.length;
    if (disposicion.kind === "MESA") {
      // Lo cargado no sale a la caja: la cuenta de la mesa lo guarda hasta que se cobre allí.
      anunciarCierre({ ninos, total: toMajor(aCobrar), destino: `cargado a la mesa ${etiquetaDeMesa ?? "?"}` });
      return;
    }
    const aCaja = hechas.filter((c) => c.status === "POR_COBRAR" && c.kind !== "EVENTO");
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
      destino: hechas.some((c) => c.kind === "EVENTO")
        ? "sin cargo: invitados de un cumpleaños"
        : hechas.some((c) => c.status === "ABIERTA")
          ? "sin cargo por ahora: la familia sigue con niños dentro"
          : "sin cargo: estaba todo pagado",
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4 max-md:py-2 bajo:py-2">
          {/* En el teléfono el título lo dice la pestaña: queda para el lector de pantalla. */}
          <div className="max-md:sr-only">
            <div>
              <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
                Salida del parque
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3 bajo:hidden">
                Pasa las pulseras de quienes se van
              </p>
            </div>
          </div>

          <div className="flex items-end gap-7 max-md:w-full max-md:justify-between">
            <StatTile label="En sala" value={sala ? snapshot.sessions.length : "—"} />
            <StatTile
              label="En esta salida"
              value={preview.lines.length}
              tone={hayAlgo ? "brand" : "idle"}
            />
          </div>
        </Container>
      </header>

      <Container as="main" ancho="operacion" className="grid flex-1 gap-5 py-4 max-md:min-h-0 max-md:grid-rows-[minmax(0,1fr)] max-md:py-3 apaisado:min-h-0 apaisado:grid-cols-[minmax(0,1fr)_360px] apaisado:grid-rows-[minmax(0,1fr)] bajo:py-3">
        <section className={cn("flex min-w-0 flex-col gap-4 max-md:min-h-0 max-md:gap-3 apaisado:min-h-0", pasoMovil === "LIQUIDACION" && "max-md:hidden")}>
          <div data-recorrido="salida-lector" className="flex shrink-0 items-stretch gap-2">
            <ScannerField
              onScan={handleScan}
              validate={validarPulsera}
              placeholder="Pasa la pulsera de quien se va…"
              className="min-w-0 flex-1"
            />
            <BotonCamara activa={camara} onCambiar={setCamara} />
            {/* B4-8: un niño sin pulsera no se lee: se elige por su nombre. */}
            {sinPulsera.length > 0 && (
              <Button surface="tablet" variant={eligiendoSinPulsera ? "primary" : "neutral"} className="shrink-0 gap-1.5" aria-pressed={eligiendoSinPulsera} onClick={() => setEligiendoSinPulsera((v) => !v)}>
                <HandHeart size={18} aria-hidden="true" />
                <span className="max-sm:hidden">Sin pulsera ({sinPulsera.length})</span>
              </Button>
            )}
          </div>

          {eligiendoSinPulsera && sinPulsera.length > 0 && (
            <div role="group" aria-label="Niños sin pulsera en sala" className="flex shrink-0 flex-wrap gap-1.5 rounded-[var(--radius-card)] border border-line bg-surface p-2">
              {sinPulsera.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    handleScan(s.wristbandCode);
                    setEligiendoSinPulsera(false);
                  }}
                  className="flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 text-left text-[14px] font-semibold text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <HandHeart size={15} aria-hidden="true" className="text-brand" />
                  {nombreDeEstancia(s)}
                  <span className="text-[12px] font-normal text-ink-3">· {s.guardianName}</span>
                </button>
              ))}
            </div>
          )}

          {camara && <LectorCamara onCerrar={() => setCamara(false)} className="h-[36dvh] max-h-80 shrink-0 md:h-64" />}

          {aviso && (
            <p
              role="alert"
              className="flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-3 text-[13px] text-state-warn"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {aviso}
            </p>
          )}

          <div className="-m-1 p-1 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto apaisado:min-h-0 apaisado:flex-1 apaisado:overflow-y-auto">
            {!hayAlgo ? (
              camara ? null : <ScanPrompt
                className="max-md:py-6 max-md:[&_ol]:hidden"
                icon={<ScanLine size={40} aria-hidden="true" />}
                titulo="Pasa la pulsera de quien se va"
                detalle="Si se va la familia entera, pasa todas seguidas: se liquidan juntas, con el desglose de cada niño, y se cobra una sola vez."
                pasos={["Pasa las pulseras", "Revisa el desglose", puedeCobrar ? "Cobra en caja" : "Envía a caja"]}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {preview.lines.map((l) => {
                  const conExcedente = l.penaltyBlocks > 0;
                  // Lo que eligió al entrar y sus recargas, por su nombre: el desglose dice qué se cambió (B4-6).
                  const estancia = snapshot.sessions.find((x) => x.id === l.sessionId);
                  const contratado = estancia ? [estancia.packageName, ...estancia.recargas.map((r) => r.packageName)].join(" + ") : null;
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
                            {hora(Date.parse(l.startedAt))} →{" "}
                            {hora(Date.parse(l.endedAt))}
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
                        <dt className="text-ink-2">
                          Paquete contratado
                          {contratado && <span className="ml-1.5 text-ink-3">· {contratado}</span>}
                        </dt>
                        <dd className={cn(l.porUso && "line-through opacity-60")}>
                          <MoneyDisplay
                            value={moneyDtoToMajor(l.packagePrice)}
                            currency={l.packagePrice.currency}
                            size="sm"
                            tone="muted"
                          />
                        </dd>
                      </div>

                      {l.porUso && (
                        // Salió antes de tiempo en cuenta abierta (B4-6): se cobra lo que usó.
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-state-ok">
                            Por uso: {l.porUso.paquete}
                            <span className="tnum ml-1.5 text-ink-3">({l.consumedMinutes} min)</span>
                          </dt>
                          <dd>
                            <MoneyDisplay value={moneyDtoToMajor(l.porUso.precio)} currency={l.porUso.precio.currency} size="sm" />
                          </dd>
                        </div>
                      )}

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

          {/* En el teléfono, el paso siguiente: a quién se entrega y el cobro. */}
          <Button
            surface="tablet"
            variant="primary"
            className="w-full shrink-0 md:hidden"
            disabled={!hayAlgo}
            onClick={() => setPasoMovil("LIQUIDACION")}
          >
            {!hayAlgo
              ? "Pasa la primera pulsera"
              : `Continuar con ${preview.lines.length} ${preview.lines.length === 1 ? "niño" : "niños"}`}
            {hayAlgo && <ArrowRight size={18} aria-hidden="true" />}
          </Button>
        </section>

        <aside
          className={cn(
            "flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 max-md:min-h-0 max-md:p-4 bajo:gap-3 bajo:p-4 apaisado:min-h-0 apaisado:max-h-full apaisado:self-start",
            pasoMovil === "PULSERAS" && "max-md:hidden",
          )}
        >
          {/* En el teléfono: volver a las pulseras, con cuántas van. Fuera de lo que desplaza. */}
          <Button surface="tablet" variant="ghost" className="-mx-2 -mt-2 mb-2 shrink-0 self-start md:hidden" onClick={() => setPasoMovil("PULSERAS")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Pulseras ({preview.lines.length})
          </Button>
          <div className="-m-1 flex flex-col gap-4 p-1 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto apaisado:min-h-0 apaisado:flex-1 apaisado:overflow-y-auto bajo:gap-3">
            {aviso && (
              <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn md:hidden">
                <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                {aviso}
              </p>
            )}
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
                        <Badge tone={c.mode === "PREPAGO" || c.kind === "EVENTO" ? "idle" : "brand"}>
                          {c.kind === "EVENTO" ? "Cumpleaños" : c.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"}
                        </Badge>
                      </p>
                      <p className="tnum mt-1 text-ink-3">
                        {c.kind === "EVENTO"
                          ? "Invitado: sale sin cargo. El saldo del cumpleaños se cobra en la caja."
                          : p.amount === 0n
                          ? "Todo pagado: sale sin cargo"
                          : c.status === "POR_COBRAR"
                            ? `A cobrar ahora: ${formatMoneyVE(toMajor(p), "USD")}`
                            : `Se acumula ${formatMoneyVE(toMajor(p), "USD")} hasta que salga el resto`}
                      </p>
                      <Recogida
                        representante={c.family}
                        valor={recogidas[c.id] ?? null}
                        onCambio={(v) => {
                          setRecogidas((prev) => ({ ...prev, [c.id]: v }));
                          setAviso(null);
                        }}
                      />
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

            {deMesa.mezcla && (
              <p role="alert" className="text-[12.5px] font-medium text-state-warn">
                Unos niños están vinculados a una mesa y otros no: registra su salida por separado.
              </p>
            )}
            {opcionVinculada && (
              <p className="flex items-start gap-1.5 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2 text-[12.5px] text-ink-2">
                <HandPlatter size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Vinculada a la <strong className="text-ink">mesa {opcionVinculada.mesa}</strong>
                  {opcionVinculada.familia ? ` · ${opcionVinculada.familia}` : ""}: lo que debe y su tiempo de más van a esa cuenta.
                </span>
              </p>
            )}
            {porCobrar.length > 0 && !opcionVinculada && (
              <div className="flex flex-col gap-2">
                <FiltroSegmentado
                  etiqueta="Dónde se paga"
                  valor={destino}
                  onCambiar={(id) => setDestino(id)}
                  opciones={[
                    { id: "CAJA", nombre: "En caja" },
                    { id: "MESA", nombre: "A una mesa" },
                  ]}
                />
                {destino === "MESA" && (
                  mesas.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">Este local no tiene plano con mesas: la salida va a caja.</p>
                  ) : (
                    <div role="radiogroup" aria-label="Mesa" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
                      {opcionesDeMesa.map((o) => {
                        const elegida = o.clave === mesaElegida;
                        return (
                          <button
                            key={o.clave}
                            type="button"
                            role="radio"
                            aria-checked={elegida}
                            onClick={() => setMesaElegida(o.clave)}
                            className={cn(
                              "flex min-h-12 flex-col items-center justify-center rounded-[var(--radius-control)] border px-2 py-1 text-center",
                              elegida ? "border-brand bg-brand/15 text-ink" : "border-line bg-base/40 text-ink-2",
                            )}
                          >
                            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                              <HandPlatter size={14} aria-hidden="true" />
                              Mesa {o.mesa}
                            </span>
                            {o.familia && <span className="text-[11.5px] leading-tight break-words">{o.familia}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}

            <Button
              data-recorrido="salida-registrar"
              surface="pos"
              variant="primary"
              disabled={!hayAlgo || enviando || faltaRecogida || deMesa.mezcla || (destino === "MESA" && !opcionElegida)}
              onClick={() => void confirmarSalida()}
              className="w-full"
            >
              <Wallet size={17} aria-hidden="true" />
              {enviando
                ? "Registrando la salida…"
                : opcionVinculada
                ? `Registrar salida a la mesa ${opcionVinculada.mesa}`
                : porCobrar.length === 0
                ? "Registrar salida sin cargo"
                : destino === "MESA"
                  ? `Cargar ${formatMoneyVE(toMajor(aCobrar), "USD")} a ${etiquetaDeMesa ? `la mesa ${etiquetaDeMesa}` : "una mesa"}`
                  : porCobrar.length === 1
                    ? (puedeCobrar ? `Cobrar ${formatMoneyVE(toMajor(aCobrar), "USD")} en caja` : `Enviar ${formatMoneyVE(toMajor(aCobrar), "USD")} a caja`)
                    : `Enviar ${porCobrar.length} cuentas a caja`}
            </Button>

            {hayAlgo && faltaRecogida && !enviando && (
              <p className="text-center text-[12px] text-ink-3">Falta marcar a quién se entrega</p>
            )}

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

/**
 * A quién se entrega (D9): el representante registrado u otra persona. Dos botones grandes y, con
 * «otra persona», su nombre. Color + texto: la elección se lee sin depender del color (§8.2).
 */
function Recogida({
  representante,
  valor,
  onCambio,
}: {
  representante: string;
  valor: { kind: "REPRESENTANTE" } | { kind: "OTRA_PERSONA"; nombre: string } | null;
  onCambio: (v: { kind: "REPRESENTANTE" } | { kind: "OTRA_PERSONA"; nombre: string }) => void;
}) {
  const opcion = (activo: boolean) =>
    `flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border px-2 text-[12.5px] font-semibold transition-colors ${
      activo ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:text-ink"
    }`;
  return (
    <fieldset className="mt-2.5 flex flex-col gap-1.5">
      <legend className="mb-1 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Lo recoge</legend>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" aria-pressed={valor?.kind === "REPRESENTANTE"} onClick={() => onCambio({ kind: "REPRESENTANTE" })} className={opcion(valor?.kind === "REPRESENTANTE")}>
          <span className="truncate">{representante}</span>
        </button>
        <button
          type="button"
          aria-pressed={valor?.kind === "OTRA_PERSONA"}
          onClick={() => onCambio({ kind: "OTRA_PERSONA", nombre: valor?.kind === "OTRA_PERSONA" ? valor.nombre : "" })}
          className={opcion(valor?.kind === "OTRA_PERSONA")}
        >
          Otra persona
        </button>
      </div>
      {valor?.kind === "OTRA_PERSONA" && (
        <input
          aria-label="Nombre de quien lo recoge"
          value={valor.nombre}
          onChange={(e) => onCambio({ kind: "OTRA_PERSONA", nombre: e.target.value })}
          placeholder="Nombre y parentesco"
          autoComplete="off"
          maxLength={80}
          className="min-h-12 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[13px] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand"
        />
      )}
    </fieldset>
  );
}
