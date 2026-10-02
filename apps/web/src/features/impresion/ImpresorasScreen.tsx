"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Info, ListOrdered, Pencil, Plus, Power, Printer, Trash2, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import type { HistorialDeImpresionDto, ImpresoraDto, ImpresorasDelLocalDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Badge, Button, Cifra, Confirmacion, Container, EmptyState, PageHeader, Resumen, Tabs, avisar } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { AgenteDeImpresion } from "./AgenteDeImpresion.tsx";
import { ESTADO_DE_TRABAJO, EstadoDeImpresion, useCola } from "./ColaProvider.tsx";
import { HistorialDeImpresion, useHistorial } from "./HistorialDeImpresion.tsx";
import { ImpresoraForm, type Mandar } from "./ImpresoraForm.tsx";
import { aplicarImpresora, imprimirPrueba } from "./impresion.acciones";

/**
 * Ajustes → Impresoras (B5-2, ADR-015, ADR-026). Arriba, lo que hay que mirar: impresoras encendidas,
 * el agente, lo que no salió y lo que está en cola (cada cifra lleva a su sitio). Debajo, tres pestañas:
 * las impresoras (tarjetas; alta y edición en una hoja lateral), la cola y el historial por páginas, y
 * el agente de la laptop de caja. Cambiar algo pide confirmar identidad; una prueba, no.
 */

type Vista = "impresoras" | "cola" | "agente";

