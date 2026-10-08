"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Cake, HandHeart, ScanLine, Ticket, TriangleAlert } from "lucide-react";
import type { PaymentMode, CatalogoDto, ReservaEventoDto } from "@l2/contracts";
import { Button, Container, EmptyState, ScannerField, ScanPrompt, StatTile, cn, avisar, formatMoneyVE } from "@l2/ui";
import { toMajor } from "@l2/domain-money";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { entrarInvitados } from "../eventos/eventos.acciones";
import { horario } from "../eventos/formato.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { BotonCamara, LectorCamara } from "../lector/LectorCamara";
import { useActorEnSesion } from "../identity/sesion.ts";
import { puedeAbrirRuta } from "../identity/visibilidad.ts";
import { CampoRepresentante, FilaDeEntrada, NinosDeLaFamilia, TotalDeEntrada } from "./EntradaPiezas.tsx";
import { useEntradaDeNinos } from "./useEntradaDeNinos.ts";

/**
 * Registro de entrada al parque — F5-02, F5-03, F5-04.
 *
 * Su criterio de aceptación es medible: **dos niños en menos de 90 segundos**,
 * cronómetro en mano y sobre hardware real. Todo el diseño sale de ahí:
 *
 *  · Se escanea primero y lo demás sigue. La pulsera crea la fila; no hay un
 *    botón «añadir niño» que haya que buscar.
 *  · El foco salta solo al teléfono tras la primera pulsera (si está vacío).
 *  · El paquete viene preseleccionado con el más común, y se cambia en un
 *    toque sobre un botón grande, no en un desplegable.
 *  · Al representante se le busca por teléfono; si ya vino, no se vuelve a
 *    teclear nada. El nombre de cada niño es **opcional** (DEC-28): se puede
 *    poner aquí mismo si hay tiempo, y si la familia ya vino se proponen sus
 *    niños conocidos; si no, se pone después desde la sala.
 *  · Una sola pantalla. Ningún diálogo, ninguna navegación intermedia.
 *
 * Desde B4-2 registra en el servidor: él abre las estancias con su hora, pone el precio del tarifario
 * vigente, comprueba el aforo y las pulseras con lo que hay de verdad en sala y abre la cuenta de la
 * familia. Lo que esta pantalla calcula (total, aforo) es un anticipo para quien atiende.
 *
 * La lógica de la entrada vive en `useEntradaDeNinos` y sus piezas en `EntradaPiezas` (B3-9): las usa también la
 * entrada desde la caja. Aquí queda la forma de esta pantalla, los cumpleaños y cómo paga la familia.
 */
