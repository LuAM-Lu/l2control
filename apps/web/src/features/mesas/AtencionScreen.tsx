"use client";

import { useMemo } from "react";
import { BellRing, Clock, Hourglass, Timer, TriangleAlert, UtensilsCrossed } from "lucide-react";
import { atencionDeCuentas, resumenDeEspera } from "@l2/domain-orders";
import { Badge, Cifra, Container, EmptyState, Marquesina, PageHeader, Resumen } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { esDelSalonAbierta, nombreDeCuenta } from "../cuentas/cuentas.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { usePedidos } from "./PedidosProvider.tsx";
import { paraAtender } from "./mesas.ts";

/**
 * Atención en el salón — B6-8 (M-27, P-19, D-SERV).
 *
 * Para administración: cada cuenta abierta del salón (mesa o de pie) con cuánto lleva sentada, cuánto sin pedir y
 * cuánto esperando lo que pidió, la que más pide atención primero; y el resumen del día (espera media y máxima de lo
 * servido). Esperar termina cuando el mesero marca «Servido». Los umbrales son de Ajustes → Sucursal. Se actualiza
 * sola: los pedidos y las cuentas llegan en vivo y el reloj corre cada minuto.
 */
export function AtencionScreen() {
  const { cuentas } = useCuentas();
  const { pedidos } = usePedidos();
  const { atencionSinPedirMin, atencionEsperaMin } = useSucursal().ajustes;
  const ahora = useAhoraLocal();

  const delSalon = useMemo(() => cuentas.filter((c) => (c.kind === "MESA" || c.dePie) && esDelSalonAbierta(c)), [cuentas]);
  const paraAtencion = useMemo(() => pedidos.map((p) => paraAtender(p, cuentas)), [pedidos, cuentas]);
  const filas = useMemo(
    () =>
      ahora > 0
        ? atencionDeCuentas(
            delSalon.map((c) => ({ id: c.id, abiertaEn: Date.parse(c.openedAt) })),
            paraAtencion,
            ahora,
            { sinPedirMin: atencionSinPedirMin, esperaMin: atencionEsperaMin },
          )
        : [],
    [delSalon, paraAtencion, ahora, atencionSinPedirMin, atencionEsperaMin],
  );
  const resumen = useMemo(() => resumenDeEspera(paraAtencion), [paraAtencion]);
  const porId = new Map(delSalon.map((c) => [c.id, c]));
  const alertas = filas.filter((f) => f.alerta !== null).length;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Restaurante", href: "/panel/restaurante" }, { texto: "Atención en el salón" }]}
        titulo="Atención en el salón"
        descripcion={`Cuánto lleva cada mesa sentada, sin pedir y esperando lo que pidió. Pide atención la que pasa de ${atencionSinPedirMin} min sin pedir o de ${atencionEsperaMin} min esperando; la espera termina cuando el mesero marca «Servido».`}
      />
      <div className="flex flex-col gap-5">
        <Resumen etiqueta="El salón y el día">
          <Cifra etiqueta="Piden atención" icono={<BellRing aria-hidden="true" />} tono={alertas > 0 ? "warn" : "ok"} valor={String(alertas)} pie={alertas > 0 ? "Llama a quien atiende" : "Todo atendido"} />
          <Cifra etiqueta="Cuentas en el salón" icono={<UtensilsCrossed aria-hidden="true" />} valor={String(delSalon.length)} pie="Mesas y de pie" />
          <Cifra
            etiqueta="Espera media hoy"
            icono={<Timer aria-hidden="true" />}
            tono={resumen.mediaMin !== null && resumen.mediaMin >= atencionEsperaMin ? "warn" : "idle"}
            valor={resumen.mediaMin === null ? "—" : `${resumen.mediaMin} min`}
            pie={resumen.servidos === 0 ? "Nada servido todavía" : `De ${resumen.servidos} ${resumen.servidos === 1 ? "pedido servido" : "pedidos servidos"}`}
          />
          <Cifra
            etiqueta="Espera máxima hoy"
            icono={<Hourglass aria-hidden="true" />}
            tono={resumen.maximaMin !== null && resumen.maximaMin >= atencionEsperaMin ? "warn" : "idle"}
            valor={resumen.maximaMin === null ? "—" : `${resumen.maximaMin} min`}
            pie={resumen.sinServir > 0 ? `${resumen.sinServir} sin marcar servido` : "Todo marcado"}
          />
        </Resumen>

        {filas.length === 0 ? (
          <EmptyState icon={<UtensilsCrossed size={28} aria-hidden="true" />} title="No hay nadie sentado" hint="Las cuentas del salón aparecen aquí al sentar a una familia o abrir una cuenta de pie." />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filas.map((f) => {
              const c = porId.get(f.cuentaId)!;
              return (
                <li key={f.cuentaId} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-tarjeta font-bold text-ink">{c.dePie ? "De pie" : `Mesa ${c.tableLabel ?? ""}`}</p>
                      <Marquesina className="text-detalle text-ink-2">{nombreDeCuenta(c)}</Marquesina>
                    </div>
                    {f.alerta === "ESPERANDO" ? (
                      <Badge tone="warn" icon={<TriangleAlert size={12} aria-hidden="true" />}>
                        Esperando su pedido
                      </Badge>
                    ) : f.alerta === "SIN_PEDIR" ? (
                      <Badge tone="warn" icon={<BellRing size={12} aria-hidden="true" />}>
                        Sin atender
                      </Badge>
                    ) : (
                      <Badge tone="ok">Atendida</Badge>
                    )}
                  </div>
                  <dl className="tnum grid grid-cols-3 gap-2 text-detalle">
                    <Dato etiqueta="Sentada" valor={`${f.sentadaMin} min`} />
                    <Dato etiqueta="Sin pedir" valor={f.sinPedirMin === null ? "Ya pidió" : `${f.sinPedirMin} min`} alerta={f.alerta === "SIN_PEDIR"} />
                    <Dato
                      etiqueta="Esperando"
                      valor={f.esperandoMin === null ? "Nada" : `${f.esperandoMin} min${f.pedidosSinServir > 1 ? ` · ${f.pedidosSinServir}` : ""}`}
                      alerta={f.alerta === "ESPERANDO"}
                    />
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex items-center gap-1.5 text-nota text-ink-3">
          <Clock size={12} aria-hidden="true" />
          Un pedido que nadie marca «Servido» sigue contando como esperando: si sale aquí y ya comieron, pídele al mesero que lo marque.
        </p>
      </div>
    </Container>
  );
}

function Dato({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-etiqueta font-semibold text-ink-3 uppercase">{etiqueta}</dt>
      <dd className={alerta ? "font-semibold text-state-warn" : "text-ink"}>{valor}</dd>
    </div>
  );
}