export function ImpresorasScreen({
  local,
  historial: inicial,
  worker,
  descargable,
}: {
  local: ImpresorasDelLocalDto | null;
  historial: HistorialDeImpresionDto | null;
  worker: { url: string; puerto: number };
  /** El agente empaquetado en este servidor, si lo hay. */
  descargable: { version: string; sha256: string; mb: number } | null;
}) {
  const router = useRouter();
  const conElevacion = useConElevacion();
  const actor = useActorEnSesion();
  const puede = actor ? can(actor, "catalogo.modificar") !== "DENEGADO" : false;
  const { trabajos, releer: releerCola } = useCola();
  const reloj = useReloj();
  const historial = useHistorial(inicial);
  useAlCambiar(["impresion"], () => {
    router.refresh();
    void historial.releer();
  });

  const [vista, setVista] = useState<Vista>("impresoras");
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [editando, setEditando] = useState<ImpresoraDto | null>(null);
  const [retirar, setRetirar] = useState<ImpresoraDto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);

  if (!local) {
    return (
      <Container ancho="panel" className="py-8">
        <EmptyState icon={<Printer size={20} />} title="No se pudieron leer las impresoras" hint="Vuelve a entrar o recarga la página." />
      </Container>
    );
  }

  const mandar: Mandar = async (cmd, ok) => {
    setEnviando(true);
    try {
      const r = await conElevacion(() => aplicarImpresora(cmd));
      if (!r.ok) {
        avisar.error(r.mensaje);
        return { hecho: false, problemas: r.problemas?.length ? Object.fromEntries(r.problemas.map((p) => [String(p.path.at(-1)), p.message])) : undefined };
      }
      if (r.valor.codigo) setCodigo(r.valor.codigo);
      avisar.ok(ok);
      router.refresh();
      return { hecho: true };
    } catch {
      avisar.error("No se pudo hablar con el servidor: no cambió nada.");
      return { hecho: false };
    } finally {
      setEnviando(false);
    }
  };

  async function prueba(i: ImpresoraDto) {
    const r = await imprimirPrueba({ impresoraId: i.id }).catch(() => null);
    if (!r) avisar.error("No se pudo hablar con el servidor.");
    else if (!r.ok) avisar.error(r.mensaje);
    else {
      avisar.info(`Prueba enviada a ${i.nombre}`, { detalle: "Si el agente está conectado, sale en segundos." });
      void releerCola();
      void historial.releer();
    }
  }

  const abrirHoja = (i: ImpresoraDto | null) => {
    setEditando(i);
    setHojaAbierta(true);
  };
  const verCola = (cambio: Parameters<typeof historial.cambiar>[0]) => {
    setVista("cola");
    historial.cambiar({ filtro: "TODOS", impresoraId: undefined, tipo: undefined, ...cambio });
  };

  const activas = local.impresoras.filter((i) => i.activa);
  const deRecibos = activas.find((i) => i.recibos);
  const deComandas = activas.find((i) => i.comandas);
  const vinculados = local.agentes.filter((a) => a.vinculadoEn !== null);
  const conectados = vinculados.filter((a) => a.conectado);
  const pendientes = historial.datos?.pendientes ?? { fallidos: trabajos.filter((t) => t.estado === "FALLIDO").length, enCola: 0 };

  const impresoras = (
    <div className="flex flex-col gap-3">
      {local.impresoras.length === 0 ? (
        <EmptyState
          icon={<Printer size={20} />}
          title="Todavía no hay impresoras"
          hint="Sin una impresora de recibos encendida, la caja no puede imprimir."
          action={
            puede ? (
              <Button type="button" variant="primary" surface="admin" onClick={() => abrirHoja(null)}>
                <Plus size={15} aria-hidden="true" /> Añadir impresora
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))]">
          {local.impresoras.map((i) => {
            const enLaCola = trabajos.some((t) => t.impresora.id === i.id);
            return (
              <li key={i.id} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                <div className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-content-center rounded-[var(--radius-control)] bg-surface-2 text-ink-2">
                        <Printer size={17} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-ink">{i.nombre}</span>
                        <span className="tnum block truncate text-[12px] text-ink-3">
                          {i.ip}:{i.puerto} · {i.ancho} mm
                        </span>
                      </span>
                    </span>
                    <Badge tone={i.activa ? "ok" : "idle"}>
                      <Power size={11} aria-hidden="true" /> {i.activa ? "Encendida" : "Apagada"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {i.recibos && <Badge tone="brand">Recibos y cortes</Badge>}
                    {i.comandas && <Badge tone="brand">Comandas</Badge>}
                  </div>
                  {!(i.enVlanDeHardware && i.ipFija) && (
                    <p className="flex items-center gap-1.5 text-[12px] text-state-warn">
                      <TriangleAlert size={13} aria-hidden="true" /> Falta confirmar la red para encenderla
                    </p>
                  )}
                </div>
                <div className="border-t border-line px-4 py-1">
                  {enLaCola ? (
                    <EstadoDeImpresion impresoraId={i.id} />
                  ) : (
                    <p className="flex min-h-10 items-center text-[12.5px] text-ink-3">
                      {i.ultimo ? `Lo último: ${ESTADO_DE_TRABAJO[i.ultimo.estado].texto.toLowerCase()} · ${reloj.diaYHora(Date.parse(i.ultimo.at))}` : "Todavía no ha impreso nada"}
                    </p>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line px-3 py-2">
                  {puede && (
                    <>
                      <Button type="button" variant="neutral" surface="admin" onClick={() => void prueba(i)}>
                        <Printer size={14} aria-hidden="true" /> Prueba
                      </Button>
                      <Button
                        type="button"
                        variant={i.activa ? "ghost" : "primary"}
                        surface="admin"
                        disabled={enviando}
                        onClick={() => void mandar({ kind: "ACTIVAR", impresoraId: i.id, activa: !i.activa }, i.activa ? `${i.nombre} apagada` : `${i.nombre} encendida`)}
                      >
                        {i.activa ? "Apagar" : "Encender"}
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="ghost" surface="admin" className="ml-auto" aria-label={`Historial de ${i.nombre}`} title="Lo que se mandó a esta impresora" onClick={() => verCola({ impresoraId: i.id })}>
                    <History size={14} aria-hidden="true" />
                  </Button>
                  {puede && (
                    <>
                      <Button type="button" variant="ghost" surface="admin" aria-label={`Editar ${i.nombre}`} title="Editar" onClick={() => abrirHoja(i)}>
                        <Pencil size={14} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" surface="admin" aria-label={`Retirar ${i.nombre}`} title="Retirar" onClick={() => setRetirar(i)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-start gap-1.5 text-[12.5px] text-ink-3">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        {puede
          ? "Una sola encendida para los recibos y una para las comandas. Una impresora retirada no se borra: lo que imprimió sigue en el historial."
          : "Las impresoras las configura la administración. Aquí se ve cómo va la impresión."}
      </p>
    </div>
  );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Impresoras" }]}
        titulo="Impresoras"
        descripcion="La impresora térmica del local, el agente de la laptop de caja que imprime en ella y todo lo que se mandó a imprimir."
        acciones={
          puede ? (
            <Button type="button" variant="primary" surface="admin" onClick={() => abrirHoja(null)}>
              <Plus size={15} aria-hidden="true" /> Nueva impresora
            </Button>
          ) : undefined
        }
      />

      {/* ── lo que hay que mirar; cada cifra lleva a su sitio ── */}
      <Resumen etiqueta="Resumen de la impresión">
        <Cifra
          etiqueta="Impresoras"
          icono={<Printer aria-hidden="true" />}
          tono={deRecibos ? "idle" : "warn"}
          valor={local.impresoras.length === 0 ? "Ninguna" : `${activas.length} ${activas.length === 1 ? "encendida" : "encendidas"}`}
          pie={`De ${local.impresoras.length} · ${deRecibos ? `Recibos: ${deRecibos.nombre}${deComandas ? ` · Comandas: ${deComandas.nombre}` : ""}` : "ninguna para los recibos"}`}
          activo={vista === "impresoras"}
          onClick={() => setVista("impresoras")}
        />
        <Cifra
          etiqueta="Agente"
          icono={conectados.length > 0 ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
          tono={conectados.length > 0 ? "ok" : "warn"}
          valor={conectados.length > 0 ? "Conectado" : vinculados.length > 0 ? "Sin conexión" : "Sin vincular"}
          pie={conectados.length > 0 ? conectados.map((a) => a.nombre).join(" · ") : vinculados.length > 0 ? "Lo enviado espera a que vuelva" : "Nada sale en papel"}
          activo={vista === "agente"}
          onClick={() => setVista("agente")}
        />
        <Cifra
          etiqueta="No salieron"
          icono={<TriangleAlert aria-hidden="true" />}
          tono={pendientes.fallidos > 0 ? "crit" : "idle"}
          valor={String(pendientes.fallidos)}
          pie={pendientes.fallidos > 0 ? "Reintentar o descartar" : "Todo salió"}
          activo={vista === "cola" && historial.consulta.filtro === "FALLIDOS"}
          onClick={() => verCola({ filtro: "FALLIDOS" })}
        />
        <Cifra
          etiqueta="En cola"
          icono={<ListOrdered aria-hidden="true" />}
          tono="idle"
          valor={String(pendientes.enCola)}
          pie={pendientes.enCola > 0 ? "Saliendo o esperando al agente" : "Nada esperando"}
          activo={vista === "cola" && historial.consulta.filtro === "EN_COLA"}
          onClick={() => verCola({ filtro: "EN_COLA" })}
        />
      </Resumen>

      <Tabs
        etiqueta="Impresión"
        surface="admin"
        className="mt-4 min-h-0 flex-1"
        activa={vista}
        onCambiar={(id) => setVista(id as Vista)}
        pestanas={[
          { id: "impresoras", etiqueta: "Impresoras", contador: local.impresoras.length, contenido: impresoras },
          { id: "cola", etiqueta: "Cola e historial", contenido: <HistorialDeImpresion historial={historial} impresoras={local.impresoras} /> },
          {
            id: "agente",
            etiqueta: "Agente",
            contenido: (
              <AgenteDeImpresion
                agentes={local.agentes}
                puede={puede}
                mandar={mandar}
                enviando={enviando}
                codigo={codigo}
                onCodigoListo={() => setCodigo(null)}
                worker={worker}
                descargable={descargable}
              />
            ),
          },
        ]}
      />

      <ImpresoraForm abierta={hojaAbierta} impresora={editando} onCerrar={() => setHojaAbierta(false)} mandar={mandar} enviando={enviando} />

      <Confirmacion
        abierto={retirar !== null}
        onCerrar={() => setRetirar(null)}
        titulo={`¿Retirar «${retirar?.nombre ?? ""}»?`}
        confirmar="Sí, retirar"
        peligro
        ocupado={enviando}
        onConfirmar={() => {
          const i = retirar;
          if (i) void mandar({ kind: "RETIRAR", impresoraId: i.id }, `Impresora retirada: ${i.nombre}`).then((r) => r.hecho && setRetirar(null));
        }}
      >
        <p>Deja de imprimir y lo que tenga en cola no saldrá. No se borra: lo que imprimió sigue en el historial, diciendo dónde salió.</p>
      </Confirmacion>
    </Container>
  );
}
