"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Printer, TriangleAlert, UserRoundSearch } from "lucide-react";
import type { ValeDto, ValesDelPersonalDto } from "@l2/contracts";
import { periodoPredefinido } from "@l2/domain-cash";
import { Button, Container, FiltroSegmentado, MoneyDisplay, TAMANO_ICONO, avisar, cn } from "@l2/ui";
import { toMajor, money } from "@l2/domain-money";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { ValesPedidos } from "../reportes/reportes.servidor.ts";
import { TablaDeInforme, periodoEnPalabras } from "../reportes/informe.tsx";
import { direccionDelPersonal, ordenDelVale, seccionesDelPersonal } from "../reportes/personal.tsx";
import { PersonaYPin, usePersonasDelLocal } from "./ConsumoDelPersonal.tsx";
import { reimprimirVale, valesDelPersonal } from "./personal.acciones";

/**
 * Caja → Personal — B3-17 (M-37). Los vales del consumo del personal de la quincena: lo de cada persona y cada vale, con
 * «Reimprimir vale». Supervisión y administración ven los de todos; cada persona ve los suyos con su PIN, aquí mismo, y
 * al terminar se cierran (nadie más los ve en la pantalla). El descuento del sueldo se hace fuera del sistema.
 */

const RUTA = "/personal";
type Quincena = "QUINCENA" | "QUINCENA_ANTERIOR";

export function PersonalScreen({ hoy, pedido, informe }: ValesPedidos) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (q: Quincena) => iniciar(() => router.push(direccionDelPersonal(RUTA, periodoPredefinido(q, hoy)) as Route));
  const todos = informe.ok ? informe.valor : null;
  // Los de todos se releen cuando se cobra, se anula o se devuelve algo; los de una persona, no: pedirían su PIN.
  useAlCambiar(["ventas"], () => {
    if (todos) router.refresh();
  });
  const elegida: Quincena | "RANGO" = (["QUINCENA", "QUINCENA_ANTERIOR"] as const).find((q) => {
    const p = periodoPredefinido(q, hoy);
    return p.desde === pedido.desde && p.hasta === pedido.hasta;
  }) ?? "RANGO";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="muro" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 apaisado:bajo:py-2">
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">Consumo del personal</h1>
            <p className="mt-1 text-detalle text-ink-3">
              {periodoEnPalabras(pedido)} · los vales firmados se quedan en la caja; el descuento del sueldo, fuera del sistema.
            </p>
          </div>
          <FiltroSegmentado<Quincena | "RANGO">
            etiqueta="Quincena"
            opciones={[
              { id: "QUINCENA", nombre: "Esta quincena" },
              { id: "QUINCENA_ANTERIOR", nombre: "Quincena anterior" },
            ]}
            valor={elegida}
            onCambiar={(q) => q !== "RANGO" && ir(q)}
          />
        </Container>
      </header>

      <Container as="main" ancho="muro" className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4 transition-opacity apaisado:bajo:py-3", cargando && "opacity-60")}>
        {todos ? (
          <Vales informe={todos} />
        ) : !informe.ok && informe.motivo === "NO_PERMITIDO" ? (
          <MisVales pedido={pedido} />
        ) : (
          <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
            <TriangleAlert size={TAMANO_ICONO.texto} aria-hidden="true" />
            {informe.ok ? "" : (informe.problemas?.[0]?.message ?? informe.mensaje)}
          </p>
        )}
      </Container>
    </div>
  );
}

/** «Reimprimir vale»: sale como copia en la impresora de recibos. */
function Reimprimir({ v }: { v: ValeDto }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Button
      surface="tablet"
      variant="ghost"
      className="gap-1.5 px-2 text-detalle whitespace-nowrap"
      disabled={enviando}
      onClick={async () => {
        setEnviando(true);
        const r = await reimprimirVale({ valeId: v.id }).catch(() => null);
        setEnviando(false);
        if (r?.ok) avisar.ok(`Vale ${ordenDelVale(v.orderNumber)} a la impresora`, { detalle: `Copia del vale de ${v.persona.nombre}` });
        else avisar.error(r?.mensaje ?? "Sin conexión con el servidor: el vale no se reimprimió.");
      }}
    >
      <Printer size={TAMANO_ICONO.texto} aria-hidden="true" />
      {enviando ? "Enviando…" : "Reimprimir vale"}
    </Button>
  );
}

