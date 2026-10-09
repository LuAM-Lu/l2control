"use client";

import { useEffect, useState } from "react";
import { DatosImpresoraSchema, PaginaDeCodigosSchema, type AgenteDto, type ConexionImpresora, type ImpresoraCommand, type ImpresoraDto, type PaginaDeCodigosDto } from "@l2/contracts";
import { Button, Input, Sheet, cn } from "@l2/ui";

/**
 * Alta y edición de una impresora, en una hoja lateral (abajo en el teléfono): la lista queda detrás y
 * no se pierde de vista dónde se estaba. Lo que se valida aquí lo vuelve a validar el servidor.
 *
 * B5-4 (M-34): por **red** (IP y puerto, como siempre) o por **USB** en un equipo con su agente, elegida por su nombre
 * en Windows; con la página de códigos de las tildes y la impresión oscura.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
/** Las páginas de códigos, como se eligen (las mismas que compone `@l2/domain-printing`). */
const NOMBRE_DE_PAGINA: Readonly<Record<PaginaDeCodigosDto, string>> = {
  PC850: "850 (multilingüe, la de fábrica aquí)",
  PC858: "858 (la 850 con el euro)",
  WPC1252: "1252 (la de Windows)",
  PC437: "437 (la de fábrica de muchas)",
};

const CAMPO =
  "min-h-9 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type Form = {
  nombre: string;
  conexion: ConexionImpresora;
  ip: string;
  puerto: string;
  agenteId: string;
  nombreEnWindows: string;
  ancho: 58 | 80;
  pagina: PaginaDeCodigosDto;
  oscura: boolean;
  recibos: boolean;
  comandas: boolean;
  /** Comandas de barra (B6-10). */
  barra: boolean;
  enVlanDeHardware: boolean;
  ipFija: boolean;
};
const VACIO: Form = {
  nombre: "",
  conexion: "RED",
  ip: "",
  puerto: "9100",
  agenteId: "",
  nombreEnWindows: "",
  ancho: 80,
  pagina: "PC850",
  oscura: false,
  recibos: true,
  comandas: true,
  barra: true,
  enVlanDeHardware: false,
  ipFija: false,
};
const deImpresora = (i: ImpresoraDto): Form => ({
  nombre: i.nombre,
  conexion: i.conexion,
  ip: i.conexion === "RED" ? i.ip : "",
  puerto: i.conexion === "RED" ? String(i.puerto) : "9100",
  agenteId: i.agenteId ?? "",
  nombreEnWindows: i.nombreEnWindows ?? "",
  ancho: i.ancho,
  pagina: i.pagina,
  oscura: i.oscura,
  recibos: i.recibos,
  comandas: i.comandas,
  barra: i.barra,
  enVlanDeHardware: i.enVlanDeHardware,
  ipFija: i.ipFija,
});

export type Mandar = (cmd: ImpresoraCommand, ok: string) => Promise<{ hecho: boolean; problemas?: Record<string, string> | undefined }>;

