"use client";

import { useState } from "react";
import { AlertTriangle, CreditCard, Info, Plus, Smartphone, Trash2, Zap } from "lucide-react";
import type { MedioCommand, MediosDePagoDto, Resultado } from "@l2/contracts";
import { offerProblem } from "@l2/domain-cash";
import { Button, Container, Input, PageHeader, Sheet, Tabs, avisar, cn } from "@l2/ui";
import { useMedios } from "./MediosProvider.tsx";
import { BANCOS_VE, nombreBanco } from "./bancos.ts";

/**
 * Caja → Medios de pago (B3-2, F4-02, F4-04). Qué se cobra, con qué datos del local y por qué
 * terminales: todo en el servidor, y cada cambio pide confirmar identidad. Un medio no se borra (los
 * cobros lo citan): se apaga. Uno nuevo se añade aquí, sin desplegar, y nace apagado.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

const NOMBRE_DATOS: Readonly<Record<string, string>> = {
  PAGO_MOVIL: "referencia de Pago Móvil",
  ZELLE: "titular de Zelle",
  USDT: "TxID de USDT",
  PUNTO: "terminal y referencia",
};
const FALTA_DEL_LOCAL: Readonly<Record<string, string>> = {
  PAGO_MOVIL: "Para encenderlo faltan los datos de Pago Móvil del local.",
  ZELLE: "Para encenderlo faltan los datos de Zelle del local.",
  PUNTO: "Para encenderlo hace falta al menos un terminal.",
};

type Aplicar = (cmd: MedioCommand, que: string) => Promise<Resultado<MediosDePagoDto> | null>;

export function MediosScreen({ puedeModificar }: { puedeModificar: boolean }) {
  const { config, aplicar } = useMedios();
  const [pestana, setPestana] = useState("medios");
  /** Qué se está guardando: bloquea ese control mientras el servidor responde. */
  const [enviando, setEnviando] = useState<string | null>(null);

  const cambiar: Aplicar = async (cmd, que) => {
    setEnviando(que);
    try {
      return await aplicar(cmd);
    } catch {
      avisar.error("No se pudo hablar con el servidor. No se guardó nada.");
      return null;
    } finally {
      setEnviando(null);
    }
  };

  const cabecera = (
    <PageHeader
      migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Medios de pago" }]}
      titulo="Medios de pago"
      descripcion="Qué se cobra en caja, con qué datos del local y por qué terminales. Los cambios llegan a la caja al navegar y piden confirmar tu identidad."
    />
  );

  if (!config) {
    return (
      <Container ancho="panel" className="py-8">
        {cabecera}
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg/40 p-4 text-[13px] text-state-crit">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          No se pudieron leer los medios de pago del servidor. Vuelve a cargar la página; si sigue, el servidor no tiene su clave de
          cifrado configurada. Mientras tanto la caja no ofrece ningún medio.
        </p>
      </Container>
    );
  }

  return (
    <Container ancho="panel" className="py-8">
      {cabecera}
      <Tabs
        etiqueta="Configuración de medios de pago"
        surface="admin"
        activa={pestana}
        onCambiar={setPestana}
        pestanas={[
          {
            id: "medios",
            etiqueta: "Medios",
            contador: config.medios.filter((m) => m.activo).length,
            contenido: <Catalogo config={config} puedeModificar={puedeModificar} enviando={enviando} cambiar={cambiar} />,
          },
          {
            id: "datos",
            etiqueta: "Datos para el cliente",
            contenido: <DatosDelLocal config={config} puedeModificar={puedeModificar} enviando={enviando} cambiar={cambiar} />,
          },
          {
            id: "terminales",
            etiqueta: "Terminales",
            contador: config.terminales.length,
            contenido: <Terminales config={config} puedeModificar={puedeModificar} enviando={enviando} cambiar={cambiar} />,
          },
        ]}
      />
    </Container>
  );
}

type Parte = Readonly<{ config: MediosDePagoDto; puedeModificar: boolean; enviando: string | null; cambiar: Aplicar }>;

/* ── Medios ─────────────────────────────────────────────────────────────── */

