"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, HandHeart, ScanLine, Ticket, TriangleAlert } from "lucide-react";
import type { CatalogoDto, FamilyAccountDto, PaymentMode, ReservaEventoDto } from "@l2/contracts";
import { Button, Dialog, EmptyState, ScannerField, Sheet, avisar, cn } from "@l2/ui";
import { entrarInvitados } from "../eventos/eventos.acciones";
import { horario } from "../eventos/formato.ts";
import { BotonCamara, LectorCamara } from "../lector/LectorCamara";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { CampoRepresentante, FilaDeEntrada, NinosDeLaFamilia, TotalDeEntrada } from "./EntradaPiezas.tsx";
import { useEntradaDeNinos } from "./useEntradaDeNinos.ts";
import { IconoMedias } from "./IconoMedias.tsx";

/**
 * La entrada al parque en una capa — B4-12 (M-34), F5-02 a F5-04, B3-9.
 *
 * La abren el parque (una pulsera nueva leída en la sala, o «Sin pulsera») y la caja (una familia que llega directo a
 * pagar). Una sola forma para los dos: el lector de la capa es el que recibe las pulseras mientras está abierta; el
 * representante arriba, por su cédula (T-19), con «Sumar a la familia» si tiene niños en la sala; un renglón por niño en
 * escritorio (pulsera, nombre, paquete y medias) y, fijos al pie, el total y «Registrar».
 *
 * Lo que cambia según quién la abre: en el parque se elige cómo paga la familia y entran los invitados de un cumpleaños;
 * en la caja se paga ahora y sin turno no se registra (el resto, en el parque).
 */
export type PedidoDeEntrada = Readonly<{ codigo: string | null; sinPulsera?: boolean; n: number }>;