function Vales({ informe }: { informe: ValesDelPersonalDto }) {
  const reloj = useReloj();
  const [personas, vales] = seccionesDelPersonal(informe, reloj, false, (v) => <Reimprimir v={v} />);
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-tarjeta font-semibold text-ink">{informe.alcance === "PERSONA" ? `Los vales de ${informe.porPersona[0]?.persona.nombre ?? "esta persona"}` : "El equipo"}</h2>
        <span className="flex items-baseline gap-2 text-detalle text-ink-2">
          Consumió
          <MoneyDisplay value={toMajor(money(BigInt(informe.total.minor), "USD"))} currency="USD" />
        </span>
      </div>
      {informe.alcance === "TODOS" && <TablaDeInforme seccion={personas!} />}
      <TablaDeInforme seccion={vales!} />
    </>
  );
}

/** Cada persona ve los suyos con su PIN; al terminar, «Listo» los quita de la pantalla. */
function MisVales({ pedido }: { pedido: { desde: string; hasta: string } }) {
  const { personas, error: errorDeLista } = usePersonasDelLocal(true);
  const [elegida, setElegida] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suyos, setSuyos] = useState<ValesDelPersonalDto | null>(null);

  async function ver() {
    if (!elegida || pin.length !== 4 || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await valesDelPersonal({ ...pedido, persona: { staffUserId: elegida, pin } }).catch(() => null);
    setEnviando(false);
    setPin("");
    if (r?.ok) setSuyos(r.valor);
    else setError(r?.mensaje ?? "Sin conexión con el servidor: no se pudieron leer los vales.");
  }

  // Cambiar de quincena con los suyos abiertos los cierra: se vuelven a pedir con el PIN.
  const clave = `${pedido.desde}|${pedido.hasta}`;
  const [eran, setEran] = useState(clave);
  if (clave !== eran) {
    setEran(clave);
    setSuyos(null);
  }

  if (suyos) {
    return (
      <>
        <Vales informe={suyos} />
        <div>
          <Button
            surface="tablet"
            variant="primary"
            onClick={() => {
              setSuyos(null);
              setElegida(null);
            }}
          >
            Listo
          </Button>
        </div>
      </>
    );
  }
  return (
    <section aria-labelledby="mis-vales" className="max-w-2xl rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <h2 id="mis-vales" className="flex items-center gap-2 text-tarjeta font-semibold text-ink">
        <UserRoundSearch size={TAMANO_ICONO.tablet} aria-hidden="true" />
        Ver mis vales
      </h2>
      <p className="mt-1 mb-3 text-detalle text-ink-3">
        Los de todos los ven supervisión y administración. Cada persona del equipo ve los suyos con su PIN.
      </p>
      <PersonaYPin
        pregunta="¿Quién eres?"
        personas={personas}
        elegida={elegida}
        onElegir={(id) => {
          setElegida(id);
          setPin("");
          setError(null);
        }}
        pin={pin}
        onPin={setPin}
        error={error}
        deshabilitado={enviando}
        onConfirmar={() => void ver()}
      />
      {errorDeLista && <p className="mt-2 text-detalle text-state-crit">{errorDeLista}</p>}
      <div className="mt-3 flex justify-end">
        <Button surface="tablet" variant="primary" disabled={!elegida || pin.length !== 4 || enviando} onClick={() => void ver()}>
          {enviando ? "Leyendo…" : "Ver mis vales"}
        </Button>
      </div>
    </section>
  );
}
