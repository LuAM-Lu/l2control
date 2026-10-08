"use client";

import { useEffect, useRef } from "react";
import { HandHeart, ScanLine, TriangleAlert } from "lucide-react";
import type { CatalogoDto, FamilyAccountDto } from "@l2/contracts";
import { Button, EmptyState, ScannerField, Sheet, avisar, cn } from "@l2/ui";
import { CampoRepresentante, FilaDeEntrada, NinosDeLaFamilia, TotalDeEntrada } from "../park/EntradaPiezas.tsx";
import { useEntradaDeNinos } from "../park/useEntradaDeNinos.ts";

/**
 * La entrada al parque desde la caja — B3-9 (M-31).
 *
 * Una familia que llega directo a la caja a comprar la entrada de uno o varios niños se registra y se cobra sin salir de
 * ella: un panel lateral con lo mismo que Entrada (la pulsera leída o tecleada, «Sin pulsera», el paquete más común ya
 * elegido, las medias y el teléfono del representante) y el mismo registro del servidor (aforo, pulsera de un solo uso,
 * tarifario; la monitora los ve en la sala). «Registrar y cobrar» deja la cuenta elegida en la columna de cobro.
 *
 * Solo prepago: los invitados de un cumpleaños, la cuenta abierta y la carga desde papel siguen en Entrada.
 */
export function EntradaDesdeCaja({
  abierto,
  pedido,
  catalogo,
  conTurno,
  onCerrar,
  onRegistrada,
}: {
  abierto: boolean;
  /** La pulsera que abrió el panel (una que no está en la sala), con su número de pedido: se suma una vez. */
  pedido: Readonly<{ codigo: string | null; n: number }> | null;
  catalogo: CatalogoDto;
  /** Sin turno abierto en este equipo no se cobra: el panel lo dice y no registra. */
  conTurno: boolean;
  onCerrar: () => void;
  onRegistrada: (cuenta: FamilyAccountDto) => void;
}) {
  const telefonoRef = useRef<HTMLInputElement>(null);
  const e = useEntradaDeNinos({ catalogo, alPrimeraPulsera: () => telefonoRef.current?.focus() });
  const { entradas, capacidad, capacityLimit, medias, encontrado, aviso, enviando } = e;

  // La pulsera que abrió el panel se suma una sola vez (en desarrollo, React repite los efectos).
  const usado = useRef<number | null>(null);
  useEffect(() => {
    if (!abierto || !pedido || usado.current === pedido.n) return;
    usado.current = pedido.n;
    if (pedido.codigo) e.agregarPulsera(pedido.codigo);
  }, [abierto, pedido, e]);

  const cerrar = () => {
    e.limpiar();
    onCerrar();
  };

  async function registrar() {
    const r = await e.registrar("PREPAGO");
    if (!r) return;
    const n = r.sessions.length;
    avisar.ok(`${n === 1 ? "Entró 1 niño" : `Entraron ${n} niños`}: ${r.cuenta.family}`, { detalle: "Su cuenta está lista para cobrar." });
    onRegistrada(r.cuenta);
  }

  const sinTurno = !conTurno;
  const porQueNo = sinTurno && entradas.length > 0 ? "Sin turno abierto en este equipo: ábrelo en Turno para cobrar" : e.porQueNo;

  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Entrada al parque"
      descripcion="Registra a los niños y cobra su entrada sin salir de la caja. Se paga ahora: la cuenta abierta y los invitados de un cumpleaños, en Entrada."
      pie={
        e.publicado ? (
          <div className="flex flex-col gap-3">
            <TotalDeEntrada total={e.total} ninos={entradas.length} medias={medias} paresQueFaltan={e.paresQueFaltan} sinMediasQueDar={e.sinMediasQueDar} />
            <Button surface="pos" variant="primary" className="w-full" disabled={!e.puedeEnviar || sinTurno} onClick={() => void registrar()}>
              {enviando ? "Registrando…" : "Registrar y cobrar"}
            </Button>
            {porQueNo && <p className="text-center text-[12px] text-ink-3">{porQueNo}</p>}
          </div>
        ) : undefined
      }
    >
      {/* Solo abierto: su lector es el que recibe las pulseras mientras tanto; al cerrarse, vuelve a la cola. */}
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

            <div className="flex items-stretch gap-2">
              <ScannerField onScan={(c) => void e.agregarPulsera(c)} validate={e.validarPulsera} placeholder="Pasa la pulsera de cada niño…" className="min-w-0 flex-1" />
              <Button surface="tablet" variant="neutral" className="shrink-0 gap-1.5" onClick={() => void e.anadirSinPulsera()} aria-label="Añadir un niño sin pulsera">
                <HandHeart size={18} aria-hidden="true" />
                <span className="max-sm:hidden">Sin pulsera</span>
              </Button>
            </div>

            {aviso && (
              <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn">
                <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                {aviso}
              </p>
            )}

            {entradas.length === 0 ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-4 text-[13px] text-ink-3">
                <ScanLine size={18} className="shrink-0" aria-hidden="true" />
                Pasa la pulsera de cada niño. Si el lector no la lee, «Escribir» su número; un niño que no tolera la pulsera, «Sin pulsera».
              </p>
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
                    onActualizar={(patch) => e.actualizar(x.uid, patch)}
                    onQuitar={() => e.quitar(x.uid)}
                  />
                ))}
              </ul>
            )}

            <section aria-label="Representante" className="flex flex-col gap-4 border-t border-line pt-4">
              <h3 className="font-display text-tarjeta font-bold text-ink">Representante</h3>
              <CampoRepresentante
                telefono={e.telefono}
                onTelefono={e.setTelefono}
                telefonoRef={telefonoRef}
                encontrado={encontrado}
                esNuevo={e.esNuevo}
                nombreNuevo={e.nombreNuevo}
                onNombreNuevo={e.setNombreNuevo}
              />
            </section>
          </div>
        ))}
    </Sheet>
  );
}
