"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Laptop, Pencil, Power, Printer, Trash2, Wifi, WifiOff } from "lucide-react";
import { DatosImpresoraSchema, type ImpresoraCommand, type ImpresoraDto, type ImpresorasDelLocalDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Badge, Button, Container, EmptyState, Input, PageHeader, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { EstadoDeImpresion, useCola } from "./ColaProvider.tsx";
import { aplicarImpresora, imprimirPrueba } from "./impresion.acciones";

/**
 * Ajustes → Impresoras (B5-2, ADR-015, ADR-026). La impresora térmica del local (IP privada, puerto,
 * ancho y para qué sirve: recibos y cortes, comandas) y el agente de la laptop de caja que imprime en
 * ella. Una impresora nace apagada: se prueba y se enciende. Cambiar algo pide confirmar identidad; una
 * prueba, no.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";

type Form = { nombre: string; ip: string; puerto: string; ancho: 58 | 80; recibos: boolean; comandas: boolean; enVlanDeHardware: boolean; ipFija: boolean };
const VACIO: Form = { nombre: "", ip: "", puerto: "9100", ancho: 80, recibos: true, comandas: true, enVlanDeHardware: false, ipFija: false };
const deImpresora = (i: ImpresoraDto): Form => ({
  nombre: i.nombre,
  ip: i.ip,
  puerto: String(i.puerto),
  ancho: i.ancho,
  recibos: i.recibos,
  comandas: i.comandas,
  enVlanDeHardware: i.enVlanDeHardware,
  ipFija: i.ipFija,
});

export function ImpresorasScreen({ local, worker }: { local: ImpresorasDelLocalDto | null; worker: { url: string; puerto: number } }) {
  const router = useRouter();
  const conElevacion = useConElevacion();
  const actor = useActorEnSesion();
  const puede = actor ? can(actor, "catalogo.modificar") !== "DENEGADO" : false;
  const hora = useHora();
  const { trabajos, releer } = useCola();
  useAlCambiar(["impresion"], () => router.refresh());

  const [form, setForm] = useState<Form>(VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [equipo, setEquipo] = useState("Laptop de caja");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [servidor, setServidor] = useState(worker.url);
  // Sin dirección pública configurada, el worker está en esta misma máquina, en su puerto.
  useEffect(() => {
    if (!worker.url) setServidor(`${window.location.protocol}//${window.location.hostname}:${worker.puerto}`);
  }, [worker.url, worker.puerto]);

  if (!local) {
    return (
      <Container ancho="panel" className="py-8">
        <EmptyState icon={<Printer size={20} />} title="No se pudieron leer las impresoras" hint="Vuelve a entrar o recarga la página." />
      </Container>
    );
  }

  async function mandar(cmd: ImpresoraCommand, ok: string): Promise<boolean> {
    setEnviando(true);
    try {
      const r = await conElevacion(() => aplicarImpresora(cmd));
      if (!r.ok) {
        if (r.problemas?.length && (cmd.kind === "CREAR" || cmd.kind === "EDITAR")) {
          setErrores(Object.fromEntries(r.problemas.map((p) => [String(p.path.at(-1)), p.message])));
        }
        avisar.error(r.mensaje);
        return false;
      }
      if (r.valor.codigo) setCodigo(r.valor.codigo);
      avisar.ok(ok);
      router.refresh();
      return true;
    } catch {
      avisar.error("No se pudo hablar con el servidor: no cambió nada.");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const datos = { ...form, puerto: Number(form.puerto) };
    const v = DatosImpresoraSchema.safeParse(datos);
    if (!v.success) {
      setErrores(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    const hecho = await mandar(
      editando ? { kind: "EDITAR", impresoraId: editando, datos: v.data } : { kind: "CREAR", datos: v.data },
      editando ? `Impresora guardada: ${v.data.nombre}` : `Impresora añadida: ${v.data.nombre}. Pruébala y enciéndela.`,
    );
    if (hecho) {
      setForm(VACIO);
      setEditando(null);
    }
  }

  async function prueba(i: ImpresoraDto) {
    const r = await imprimirPrueba({ impresoraId: i.id }).catch(() => null);
    if (!r) avisar.error("No se pudo hablar con el servidor.");
    else if (!r.ok) avisar.error(r.mensaje);
    else {
      avisar.info(`Prueba enviada a ${i.nombre}`, { detalle: "Si el agente está conectado, sale en segundos." });
      void releer();
    }
  }

  const campo = (k: keyof Form) => ({
    value: String(form[k]),
    error: errores[k] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      setErrores((x) => ({ ...x, [k]: "" }));
    },
  });
  const marca = (k: "recibos" | "comandas" | "enVlanDeHardware" | "ipFija", texto: string, pista?: string) => (
    <label className="flex min-h-9 cursor-pointer items-start gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-brand)]"
        checked={form[k]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [k]: e.target.checked }));
          setErrores((x) => ({ ...x, recibos: "" }));
        }}
      />
      <span>
        {texto}
        {pista && <span className="block text-[11.5px] text-ink-3">{pista}</span>}
      </span>
    </label>
  );

  const recientes = trabajos.slice(0, 8);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Impresoras" }]}
        titulo="Impresoras"
        descripcion="La impresora térmica del local y el agente de la laptop de caja que imprime en ella: recibos, el ticket del corte y las comandas. Lo que no sale en papel se avisa y se reintenta."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section aria-label="Añadir o editar una impresora" className="flex min-w-0 flex-col gap-4">
          {puede ? (
            <form onSubmit={guardar} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <h2 className="font-display text-[14px] font-bold text-ink">{editando ? "Editar impresora" : "Nueva impresora"}</h2>
              <Input surface="admin" label="Nombre" placeholder="Caja" autoComplete="off" maxLength={40} {...campo("nombre")} />
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                <Input surface="admin" label="IP en la red del local" placeholder="192.168.1.50" inputMode="decimal" autoComplete="off" {...campo("ip")} />
                <Input surface="admin" label="Puerto" inputMode="numeric" {...campo("puerto")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Papel</span>
                <div role="radiogroup" aria-label="Ancho del papel" className="grid grid-cols-2 gap-1.5">
                  {([80, 58] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={form.ancho === a}
                      onClick={() => setForm((f) => ({ ...f, ancho: a }))}
                      className={cn(
                        "min-h-9 cursor-pointer rounded-[var(--radius-control)] border text-[13px]",
                        form.ancho === a ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                      )}
                    >
                      {a} mm
                    </button>
                  ))}
                </div>
              </div>
              <fieldset className="flex flex-col gap-0.5">
                <legend className={cn(ETIQUETA, "mb-1")}>Imprime</legend>
                {marca("recibos", "Recibos y ticket del corte")}
                {marca("comandas", "Comandas del restaurante", "Hoy la de caja; mañana, la de la cocina")}
                {errores.recibos && <p className="text-[12px] font-medium text-state-crit">{errores.recibos}</p>}
              </fieldset>
              <fieldset className="flex flex-col gap-0.5">
                <legend className={cn(ETIQUETA, "mb-1")}>Para encenderla</legend>
                {marca("enVlanDeHardware", "Está en la red de los equipos (VLAN de hardware)", "Fuera del wifi de los clientes")}
                {marca("ipFija", "Tiene IP fija", "Reservada en el router: no cambia al reiniciarlo")}
              </fieldset>
              <div className="flex gap-2">
                {editando && (
                  <Button
                    type="button"
                    variant="ghost"
                    surface="admin"
                    onClick={() => {
                      setEditando(null);
                      setForm(VACIO);
                      setErrores({});
                    }}
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit" variant="primary" surface="admin" className="flex-1" disabled={enviando}>
                  {enviando ? "Guardando…" : editando ? "Guardar" : "Añadir impresora"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-line bg-surface p-5 text-[13px] text-ink-2">
              Las impresoras las configura la administración. Aquí se ve cómo va la impresión.
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h2 className="font-display flex items-center gap-1.5 text-[14px] font-bold text-ink">
              <Laptop size={15} aria-hidden="true" /> Agente de impresión
            </h2>
            <p className="text-[12.5px] text-ink-2">
              Un programa en la laptop de caja recibe los trabajos del servidor y los manda a la impresora por la red del local.
            </p>
            {local.agentes.length === 0 && <p className="text-[12.5px] text-state-warn">Sin agente vinculado: nada sale en papel.</p>}
            <ul className="flex flex-col gap-1.5">
              {local.agentes.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{a.nombre}</span>
                    <span className={cn("flex items-center gap-1 text-[11.5px]", a.conectado ? "text-state-ok" : "text-ink-3")}>
                      {a.conectado ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
                      {a.vinculadoEn === null
                        ? `Esperando su código, hasta las ${hora(Date.parse(a.codigoHasta!))}`
                        : a.conectado
                          ? "Conectado"
                          : a.ultimaVez
                            ? `Sin conexión desde las ${hora(Date.parse(a.ultimaVez))}`
                            : "Sin conexión"}
                    </span>
                  </span>
                  {puede && (
                    <Button
                      type="button"
                      variant="ghost"
                      surface="admin"
                      disabled={enviando}
                      onClick={() => void mandar({ kind: "RETIRAR_AGENTE", agenteId: a.id }, `Agente retirado: ${a.nombre}`)}
                    >
                      Retirar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {codigo ? (
              <div role="status" className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-brand/40 bg-brand/8 p-3">
                <span className="text-[12px] text-ink-2">Código de un solo uso (vale 10 minutos):</span>
                <span className="tnum font-display text-2xl font-bold tracking-[0.12em] text-ink">{codigo}</span>
                <span className="text-[12px] text-ink-2">En la laptop de caja:</span>
                <code className="block break-all rounded bg-base px-2 py-1.5 text-[12px] text-ink">
                  l2-impresion vincular {servidor} {codigo}
                </code>
                <Button type="button" variant="ghost" surface="admin" onClick={() => setCodigo(null)}>
                  Listo
                </Button>
              </div>
            ) : (
              puede && (
                <div className="flex items-end gap-2">
                  <Input surface="admin" label="Nombre del equipo" value={equipo} onChange={(e) => setEquipo(e.target.value)} maxLength={40} />
                  <Button
                    type="button"
                    variant="neutral"
                    surface="admin"
                    disabled={enviando || equipo.trim().length < 2}
                    onClick={() => void mandar({ kind: "VINCULAR_AGENTE", nombre: equipo.trim() }, "Código generado")}
                  >
                    Vincular
                  </Button>
                </div>
              )
            )}
          </div>
        </section>

        <section aria-label="Impresoras del local" className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
            <h2 className="tnum border-b border-line px-4 py-2.5 text-[13px] font-bold text-ink">
              Impresoras <span className="font-medium text-ink-3">· {local.impresoras.length}</span>
            </h2>
            {local.impresoras.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-ink-3">
                <Printer size={16} aria-hidden="true" />
                Todavía no hay impresoras: los recibos no se pueden imprimir.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {local.impresoras.map((i) => (
                  <li key={i.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
                          {i.nombre}
                          <Badge tone={i.activa ? "ok" : "idle"}>
                            <Power size={11} aria-hidden="true" /> {i.activa ? "Encendida" : "Apagada"}
                          </Badge>
                          {i.recibos && <Badge tone="brand">Recibos y cortes</Badge>}
                          {i.comandas && <Badge tone="brand">Comandas</Badge>}
                        </p>
                        <p className="tnum text-[12.5px] text-ink-2">
                          {i.ip}:{i.puerto} · {i.ancho} mm
                          {!(i.enVlanDeHardware && i.ipFija) && <span className="text-state-warn"> · falta confirmar la red para encenderla</span>}
                        </p>
                      </div>
                      {puede && (
                        <div className="flex shrink-0 flex-wrap gap-1.5">
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
                          <Button
                            type="button"
                            variant="ghost"
                            surface="admin"
                            aria-label={`Editar ${i.nombre}`}
                            onClick={() => {
                              setEditando(i.id);
                              setForm(deImpresora(i));
                              setErrores({});
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </Button>
                          {retirando === i.id ? (
                            <Button type="button" variant="danger" surface="admin" disabled={enviando} onClick={() => void mandar({ kind: "RETIRAR", impresoraId: i.id }, `Impresora retirada: ${i.nombre}`).then(() => setRetirando(null))}>
                              Sí, retirar
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" surface="admin" aria-label={`Retirar ${i.nombre}`} onClick={() => setRetirando(i.id)}>
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <EstadoDeImpresion impresoraId={i.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
            <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-bold text-ink">Lo último que se mandó a imprimir</h2>
            {recientes.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-ink-3">Nada en las últimas 24 horas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {recientes.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]">
                    <span className="min-w-0 truncate text-ink">
                      {t.titulo}
                      {t.copia ? " (copia)" : ""} <span className="text-ink-3">· {t.creadoPor} · {hora(Date.parse(t.creadoEn))}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold",
                        t.estado === "CONFIRMADO" ? "text-state-ok" : t.estado === "FALLIDO" ? "text-state-crit" : "text-ink-2",
                      )}
                    >
                      {t.estado === "CONFIRMADO" ? "Impreso" : t.estado === "FALLIDO" ? "No salió" : t.estado === "ENVIADO" ? "Imprimiendo…" : "En cola"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="flex items-start justify-center gap-1.5 text-center text-[12.5px] text-ink-3">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            Una impresora retirada no se borra: lo que imprimió sigue diciendo dónde salió.
          </p>
        </section>
      </div>
    </Container>
  );
}