export function ImpresoraForm({
  abierta,
  impresora,
  agentes,
  onProbarAcentos,
  onCerrar,
  mandar,
  enviando,
}: {
  abierta: boolean;
  /** La que se edita; `null` para una nueva. */
  impresora: ImpresoraDto | null;
  /** Los agentes vinculados: por USB, la impresora es de uno de ellos. */
  agentes: readonly AgenteDto[];
  /** Imprime la prueba de acentos de la que se edita (con lo guardado: su conexión de ahora). */
  onProbarAcentos: (i: ImpresoraDto) => void;
  onCerrar: () => void;
  mandar: Mandar;
  enviando: boolean;
}) {
  const [form, setForm] = useState<Form>(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Cada vez que se abre, empieza de lo que hay (o de cero). Por su id: si la lista se vuelve a leer
  // mientras se edita (otro equipo cambió algo), no se pierde lo que se lleva escrito.
  const id = impresora?.id ?? null;
  useEffect(() => {
    if (!abierta) return;
    setForm(impresora ? deImpresora(impresora) : { ...VACIO, agenteId: agentes.length === 1 ? agentes[0]!.id : "" });
    setErrores({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, id]);

  const agente = agentes.find((a) => a.id === form.agenteId) ?? null;
  const deWindows = agente?.impresorasDeWindows ?? null;
  const cambiar = (patch: Partial<Form>, limpiar: string[] = Object.keys(patch)) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrores((x) => ({ ...x, ...Object.fromEntries(limpiar.map((k) => [k, ""])) }));
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const datos =
      form.conexion === "RED"
        ? { ...base(form), conexion: "RED" as const, ip: form.ip, puerto: Number(form.puerto), enVlanDeHardware: form.enVlanDeHardware, ipFija: form.ipFija }
        : { ...base(form), conexion: "USB" as const, ...(form.agenteId ? { agenteId: form.agenteId } : {}), ...(form.nombreEnWindows.trim() ? { nombreEnWindows: form.nombreEnWindows } : {}) };
    const v = DatosImpresoraSchema.safeParse(datos);
    if (!v.success) {
      setErrores(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    const r = await mandar(
      impresora ? { kind: "EDITAR", impresoraId: impresora.id, datos: v.data } : { kind: "CREAR", datos: v.data },
      impresora ? `Impresora guardada: ${v.data.nombre}` : `Impresora añadida: ${v.data.nombre}. Pruébala y enciéndela.`,
    );
    if (r.hecho) onCerrar();
    else if (r.problemas) setErrores(Object.fromEntries(Object.entries(r.problemas).map(([k, m]) => [k.replace(/^datos\./, ""), m])));
  }

  const campo = (k: "nombre" | "ip" | "puerto" | "nombreEnWindows") => ({
    value: form[k],
    error: errores[k] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => cambiar({ [k]: e.target.value }),
  });
  const marca = (k: "recibos" | "comandas" | "barra" | "enVlanDeHardware" | "ipFija" | "oscura", texto: string, pista?: string) => (
    <label className="flex min-h-9 cursor-pointer items-start gap-2 text-[13px] text-ink">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={form[k]} onChange={(e) => cambiar({ [k]: e.target.checked }, ["recibos"])} />
      <span>
        {texto}
        {pista && <span className="block text-[11.5px] text-ink-3">{pista}</span>}
      </span>
    </label>
  );
  const segmento = <T extends string | number>(etiqueta: string, opciones: readonly { id: T; texto: string }[], valor: T, alElegir: (v: T) => void) => (
    <div className="flex flex-col gap-1.5">
      <span className={ETIQUETA}>{etiqueta}</span>
      <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-1.5">
        {opciones.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            onClick={() => alElegir(o.id)}
            className={cn(
              "min-h-9 cursor-pointer rounded-[var(--radius-control)] border text-[13px]",
              valor === o.id ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
            )}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
  const error = (k: string) => (errores[k] ? <p className="text-[12px] font-medium text-state-crit">{errores[k]}</p> : null);

  return (
    <Sheet
      abierto={abierta}
      onCerrar={onCerrar}
      titulo={impresora ? `Editar «${impresora.nombre}»` : "Nueva impresora"}
      descripcion={impresora ? "Los cambios valen para lo que se imprima desde ahora." : "Nace apagada: se prueba y se enciende desde la lista."}
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form="impresora-form" variant="primary" surface="admin" className="flex-1" disabled={enviando}>
            {enviando ? "Guardando…" : impresora ? "Guardar" : "Añadir impresora"}
          </Button>
        </div>
      }
    >
      <form id="impresora-form" onSubmit={guardar} className="flex flex-col gap-3">
        <Input surface="admin" label="Nombre" placeholder="Caja" autoComplete="off" maxLength={40} {...campo("nombre")} />
        {segmento<ConexionImpresora>(
          "Conectada por",
          [
            { id: "RED", texto: "Red (cable o wifi)" },
            { id: "USB", texto: "USB en un equipo" },
          ],
          form.conexion,
          (c) => cambiar({ conexion: c }, ["ip", "puerto", "agenteId", "nombreEnWindows"]),
        )}
        {form.conexion === "RED" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <Input surface="admin" label="IP en la red del local" placeholder="192.168.1.50" inputMode="decimal" autoComplete="off" {...campo("ip")} />
            <Input surface="admin" label="Puerto" inputMode="numeric" {...campo("puerto")} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="impresora-agente" className={ETIQUETA}>
                El equipo al que está enchufada
              </label>
              <select id="impresora-agente" className={CAMPO} value={form.agenteId} onChange={(e) => cambiar({ agenteId: e.target.value, nombreEnWindows: "" })}>
                <option value="">{agentes.length === 0 ? "Ningún equipo tiene el agente vinculado" : "Elige el equipo…"}</option>
                {agentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                    {a.conectado ? "" : " (desconectado)"}
                  </option>
                ))}
              </select>
              {error("agenteId")}
            </div>
            {agente && deWindows === null ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] text-state-warn">
                  El agente de «{agente.nombre}» todavía no dijo qué impresoras ve: actualízalo (pestaña Agente) o escribe el nombre tal como sale en Windows.
                </p>
                <Input surface="admin" label="Nombre en Windows" placeholder="XP-80C" autoComplete="off" maxLength={120} {...campo("nombreEnWindows")} />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="impresora-windows" className={ETIQUETA}>
                  La impresora en Windows
                </label>
                <select id="impresora-windows" className={CAMPO} value={form.nombreEnWindows} disabled={!agente} onChange={(e) => cambiar({ nombreEnWindows: e.target.value })}>
                  <option value="">{!agente ? "Elige primero el equipo" : (deWindows ?? []).length === 0 ? "Ese equipo no ve ninguna impresora" : "Elige la impresora…"}</option>
                  {/* La guardada, aunque el equipo ya no la vea: que no desaparezca al editar. */}
                  {[...new Set([...(deWindows ?? []), ...(form.nombreEnWindows ? [form.nombreEnWindows] : [])])].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {error("nombreEnWindows")}
                <p className="text-[11.5px] text-ink-3">La que se instaló con su controlador para todo el equipo; el agente la imprime en modo directo.</p>
              </div>
            )}
          </div>
        )}
        {segmento<58 | 80>(
          "Papel",
          [
            { id: 80, texto: "80 mm" },
            { id: 58, texto: "58 mm" },
          ],
          form.ancho,
          (a) => cambiar({ ancho: a }),
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="impresora-pagina" className={ETIQUETA}>
            Página de las tildes
          </label>
          <select id="impresora-pagina" className={CAMPO} value={form.pagina} onChange={(e) => cambiar({ pagina: e.target.value as PaginaDeCodigosDto })}>
            {PaginaDeCodigosSchema.options.map((p) => (
              <option key={p} value={p}>
                {NOMBRE_DE_PAGINA[p]}
              </option>
            ))}
          </select>
          {impresora ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button type="button" variant="neutral" surface="admin" onClick={() => onProbarAcentos(impresora)}>
                Imprimir la prueba de acentos
              </Button>
              <span className="text-[11.5px] text-ink-3">Sale el mismo texto con cada página, numerado: elige la que se lee bien.</span>
            </div>
          ) : (
            <p className="text-[11.5px] text-ink-3">Al añadirla, «Editar» imprime la prueba de acentos para elegir la que se lee bien.</p>
          )}
        </div>
        {marca("oscura", "Impresión oscura", "Todo en negrita y con doble pasada, para la que marca pálido")}
        <fieldset className="flex flex-col gap-0.5">
          <legend className={cn(ETIQUETA, "mb-1")}>Imprime</legend>
          {marca("recibos", "Recibos y ticket del corte")}
          {marca("comandas", "Comandas de cocina", "Lo preparado en la cocina")}
          {marca("barra", "Comandas de barra", "Bebidas y lo de nevera. Con una sola impresora, las tres marcas en ella")}
          {error("recibos")}
        </fieldset>
        {form.conexion === "RED" && (
          <fieldset className="flex flex-col gap-0.5">
            <legend className={cn(ETIQUETA, "mb-1")}>Para encenderla</legend>
            {marca("enVlanDeHardware", "Está en la red de los equipos (VLAN de hardware)", "Fuera del wifi de los clientes")}
            {marca("ipFija", "Tiene IP fija", "Reservada en el router: no cambia al reiniciarlo")}
          </fieldset>
        )}
      </form>
    </Sheet>
  );
}

/** Lo que va igual por red y por USB. */
function base(f: Form) {
  return { nombre: f.nombre, ancho: f.ancho, pagina: f.pagina, oscura: f.oscura, recibos: f.recibos, comandas: f.comandas, barra: f.barra };
}