function Catalogo({ config, puedeModificar, enviando, cambiar }: Parte) {
  const [añadiendo, setAñadiendo] = useState(false);
  const listo = { pagoMovil: config.pagoMovil !== undefined, zelle: config.zelle !== undefined, terminals: config.terminales.length };

  const encender = async (code: string, activo: boolean, label: string) => {
    const r = await cambiar({ kind: "ACTIVAR", code, activo }, `activar:${code}`);
    if (!r) return;
    if (r.ok) avisar.ok(activo ? `${label}: la caja ya lo ofrece` : `${label}: apagado`);
    else avisar.error(r.mensaje);
  };

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-3">Un medio no se borra: los cobros ya hechos lo citan. Se apaga.</p>
        {puedeModificar && (
          <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setAñadiendo(true)}>
            <Plus size={15} aria-hidden="true" />
            Añadir medio
          </Button>
        )}
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {config.medios.map((m) => {
          const falta = !m.activo && offerProblem({ active: true, dataKind: m.datos ?? null }, listo) === "FALTAN_DATOS_DEL_LOCAL";
          const ocupado = enviando === `activar:${m.code}`;
          return (
            <li key={m.code} className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5 shadow-card">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[14px] font-semibold text-ink">{m.label}</span>
                  <span className="text-[11px] font-semibold tracking-wider text-ink-3">{m.currency}</span>
                </span>
                <span className="truncate text-[12px] text-ink-3">
                  {[m.canGiveChange ? "Efectivo, da vuelto" : null, m.triggersIgtf ? "lleva IGTF" : null, m.datos ? `pide ${NOMBRE_DATOS[m.datos]}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Sin datos que pedir"}
                </span>
                {falta && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-state-warn">
                    <AlertTriangle size={12} aria-hidden="true" />
                    {FALTA_DEL_LOCAL[m.datos ?? ""]}
                  </span>
                )}
              </div>
              <div role="group" aria-label={`${m.label}: encendido o apagado`} className="flex shrink-0 gap-1">
                {[true, false].map((valor) => (
                  <button
                    key={String(valor)}
                    type="button"
                    aria-pressed={m.activo === valor}
                    disabled={!puedeModificar || ocupado || m.activo === valor}
                    onClick={() => void encender(m.code, valor, m.label)}
                    className={cn(
                      "min-h-8 rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors",
                      m.activo === valor
                        ? valor
                          ? "border-brand bg-brand font-semibold text-on-brand"
                          : "border-line-strong bg-surface-2 font-semibold text-ink"
                        : "cursor-pointer border-line bg-surface text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {valor ? "Sí" : "No"}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <MedioNuevo abierto={añadiendo} onCerrar={() => setAñadiendo(false)} enviando={enviando} cambiar={cambiar} />
    </div>
  );
}

/** «Añadir medio» (F4-02): un medio nuevo sin desplegar. Nace apagado. */
function MedioNuevo({ abierto, onCerrar, enviando, cambiar }: { abierto: boolean; onCerrar: () => void; enviando: string | null; cambiar: Aplicar }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [currency, setCurrency] = useState<"USD" | "VES" | "USDT">("VES");
  const [datos, setDatos] = useState<"" | "PAGO_MOVIL" | "ZELLE" | "USDT" | "PUNTO">("");
  const [triggersIgtf, setTriggersIgtf] = useState(false);
  const [canGiveChange, setCanGiveChange] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const limpiar = () => {
    setCode("");
    setLabel("");
    setCurrency("VES");
    setDatos("");
    setTriggersIgtf(false);
    setCanGiveChange(false);
    setErrores({});
    setGeneral(null);
  };

  const añadir = async () => {
    const r = await cambiar(
      { kind: "AÑADIR_MEDIO", medio: { code, label, currency, triggersIgtf, canGiveChange, ...(datos ? { datos } : {}) } },
      "añadir-medio",
    );
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${label.trim()} añadido, apagado: enciéndelo cuando esté listo`);
      limpiar();
      onCerrar();
      return;
    }
    const porCampo: Record<string, string> = {};
    for (const p of r.problemas ?? []) {
      const campo = String(p.path.at(-1) ?? "");
      if (["code", "label", "currency", "datos", "canGiveChange"].includes(campo)) porCampo[campo] ??= p.message;
    }
    setErrores(porCampo);
    setGeneral(Object.keys(porCampo).length === 0 ? r.mensaje : null);
  };

  const ocupado = enviando === "añadir-medio";
  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Añadir un medio de pago"
      descripcion="Nace apagado. Lo que lo define (código, moneda, si es efectivo y qué datos pide) no cambia después: los cobros lo citan."
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" onClick={() => void añadir()} disabled={ocupado || !code || !label}>
            {ocupado ? "Guardando…" : "Añadir medio"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          surface="admin"
          label="Nombre en la caja"
          placeholder="Biopago"
          autoComplete="off"
          value={label}
          error={errores["label"]}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          surface="admin"
          label="Código"
          placeholder="BIOPAGO"
          autoComplete="off"
          value={code}
          error={errores["code"]}
          hint="En mayúsculas y sin espacios. Es fijo: lo citan los cobros."
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_"))}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="medio-moneda" className={ETIQUETA}>
              Moneda
            </label>
            <select id="medio-moneda" className={CAMPO} value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
              <option value="VES">Bolívares</option>
              <option value="USD">Dólares</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="medio-datos" className={ETIQUETA}>
              Datos que pide
            </label>
            <select id="medio-datos" className={CAMPO} value={datos} onChange={(e) => setDatos(e.target.value as typeof datos)}>
              <option value="">Ninguno</option>
              <option value="PAGO_MOVIL">Referencia de Pago Móvil</option>
              <option value="PUNTO">Terminal y referencia</option>
              <option value="ZELLE">Titular de Zelle</option>
              <option value="USDT">TxID de USDT</option>
            </select>
            {errores["datos"] && <p className="text-[12px] font-medium text-state-crit">{errores["datos"]}</p>}
          </div>
        </div>
        <Casilla id="medio-igtf" marcada={triggersIgtf} onCambiar={setTriggersIgtf} texto="Lleva IGTF" detalle="Divisas y cripto, según la norma vigente." />
        <Casilla
          id="medio-vuelto"
          marcada={canGiveChange}
          onCambiar={setCanGiveChange}
          texto="Es efectivo de la gaveta"
          detalle="Da vuelto y se cuenta en el arqueo. No pide datos."
          error={errores["canGiveChange"]}
        />
        {general && <AvisoDelContrato mensaje={general} />}
      </div>
    </Sheet>
  );
}

function Casilla({ id, marcada, onCambiar, texto, detalle, error }: { id: string; marcada: boolean; onCambiar: (v: boolean) => void; texto: string; detalle: string; error?: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2">
        <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={marcada} onChange={(e) => onCambiar(e.target.checked)} />
        <span className="flex flex-col">
          <span className="text-[13.5px] font-semibold text-ink">{texto}</span>
          <span className="text-[12px] text-ink-3">{detalle}</span>
        </span>
      </label>
      {error && <p className="text-[12px] font-medium text-state-crit">{error}</p>}
    </div>
  );
}

/* ── Datos para el cliente ──────────────────────────────────────────────── */

function DatosDelLocal({ config, puedeModificar, enviando, cambiar }: Parte) {
  const [pmBank, setPmBank] = useState(config.pagoMovil?.bankCode ?? "0134");
  const [pmPhone, setPmPhone] = useState(config.pagoMovil?.phone ?? "");
  const [pmDoc, setPmDoc] = useState(config.pagoMovil?.document ?? "");
  const [zelleHolder, setZelleHolder] = useState(config.zelle?.holder ?? "");
  const [zelleEmail, setZelleEmail] = useState(config.zelle?.email ?? "");
  const [errores, setErrores] = useState<Record<string, string | null>>({});

  const guardar = async (e: React.FormEvent, cmd: MedioCommand, donde: "pagoMovil" | "zelle", listo: string) => {
    e.preventDefault();
    const r = await cambiar(cmd, donde);
    if (!r) return;
    setErrores((prev) => ({ ...prev, [donde]: r.ok ? null : (r.problemas?.[0]?.message ?? r.mensaje) }));
    if (r.ok) avisar.ok(listo);
  };

  return (
    <div className="flex flex-col gap-3 pt-4">
      <p className="flex items-start gap-1.5 text-[13px] text-ink-3">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Lo que el cliente teclea en su banco para pagar: un dígito mal es dinero que llega a otra cuenta. Se guardan cifrados.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <form
          onSubmit={(e) => void guardar(e, { kind: "DATOS_PAGO_MOVIL", datos: { bankCode: pmBank, phone: pmPhone, document: pmDoc } }, "pagoMovil", "Datos de Pago Móvil guardados")}
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card"
        >
          <h3 className="flex items-center gap-2 font-display text-[14px] font-bold text-ink">
            <Smartphone size={16} aria-hidden="true" />
            Pago Móvil
          </h3>
          {config.pagoMovil ? (
            <p className="tnum rounded-[var(--radius-control)] border border-brand/30 bg-brand/5 px-3 py-2 text-[12.5px] text-ink">
              <span className="font-semibold">En caja:</span> {nombreBanco(config.pagoMovil.bankCode)} · {config.pagoMovil.phone} · {config.pagoMovil.document}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-3">Sin datos: la caja no ofrece Pago Móvil.</p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="medios-banco" className={ETIQUETA}>
              Banco
            </label>
            <select id="medios-banco" className={CAMPO} value={pmBank} onChange={(e) => setPmBank(e.target.value)} disabled={!puedeModificar}>
              {BANCOS_VE.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input surface="admin" label="Teléfono" placeholder="0414-1234567" value={pmPhone} onChange={(e) => setPmPhone(e.target.value)} disabled={!puedeModificar} />
            <Input surface="admin" label="RIF" placeholder="J-40123456-7" value={pmDoc} onChange={(e) => setPmDoc(e.target.value)} disabled={!puedeModificar} />
          </div>
          <AvisoDelContrato mensaje={errores["pagoMovil"] ?? null} />
          {puedeModificar && (
            <Button type="submit" variant="primary" surface="admin" disabled={enviando === "pagoMovil"}>
              {enviando === "pagoMovil" ? "Guardando…" : "Guardar Pago Móvil"}
            </Button>
          )}
        </form>

        <form
          onSubmit={(e) => void guardar(e, { kind: "DATOS_ZELLE", datos: { holder: zelleHolder, email: zelleEmail } }, "zelle", "Datos de Zelle guardados")}
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card"
        >
          <h3 className="flex items-center gap-2 font-display text-[14px] font-bold text-ink">
            <Zap size={16} aria-hidden="true" />
            Zelle
          </h3>
          {config.zelle ? (
            <p className="rounded-[var(--radius-control)] border border-brand/30 bg-brand/5 px-3 py-2 text-[12.5px] text-ink">
              <span className="font-semibold">En caja:</span> {config.zelle.holder} · {config.zelle.email}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-3">Sin datos: la caja no ofrece Zelle.</p>
          )}
          <Input surface="admin" label="Titular de la cuenta" placeholder="Inversiones Parque C.A." value={zelleHolder} onChange={(e) => setZelleHolder(e.target.value)} disabled={!puedeModificar} />
          <Input surface="admin" label="Correo" placeholder="pagos@ejemplo.com" type="email" value={zelleEmail} onChange={(e) => setZelleEmail(e.target.value)} disabled={!puedeModificar} />
          <AvisoDelContrato mensaje={errores["zelle"] ?? null} />
          {puedeModificar && (
            <Button type="submit" variant="primary" surface="admin" disabled={enviando === "zelle"}>
              {enviando === "zelle" ? "Guardando…" : "Guardar Zelle"}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

/* ── Terminales ─────────────────────────────────────────────────────────── */

function Terminales({ config, puedeModificar, enviando, cambiar }: Parte) {
  const [nombre, setNombre] = useState("");
  const [banco, setBanco] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);

  const añadir = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await cambiar({ kind: "AÑADIR_TERMINAL", terminal: { name: nombre, bank: banco } }, "terminal");
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${nombre.trim()} añadido`);
      setNombre("");
      setBanco("");
      setError(null);
    } else {
      setError(r.mensaje);
    }
  };

  const retirar = async (id: string, name: string) => {
    const r = await cambiar({ kind: "RETIRAR_TERMINAL", terminalId: id }, `retirar:${id}`);
    setRetirando(null);
    if (!r) return;
    if (r.ok) avisar.ok(`${name} retirado`);
    else avisar.error(r.mensaje);
  };

  return (
    <div className="grid gap-4 pt-4 md:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label="Terminales vigentes" className="flex min-w-0 flex-col gap-2">
        {config.terminales.length === 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line p-4 text-[13px] text-ink-3">
            <CreditCard size={16} aria-hidden="true" />
            No hay terminales: la caja no ofrece el punto de venta.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
            {config.terminales.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CreditCard size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{t.name}</span>
                    <span className="truncate text-[12px] text-ink-3">{t.bank}</span>
                  </span>
                </div>
                {puedeModificar &&
                  (retirando === t.id ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button type="button" variant="ghost" surface="admin" onClick={() => setRetirando(null)} disabled={enviando !== null}>
                        Cancelar
                      </Button>
                      <Button type="button" variant="danger" surface="admin" onClick={() => void retirar(t.id, t.name)} disabled={enviando !== null}>
                        Sí, retirar
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="ghost" surface="admin" className="shrink-0 gap-1.5" onClick={() => setRetirando(t.id)}>
                      <Trash2 size={14} aria-hidden="true" />
                      Retirar
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-ink-3">Un terminal retirado queda en el historial: los cobros dicen por cuál pasó la tarjeta.</p>
      </section>

      {puedeModificar && (
        <form onSubmit={(e) => void añadir(e)} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <h3 className="font-display text-[14px] font-bold text-ink">Añadir terminal</h3>
          <Input surface="admin" label="Nombre" placeholder="Punto Banesco Taquilla" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input surface="admin" label="Banco" placeholder="Banesco" value={banco} onChange={(e) => setBanco(e.target.value)} />
          <AvisoDelContrato mensaje={error} />
          <Button type="submit" variant="primary" surface="admin" className="gap-1.5" disabled={enviando === "terminal" || !nombre || !banco}>
            <Plus size={15} aria-hidden="true" />
            {enviando === "terminal" ? "Guardando…" : "Añadir terminal"}
          </Button>
        </form>
      )}
    </div>
  );
}

/** El motivo que devolvió el servidor, donde se ve mientras se corrige. */
function AvisoDelContrato({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg/40 px-3 py-2 text-[12.5px] text-state-crit"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      {mensaje}
    </p>
  );
}