export function EntradaEnCapa({
  abierto,
  pedido,
  catalogo,
  desde,
  cumpleanos = [],
  conTurno = true,
  puedeCobrar = true,
  onCerrar,
  onRegistrada,
}: {
  abierto: boolean;
  /** Lo que abrió la capa (una pulsera leída o «sin pulsera»), con su número de pedido: se suma una vez. */
  pedido: PedidoDeEntrada | null;
  catalogo: CatalogoDto | undefined;
  desde: "PARQUE" | "CAJA";
  /** Los cumpleaños de hoy que reciben invitados (B10-2), en el parque. */
  cumpleanos?: readonly ReservaEventoDto[];
  /** En la caja: sin turno abierto en este equipo no se cobra. */
  conTurno?: boolean;
  /** Si quien registra cobra (lo lleva a la caja) o la cuenta se envía a la caja. */
  puedeCobrar?: boolean;
  onCerrar: () => void;
  /** Registrada: la caja la elige para cobrarla; el parque cierra la capa (y, en prepago, puede ir a cobrar). */
  onRegistrada: (cuenta: FamilyAccountDto, modo: PaymentMode, ninos: number) => void;
}) {
  const cedulaRef = useRef<HTMLInputElement>(null);
  const e = useEntradaDeNinos({ catalogo, alPrimeraPulsera: () => cedulaRef.current?.focus() });
  const { entradas, capacidad, capacityLimit, medias, encontrado, aviso, enviando } = e;
  const { formatoHora } = useSucursal().ajustes;
  const enCaja = desde === "CAJA";

  // DEC-21: cómo paga esta familia, en el parque. En la caja, ahora. Si se suma a su familia, como su cuenta.
  const [modoElegido, setModo] = useState<PaymentMode>("PREPAGO");
  const modo: PaymentMode = enCaja ? "PREPAGO" : e.sumarA && e.familiaEnSala ? e.familiaEnSala.mode : modoElegido;
  /** La cámara del teléfono como lector (V-2). */
  const [camara, setCamara] = useState(false);

  /** A qué entra esta tanda (B10-2): una visita normal (`null`) o un cumpleaños de hoy, por su reserva. */
  const [reservaId, setReservaId] = useState<string | null>(null);
  const cumple = enCaja ? null : (cumpleanos.find((r) => r.id === reservaId) ?? null);
  const quedan = cumple ? Math.max(0, cumple.invitados - (cumple.dia?.entraron ?? 0)) : null;

  // Lo que abrió la capa se suma una sola vez (en desarrollo, React repite los efectos).
  const usado = useRef<number | null>(null);
  useEffect(() => {
    if (!abierto || !pedido || usado.current === pedido.n) return;
    usado.current = pedido.n;
    if (pedido.codigo) e.agregarPulsera(pedido.codigo);
    else if (pedido.sinPulsera) e.anadirSinPulsera();
  }, [abierto, pedido, e]);

  const cerrar = () => {
    e.limpiar();
    setReservaId(null);
    setCamara(false);
    onCerrar();
  };

  /**
   * B4-16 (M-35): quien deja las medias apagadas las trae. Antes de registrar, una sola confirmación por todos; sin
   * medias en el inventario no se pregunta (entran sin cobrárselas).
   */
  const [confirmandoMedias, setConfirmandoMedias] = useState(false);
  function pedirRegistro() {
    if (e.mediasPorConfirmar > 0) setConfirmandoMedias(true);
    else void registrar();
  }

  async function registrar() {
    setConfirmandoMedias(false);
    const r = await e.registrar(modo);
    if (!r) return;
    setReservaId(null);
    setCamara(false);
    onRegistrada(r.cuenta, modo, r.sessions.length);
  }

  const puedeEnviarInvitados = cumple !== null && entradas.length > 0 && entradas.length <= (quedan ?? 0) && !capacidad.isFull && !enviando;

  /** Los invitados de un cumpleaños (B10-2): solo sus pulseras, a la cuenta del día; sin paquete ni cobro. */
  async function registrarInvitados() {
    if (!cumple) return;
    e.clave.current ??= globalThis.crypto.randomUUID();
    e.setEnviando(true);
    const r = await entrarInvitados({ idempotencyKey: e.clave.current, reservaId: cumple.id, pulseras: entradas.map((x) => x.wristbandCode) }).catch(() => null);
    e.setEnviando(false);
    if (!r) {
      e.setAviso("Sin conexión con el servidor: los invitados no entraron. Vuelve a intentarlo.");
      return;
    }
    e.clave.current = null;
    if (!r.ok) {
      e.setAviso(r.mensaje);
      return;
    }
    e.adoptarEstancias(r.valor.sessions);
    e.adoptarCuenta(r.valor.account);
    const n = r.valor.sessions.length;
    avisar.ok(`${n === 1 ? "Entró 1 invitado" : `Entraron ${n} invitados`} al cumpleaños de ${cumple.cumpleanero}`, {
      detalle: "Sin cobro: lo paga el paquete del cumpleaños.",
    });
    cerrar();
  }

  const sinTurno = enCaja && !conTurno;
  const porQueNo = sinTurno && entradas.length > 0 ? "Sin turno abierto en este equipo: ábrelo en Turno para cobrar" : e.porQueNo;
  const textoRegistrar = enviando
    ? "Registrando…"
    : modo === "PREPAGO"
      ? puedeCobrar
        ? "Registrar y cobrar"
        : "Registrar y enviar a caja"
      : e.sumarA
        ? "Sumar a su cuenta"
        : "Registrar y abrir cuenta";

  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Entrada al parque"
      descripcion={
        enCaja
          ? "Registra a los niños y cobra su entrada sin salir de la caja. Se paga ahora: la cuenta abierta y los invitados de un cumpleaños, en el parque."
          : "Pasa la pulsera de cada niño; la cédula del representante, lo primero."
      }
      // En escritorio, ancha: un renglón por niño (B4-12). En el teléfono sube desde abajo, como siempre.
      className="md:w-[min(58rem,100vw)]"
      pie={
        e.publicado ? (
          cumple ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-ink-3">Sin cobro: lo paga el paquete del cumpleaños. Cuentan en el aforo.</p>
              <Button surface="pos" variant="primary" disabled={!puedeEnviarInvitados} onClick={() => void registrarInvitados()} className="w-full">
                {enviando ? "Registrando…" : entradas.length > 0 ? `Registrar ${entradas.length} ${entradas.length === 1 ? "invitado" : "invitados"}` : "Registrar invitados"}
              </Button>
              {!puedeEnviarInvitados && !enviando && entradas.length > 0 && (
                <p className="text-center text-[12px] text-ink-3">
                  {capacidad.isFull ? "Aforo completo" : `Caben ${quedan} ${quedan === 1 ? "invitado" : "invitados"} más: quita las pulseras que sobran`}
                </p>
              )}
            </div>
          ) : (
            <div data-recorrido="parque-registrar" className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
              <TotalDeEntrada total={e.total} ninos={entradas.length} medias={medias} paresQueFaltan={e.paresQueFaltan} sinMedias={e.sinMedias} />
              {/* DEC-21: la familia elige cómo paga (en el parque, salvo que se sume a su cuenta). M-18 (B4-6): lo
                  pagado al entrar no se devuelve si sale antes; en cuenta abierta se cobra por lo que usó. */}
              {!enCaja && !e.sumarA && (
                <div role="radiogroup" aria-label="Cómo paga" className="grid shrink-0 grid-cols-2 gap-1.5 md:w-72">
                  {(
                    [
                      ["PREPAGO", "Pagar ahora", "Si sale antes, no se devuelve"],
                      ["CUENTA_ABIERTA", "Cuenta abierta", "Al salir, por lo que usó"],
                    ] as const
                  ).map(([valor, nombre, detalle]) => (
                    <button
                      key={valor}
                      type="button"
                      role="radio"
                      aria-checked={modo === valor}
                      title={detalle}
                      onClick={() => setModo(valor)}
                      className={cn(
                        "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 py-1.5 text-left",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        modo === valor ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:text-ink",
                      )}
                    >
                      <span className="text-[13px] font-semibold">{nombre}</span>
                      {/* En el teléfono el detalle sobra: sigue en el `title`. */}
                      <span className="text-[11px] leading-snug text-ink-3 max-md:hidden">{detalle}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex shrink-0 flex-col gap-1.5 md:w-64">
                <Button surface="pos" variant="primary" className="w-full" disabled={!e.puedeEnviar || sinTurno} onClick={pedirRegistro}>
                  {textoRegistrar}
                </Button>
                {/* §8.7: el motivo por el que un botón está deshabilitado se dice, no se deja adivinar. */}
                {porQueNo && <p className="text-center text-[12px] text-ink-3">{porQueNo}</p>}
              </div>
            </div>
          )
        ) : undefined
      }
    >
      {/* Solo abierta: su lector es el que recibe las pulseras mientras tanto; al cerrarse, vuelve a quien la abrió. */}
      {abierto &&
        (!e.publicado ? (
          <EmptyState
            icon={<TriangleAlert size={24} className="text-state-warn" aria-hidden="true" />}
            title="Todavía no hay tarifas del parque"
            hint="Sin tarifas publicadas no se registra una entrada. Administración las publica en Ajustes → Tarifas y paquetes."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="tnum flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <span className={cn("font-semibold", capacidad.isFull ? "text-state-crit" : capacidad.remaining <= 3 ? "text-state-warn" : "text-ink")}>
                Aforo {capacidad.active} / {capacityLimit}
              </span>
              <span>
                En esta entrada: <span className="font-semibold text-ink">{entradas.length}</span>
              </span>
            </p>

            {sinTurno && (
              <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn">
                <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                Este equipo no tiene turno abierto: sin turno no se cobra. Ábrelo en Caja → Turno.
              </p>
            )}

            <div data-recorrido="parque-entrada-lector" className="flex items-stretch gap-2">
              <ScannerField onScan={(c) => void e.agregarPulsera(c)} validate={e.validarPulsera} placeholder="Pasa cada pulsera…" className="min-w-0 flex-1 [&_[data-pista]]:hidden" />
              {!enCaja && <BotonCamara activa={camara} onCambiar={setCamara} />}
              {/* B4-8 (P-1): un niño que no tolera la pulsera entra sin ella, por su nombre. No en un cumpleaños: sus
                  invitados entran con la pulsera de la reserva. */}
              {!cumple && (
                <Button surface="tablet" variant="neutral" className="shrink-0 gap-1.5" onClick={() => void e.anadirSinPulsera()} aria-label="Añadir un niño sin pulsera">
                  <HandHeart size={18} aria-hidden="true" />
                  <span className="max-sm:hidden">Sin pulsera</span>
                </Button>
              )}
            </div>
            {camara && <LectorCamara onCerrar={() => setCamara(false)} className="h-[30dvh] max-h-72 shrink-0 md:h-56" />}

            {aviso && (
              <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn">
                <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                {aviso}
              </p>
            )}

            {cumpleanos.length > 0 && !enCaja && (
              <fieldset className="flex flex-col">
                <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Entran a</legend>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
                  {[null, ...cumpleanos].map((r) => (
                    <button
                      key={r?.id ?? "visita"}
                      type="button"
                      aria-pressed={reservaId === (r?.id ?? null)}
                      onClick={() => {
                        setReservaId(r?.id ?? null);
                        e.setAviso(null);
                      }}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        reservaId === (r?.id ?? null) ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:text-ink",
                      )}
                    >
                      {r ? <Cake size={16} className="shrink-0 text-brand" aria-hidden="true" /> : <Ticket size={16} className="shrink-0" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold">{r ? `Cumpleaños de ${r.cumpleanero}` : "Visita"}</span>
                        <span className="block text-[11px] text-ink-3">
                          {r ? `${horario(r.inicio, r.fin, formatoHora)} · entraron ${r.dia?.entraron ?? 0} de ${r.invitados}` : "Con su paquete y su representante"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {/* El representante, arriba (B4-12): con su cédula se reconoce a la familia y se ofrece sumarse a ella. */}
            {cumple ? (
              <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line bg-base px-3 py-2.5 text-[13px]">
                <p className="font-semibold text-ink">Cumpleaños de {cumple.cumpleanero}</p>
                <p className="text-ink-2">
                  {cumple.paquete.name} · representante: {cumple.representante.fullName}
                </p>
                <p className={cn("tnum", quedan === 0 ? "font-semibold text-state-warn" : "text-ink-2")}>
                  {quedan === 0
                    ? "Ya entraron todos los invitados reservados: quien llegue entra como visita normal."
                    : `Pueden entrar ${quedan} ${quedan === 1 ? "invitado" : "invitados"} más.`}
                </p>
              </div>
            ) : (
              <section aria-label="Representante" data-recorrido="parque-representante" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-base/30 p-4">
                <h3 className="font-display text-tarjeta font-bold text-ink">Representante</h3>
                <div className="grid gap-3 md:grid-cols-2 md:[&>*]:col-span-2 md:[&>*:nth-child(-n+2)]:col-span-1">
                  <CampoRepresentante entrada={e} cedulaRef={cedulaRef} />
                </div>
              </section>
            )}

            {entradas.length === 0 ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-4 text-[13px] text-ink-3">
                <ScanLine size={18} className="shrink-0" aria-hidden="true" />
                Pasa la pulsera de cada niño. Si el lector no la lee, «Escribir» su número; un niño que no tolera la pulsera, «Sin pulsera».
              </p>
            ) : (
              <ul
                aria-label="Niños de esta entrada"
                // En la caja, los objetivos de la caja (§8.4): 56 px.
                className={cn("flex flex-col gap-2.5", enCaja && "[&_button]:min-h-14 [&_input]:min-h-14 [&_select]:min-h-14")}
              >
                <NinosDeLaFamilia encontrado={encontrado} />
                {entradas.map((x, i) => (
                  <FilaDeEntrada
                    key={x.uid}
                    e={x}
                    numero={i + 1}
                    paquetes={e.paquetesActivos}
                    medias={medias}
                    mediasAgotadas={e.mediasAgotadas}
                    encontrado={encontrado}
                    invitadoDe={cumple?.cumpleanero ?? null}
                    onActualizar={(patch) => e.actualizar(x.uid, patch)}
                    onQuitar={() => e.quitar(x.uid)}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      {/* B4-16: una sola confirmación de las medias, por todos los que las dejan apagadas. */}
      <Dialog
        abierto={confirmandoMedias}
        onCerrar={() => setConfirmandoMedias(false)}
        titulo="¿Traen sus medias?"
        descripcion={
          e.mediasPorConfirmar === 1
            ? "Confirmo que el niño trae sus medias de seguridad."
            : `Confirmo que los ${e.mediasPorConfirmar} niños traen sus medias de seguridad.`
        }
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button surface="pos" variant="neutral" onClick={() => setConfirmandoMedias(false)}>
              Volver
            </Button>
            <Button surface="pos" variant="primary" disabled={enviando} onClick={() => void registrar()}>
              Sí, las traen
            </Button>
          </div>
        }
      >
        <p className="flex items-center gap-2 text-detalle text-ink-2">
          <IconoMedias size={18} className="shrink-0 text-ink-3" />
          Quien no las trae compra el par: vuelve y enciende «Compra medias» en su renglón.
        </p>
      </Dialog>
    </Sheet>
  );
}