export function CheckInScreen({
  cumpleanos = [],
  catalogo,
}: {
  /** Los cumpleaños de hoy que reciben invitados (B10-2): la entrada los ofrece además de la visita normal. */
  cumpleanos?: readonly ReservaEventoDto[];
  /** El catálogo, para las medias de quien no las trae (B4-9). */
  catalogo?: CatalogoDto;
} = {}) {
  const phoneRef = useRef<HTMLInputElement>(null);
  const e = useEntradaDeNinos({ catalogo, alPrimeraPulsera: () => phoneRef.current?.focus() });
  const { entradas, capacidad, capacityLimit, medias, encontrado, aviso, enviando } = e;
  const { formatoHora } = useSucursal().ajustes;
  /** A qué entra esta tanda (B10-2): una visita normal (`null`) o un cumpleaños de hoy, por su reserva. */
  const [reservaId, setReservaId] = useState<string | null>(null);
  const cumple = cumpleanos.find((r) => r.id === reservaId) ?? null;
  /** Cuántos invitados del cumpleaños elegido pueden entrar todavía: los reservados menos los que entraron. */
  const quedan = cumple ? Math.max(0, cumple.invitados - (cumple.dia?.entraron ?? 0)) : null;

  // DEC-21: cómo paga esta familia. Se elige en cada entrada.
  const [modo, setModo] = useState<PaymentMode>("PREPAGO");
  const router = useRouter();
  /**
   * En el teléfono (B4-5) la entrada va en dos pasos: las pulseras y luego la familia. En tablet y
   * escritorio se ven los dos a la vez y esto no cambia nada.
   */
  const [pasoMovil, setPasoMovil] = useState<"PULSERAS" | "FAMILIA">("PULSERAS");
  /** La cámara del teléfono como lector (V-2). */
  const [camara, setCamara] = useState(false);

  const actor = useActorEnSesion();
  const puedeCobrar = actor !== null && puedeAbrirRuta(actor, "/caja");

  const handleScan = (code: string) => {
    if (e.agregarPulsera(code)) setPasoMovil("PULSERAS");
  };

  function anadirSinPulsera() {
    if (e.anadirSinPulsera()) setPasoMovil("PULSERAS");
  }

  async function registrar() {
    const r = await e.registrar(modo);
    if (!r) return;
    setPasoMovil("PULSERAS");

    const { cuenta, sessions, total } = r;
    const n = sessions.length;
    if (modo === "PREPAGO") {
      // Prepago: el paquete se cobra ya. La caja recibe la cuenta y, al
      // cobrar, devuelve aquí para la siguiente familia (§9.10.9).
      if (puedeCobrar) {
        router.push(`/caja?cuenta=${cuenta.id}&volver=/entrada` as Route);
      } else {
        const totalConFormato = formatMoneyVE(toMajor(total), total.currency);
        avisar.ok(`Cuenta enviada a caja: ${cuenta.family}`, {
          detalle: `${n} ${n === 1 ? "niño" : "niños"} · ${totalConFormato}. Se cobra en la caja.`,
        });
      }
      return;
    }
    avisar.ok(`Cuenta abierta para ${cuenta.family}`, {
      detalle: `${n} ${n === 1 ? "niño" : "niños"}. Se cobra todo junto al salir.`,
      accion: {
        texto: "Ver en la sala",
        alPulsar: () => router.push("/monitor"),
      },
    });
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
    e.setEntradas([]);
    e.setAviso(null);
    setPasoMovil("PULSERAS");
    const n = r.valor.sessions.length;
    avisar.ok(`${n === 1 ? "Entró 1 invitado" : `Entraron ${n} invitados`} al cumpleaños de ${cumple.cumpleanero}`, {
      detalle: "Sin cobro: lo paga el paquete del cumpleaños.",
    });
    // La cuenta de invitados que entraron la vuelve a leer la página.
    router.refresh();
  }

  /* ------------------------------------------------------------ pintado */

  // Un local recién instalado no tiene tarifas (T-4): la entrada lo dice en vez de ofrecer una
  // lista de paquetes vacía. El servidor tampoco dejaría entrar a nadie sin tarifario.
  if (!e.publicado) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center p-6">
        <EmptyState
          icon={<TriangleAlert size={28} className="text-state-warn" aria-hidden="true" />}
          title="Todavía no hay tarifas del parque"
          hint="Sin tarifas publicadas no se puede registrar una entrada. Administración las publica en Panel → Ajustes → Tarifas y paquetes."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4 max-md:py-2 bajo:py-2">
          {/* En el teléfono el título lo dice la pestaña: queda para el lector de pantalla. */}
          <div className="max-md:sr-only">
            <div>
              <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">Entrada al parque</h1>
              <p className="mt-1.5 text-[13px] text-ink-3 bajo:hidden">Pasa las pulseras por el lector para empezar</p>
            </div>
          </div>

          <div className="flex items-end gap-7 max-md:w-full max-md:justify-between">
            <StatTile
              label="Aforo"
              value={capacidad.active}
              suffix={`/ ${capacityLimit}`}
              tone={capacidad.isFull ? "crit" : capacidad.remaining <= 3 ? "warn" : "idle"}
              urgent={capacidad.isFull}
            />
            <StatTile label="En esta entrada" value={entradas.length} tone="brand" />
          </div>
        </Container>
      </header>

      <Container
        as="main"
        ancho="operacion"
        className="grid min-h-0 flex-1 gap-5 py-4 max-md:grid-rows-[minmax(0,1fr)] max-md:py-3 md:grid-rows-[minmax(0,1fr)_auto] apaisado:grid-cols-[minmax(0,1fr)_360px] apaisado:grid-rows-[minmax(0,1fr)] bajo:py-3"
      >
        {/* ------------------------------------------------------ niños */}
        <section className={cn("flex min-h-0 min-w-0 flex-col gap-4 max-md:gap-3", pasoMovil === "FAMILIA" && "max-md:hidden")}>
          <div data-recorrido="entrada-lector" className="flex shrink-0 items-stretch gap-2">
            <ScannerField onScan={handleScan} validate={e.validarPulsera} placeholder="Pasa la pulsera por el lector…" className="min-w-0 flex-1" />
            <BotonCamara activa={camara} onCambiar={setCamara} />
            {/* B4-8 (P-1): un niño que no tolera la pulsera entra sin ella, por su nombre. No en un cumpleaños: sus
                invitados entran con la pulsera de la reserva. */}
            {!cumple && (
              <Button data-recorrido="entrada-sin-pulsera" surface="tablet" variant="neutral" className="shrink-0 gap-1.5" onClick={anadirSinPulsera} aria-label="Añadir un niño sin pulsera">
                <HandHeart size={18} aria-hidden="true" />
                <span className="max-sm:hidden">Sin pulsera</span>
              </Button>
            )}
          </div>

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

          <div className="-m-1 flex-1 min-h-0 overflow-y-auto p-1">
            {entradas.length === 0 ? (
              camara ? null : (
                <ScanPrompt
                  className="max-md:py-6 max-md:[&_ol]:hidden"
                  icon={<ScanLine size={40} aria-hidden="true" />}
                  titulo="Pasa la primera pulsera"
                  detalle="El lector la reconoce sin tocar la pantalla. Cada pulsera crea una fila; el nombre del niño es opcional: se puede poner aquí o después, desde la sala."
                  pasos={["Pasa las pulseras", "Elige el paquete", "Teléfono del representante", puedeCobrar ? "Registra y cobra" : "Registra y envía a caja"]}
                />
              )
            ) : (
              <ul className="flex flex-col gap-3">
                <NinosDeLaFamilia encontrado={encontrado} />
                {entradas.map((x, i) => (
                  <FilaDeEntrada
                    key={x.uid}
                    e={x}
                    numero={i + 1}
                    paquetes={e.paquetesActivos}
                    medias={medias}
                    encontrado={encontrado}
                    invitadoDe={cumple?.cumpleanero ?? null}
                    onActualizar={(patch) => e.actualizar(x.uid, patch)}
                    onQuitar={() => e.quitar(x.uid)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* En el teléfono, el paso siguiente: la familia. */}
          <Button surface="tablet" variant="primary" className="w-full shrink-0 md:hidden" disabled={entradas.length === 0} onClick={() => setPasoMovil("FAMILIA")}>
            {entradas.length === 0 ? "Pasa la primera pulsera" : `Continuar con ${entradas.length} ${entradas.length === 1 ? "niño" : "niños"}`}
            {entradas.length > 0 && <ArrowRight size={18} aria-hidden="true" />}
          </Button>
        </section>

        {/* ---------------------------------------------- representante */}
        <aside
          data-recorrido="entrada-representante"
          className={cn(
            "flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 max-md:p-4 apaisado:max-h-full apaisado:self-start bajo:gap-3 bajo:p-4",
            pasoMovil === "PULSERAS" && "max-md:hidden",
          )}
        >
          {/* En el teléfono: volver a las pulseras, con cuántas van. Fuera de lo que desplaza: con el
              teclado abierto sigue a la vista. */}
          <Button surface="tablet" variant="ghost" className="-mx-2 -mt-2 mb-2 shrink-0 self-start md:hidden" onClick={() => setPasoMovil("PULSERAS")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Pulseras ({entradas.length})
          </Button>
          <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1 bajo:gap-3">
            <div className="flex flex-col gap-4 bajo:gap-3">
              {aviso && (
                <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn md:hidden">
                  <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                  {aviso}
                </p>
              )}
              {cumpleanos.length > 0 && (
                <fieldset className="flex flex-col">
                  <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Entran a</legend>
                  <div className="grid grid-cols-1 gap-1.5">
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
                          <span className="block truncate text-[13px] font-semibold">{r ? `Cumpleaños de ${r.cumpleanero}` : "Visita"}</span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {r ? `${horario(r.inicio, r.fin, formatoHora)} · entraron ${r.dia?.entraron ?? 0} de ${r.invitados}` : "Con su paquete y su representante"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

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
                <>
                  <h2 className="font-display text-lg font-bold text-ink">Representante</h2>
                  <CampoRepresentante
                    telefono={e.telefono}
                    onTelefono={e.setTelefono}
                    telefonoRef={phoneRef}
                    encontrado={encontrado}
                    esNuevo={e.esNuevo}
                    nombreNuevo={e.nombreNuevo}
                    onNombreNuevo={e.setNombreNuevo}
                  />
                </>
              )}
            </div>
          </div>

          {/* Lo que se decide justo antes de pulsar el botón va pegado al
              botón, y fuera de lo que desplaza: en una tablet de 600 px de
              alto, «cómo paga» se quedaba medio tapado abajo. */}
          {cumple ? (
            <div className="mt-4 flex shrink-0 flex-col gap-2 border-t border-line pt-4 bajo:mt-3">
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
            <div className="mt-4 flex shrink-0 flex-col gap-4 border-t border-line pt-4 bajo:mt-3 bajo:gap-3">
              {/* DEC-21: la familia elige cómo paga. Define a dónde lleva el botón. M-18 (B4-6): lo pagado al
                  entrar no se devuelve si sale antes; en cuenta abierta se cobra por lo que usó. */}
              <fieldset className="flex flex-col">
                <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Cómo paga</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["PREPAGO", "Pagar ahora", "Si sale antes, no se devuelve"],
                      ["CUENTA_ABIERTA", "Cuenta abierta", "Al salir, por lo que usó"],
                    ] as const
                  ).map(([valor, nombre, detalle]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={modo === valor}
                      title={detalle}
                      onClick={() => setModo(valor)}
                      className={cn(
                        "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 py-2 text-left",
                        "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        modo === valor ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:text-ink",
                      )}
                    >
                      <span className="text-[13px] font-semibold">{nombre}</span>
                      {/* En pantalla baja el detalle sobra: sigue en el `title`. */}
                      <span className="text-[11px] leading-snug text-ink-3 bajo:hidden">{detalle}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-4 md:max-lg:portrait:flex-row md:max-lg:portrait:items-center md:max-lg:portrait:gap-4 bajo:gap-3">
                <TotalDeEntrada total={e.total} ninos={entradas.length} medias={medias} paresQueFaltan={e.paresQueFaltan} sinMediasQueDar={e.sinMediasQueDar} />

                <div className="flex flex-col gap-2 md:max-lg:portrait:w-1/2 md:max-lg:portrait:shrink-0">
                  <Button data-recorrido="entrada-registrar" surface="pos" variant="primary" disabled={!e.puedeEnviar} onClick={() => void registrar()} className="w-full">
                    {enviando ? "Registrando…" : modo === "PREPAGO" ? (puedeCobrar ? "Registrar y cobrar" : "Registrar y enviar a caja") : "Registrar y abrir cuenta"}
                  </Button>

                  {/* §8.7: el motivo por el que un botón está deshabilitado se dice,
                    no se deja adivinar. */}
                  {e.porQueNo && <p className="text-center text-[12px] text-ink-3">{e.porQueNo}</p>}
                </div>
              </div>
            </div>
          )}
        </aside>
      </Container>
    </div>
  );
}
