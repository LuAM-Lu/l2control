"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Plus,
  X,
  Smartphone,
  Zap,
  CreditCard,
} from "lucide-react";
import { Container, PageHeader, Button, Input, cn, avisar } from "@l2/ui";
import { useMedios } from "./MediosProvider.tsx";
import { BANCOS_VE, nombreBanco } from "./bancos.ts";

export function MediosScreen({ puedeModificar }: { puedeModificar: boolean }) {
  const { config, aplicar } = useMedios();

  /**
   * El motivo del contrato, junto al formulario que lo provocó.
   *
   * Un aviso flotante se va solo a los cuatro segundos, y quien está
   * corrigiendo un teléfono necesita leerlo mientras lo corrige.
   */
  const [errores, setErrores] = useState<Record<string, string | null>>({});
  const anotar = (donde: string, error: string | null) =>
    setErrores((prev) => ({ ...prev, [donde]: error }));

  const [pmBank, setPmBank] = useState(config.pagoMovil?.bankCode ?? "0134");
  const [pmPhone, setPmPhone] = useState(config.pagoMovil?.phone ?? "");
  const [pmDoc, setPmDoc] = useState(config.pagoMovil?.document ?? "");

  const [zelleHolder, setZelleHolder] = useState(config.zelle?.holder ?? "");
  const [zelleEmail, setZelleEmail] = useState(config.zelle?.email ?? "");

  const [termName, setTermName] = useState("");
  const [termBank, setTermBank] = useState("");

  const guardarPagoMovil = (e: React.FormEvent) => {
    e.preventDefault();
    const err = aplicar({
      kind: "DATOS_PAGO_MOVIL",
      datos: { bankCode: pmBank, phone: pmPhone, document: pmDoc },
    });
    anotar("pagoMovil", err);
    if (!err) avisar.ok("Datos de Pago Móvil guardados");
  };

  const guardarZelle = (e: React.FormEvent) => {
    e.preventDefault();
    const err = aplicar({
      kind: "DATOS_ZELLE",
      datos: { holder: zelleHolder, email: zelleEmail },
    });
    anotar("zelle", err);
    if (!err) avisar.ok("Datos de Zelle guardados");
  };

  const añadirTerminal = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `term-${Date.now()}`;
    const err = aplicar({
      kind: "AÑADIR_TERMINAL",
      terminal: { id, name: termName, bank: termBank },
    });
    anotar("terminal", err);
    if (!err) {
      setTermName("");
      setTermBank("");
      avisar.ok("Terminal añadido");
    }
  };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Caja", href: "/panel/caja" },
          { texto: "Medios de pago" },
        ]}
        titulo="Medios de pago"
        descripcion="Configura qué se puede cobrar en caja, por dónde, y los datos del local para cada medio."
      />

      <div className="mt-8 flex flex-col gap-10">
        <section
          aria-label="Catálogo de medios"
          className="flex flex-col gap-4"
        >
          <h2 className="font-display text-[15px] font-bold text-ink">
            Catálogo de medios
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {config.medios.map((m) => {
              let faltaDato = false;
              if (m.activo) {
                if (m.datos === "PAGO_MOVIL" && !config.pagoMovil)
                  faltaDato = true;
                if (m.datos === "ZELLE" && !config.zelle) faltaDato = true;
                if (m.datos === "PUNTO" && config.terminales.length === 0)
                  faltaDato = true;
              }

              return (
                <div
                  key={m.code}
                  className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-[14px] text-ink truncate">
                        {m.label}
                      </span>
                      <span className="text-[12px] text-ink-3 uppercase tracking-wider">
                        {m.currency}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-pressed={m.activo}
                        disabled={!puedeModificar}
                        onClick={() => {
                          const err = aplicar({
                            kind: "ACTIVAR",
                            code: m.code,
                            activo: true,
                          });
                          if (err) avisar.error(err);
                        }}
                        className={cn(
                          "min-h-8 rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors cursor-pointer",
                          m.activo
                            ? "border-brand bg-brand font-semibold text-on-brand"
                            : "border-line bg-surface text-ink-2 hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed",
                        )}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        aria-pressed={!m.activo}
                        disabled={!puedeModificar}
                        onClick={() => {
                          const err = aplicar({
                            kind: "ACTIVAR",
                            code: m.code,
                            activo: false,
                          });
                          if (err) avisar.error(err);
                        }}
                        className={cn(
                          "min-h-8 rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors cursor-pointer",
                          !m.activo
                            ? "border-line-strong bg-surface-2 font-semibold text-ink"
                            : "border-line bg-surface text-ink-2 hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed",
                        )}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    {m.triggersIgtf && (
                      <span className="rounded bg-line/30 px-1.5 py-0.5 text-ink-2">
                        Lleva IGTF
                      </span>
                    )}
                    {m.canGiveChange && (
                      <span className="rounded bg-line/30 px-1.5 py-0.5 text-ink-2">
                        Da vuelto
                      </span>
                    )}
                  </div>
                  {faltaDato && (
                    <div className="mt-auto flex items-center gap-1.5 rounded-[var(--radius-control)] bg-state-warn-bg/40 px-2.5 py-2 text-[12px] text-state-warn font-medium">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span>Faltan datos: la caja no lo ofrecerá.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Datos para el cliente"
          className="flex flex-col gap-4"
        >
          <h2 className="font-display text-[15px] font-bold text-ink">
            Datos para el cliente
          </h2>
          <p className="text-[13px] text-ink-3 max-w-2xl">
            La información que el cliente lee para enviar su pago. Modificar
            estos datos cambia instantáneamente lo que ven las cajeras.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center gap-2 text-ink">
                <Smartphone size={18} />
                <h3 className="font-display font-bold text-[14px]">
                  Pago Móvil
                </h3>
              </div>

              {config.pagoMovil && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/5 p-3 text-[12px]">
                  <span className="font-semibold text-ink-2 uppercase tracking-wider text-[10px]">
                    Vista previa en caja
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">
                      {nombreBanco(config.pagoMovil.bankCode)} (
                      {config.pagoMovil.bankCode})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-ink tnum">
                      {config.pagoMovil.phone}
                    </span>
                    <span className="font-bold text-ink tnum">
                      {config.pagoMovil.document}
                    </span>
                  </div>
                </div>
              )}

              <form
                onSubmit={guardarPagoMovil}
                className="flex flex-col gap-3 mt-2"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="medios-banco"
                    className="text-[13px] font-semibold text-ink-2"
                  >
                    Banco
                  </label>
                  <select
                    id="medios-banco"
                    className="flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
                    value={pmBank}
                    onChange={(e) => setPmBank(e.target.value)}
                    disabled={!puedeModificar}
                  >
                    {BANCOS_VE.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  surface="admin"
                  label="Teléfono"
                  placeholder="0414-1234567"
                  value={pmPhone}
                  onChange={(e) => setPmPhone(e.target.value)}
                  disabled={!puedeModificar}
                />
                <Input
                  surface="admin"
                  label="RIF"
                  placeholder="J-40123456-7"
                  value={pmDoc}
                  onChange={(e) => setPmDoc(e.target.value)}
                  disabled={!puedeModificar}
                />
                <AvisoDelContrato mensaje={errores["pagoMovil"] ?? null} />
                {puedeModificar && (
                  <Button
                    type="submit"
                    variant="primary"
                    surface="admin"
                    className="mt-2"
                  >
                    Guardar Pago Móvil
                  </Button>
                )}
              </form>
            </div>

            <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center gap-2 text-ink">
                <Zap size={18} />
                <h3 className="font-display font-bold text-[14px]">Zelle</h3>
              </div>

              {config.zelle && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/5 p-3 text-[12px]">
                  <span className="font-semibold text-ink-2 uppercase tracking-wider text-[10px]">
                    Vista previa en caja
                  </span>
                  <span className="font-medium text-ink">
                    {config.zelle.holder}
                  </span>
                  <span className="font-bold text-ink">
                    {config.zelle.email}
                  </span>
                </div>
              )}

              <form
                onSubmit={guardarZelle}
                className="flex flex-col gap-3 mt-2"
              >
                <Input
                  surface="admin"
                  label="Titular de la cuenta"
                  placeholder="Parque Infantil L2 C.A."
                  value={zelleHolder}
                  onChange={(e) => setZelleHolder(e.target.value)}
                  disabled={!puedeModificar}
                />
                <Input
                  surface="admin"
                  label="Correo"
                  placeholder="pagos@parquel2.com"
                  type="email"
                  value={zelleEmail}
                  onChange={(e) => setZelleEmail(e.target.value)}
                  disabled={!puedeModificar}
                />
                <AvisoDelContrato mensaje={errores["zelle"] ?? null} />
                {puedeModificar && (
                  <Button
                    type="submit"
                    variant="primary"
                    surface="admin"
                    className="mt-2"
                  >
                    Guardar Zelle
                  </Button>
                )}
              </form>
            </div>
          </div>
        </section>

        <section
          aria-label="Terminales de punto de venta"
          className="flex flex-col gap-4"
        >
          <h2 className="font-display text-[15px] font-bold text-ink">
            Terminales de punto de venta
          </h2>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="flex-1 w-full flex flex-col gap-3">
              {config.terminales.length === 0 ? (
                <p className="text-[13px] text-ink-3 border border-dashed border-line rounded-[var(--radius-control)] p-4 text-center">
                  No hay terminales configurados. No se podrá cobrar con punto
                  de venta.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {config.terminales.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] border border-line bg-surface p-3"
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard size={16} className="text-ink-3" />
                        <div className="flex flex-col">
                          <span className="font-semibold text-ink text-[13px]">
                            {t.name}
                          </span>
                          <span className="text-ink-3 text-[12px]">
                            {t.bank}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!puedeModificar}
                        onClick={() => {
                          const err = aplicar({
                            kind: "RETIRAR_TERMINAL",
                            terminalId: t.id,
                          });
                          if (err) avisar.error(err);
                        }}
                        className="p-2 text-ink-3 hover:text-state-crit hover:bg-state-crit-bg rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Retirar terminal"
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="w-full md:w-[320px] shrink-0 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <h3 className="font-display font-bold text-[13px] text-ink mb-4">
                Añadir terminal
              </h3>
              <form onSubmit={añadirTerminal} className="flex flex-col gap-3">
                <Input
                  surface="admin"
                  label="Nombre"
                  placeholder="Punto Banesco Taquilla"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  disabled={!puedeModificar}
                />
                <Input
                  surface="admin"
                  label="Banco"
                  placeholder="Banesco"
                  value={termBank}
                  onChange={(e) => setTermBank(e.target.value)}
                  disabled={!puedeModificar}
                />
                <AvisoDelContrato mensaje={errores["terminal"] ?? null} />
                {puedeModificar && (
                  <Button
                    type="submit"
                    variant="primary"
                    surface="admin"
                    className="mt-2 w-full gap-2"
                  >
                    <Plus size={15} />
                    Añadir terminal
                  </Button>
                )}
              </form>
            </div>
          </div>
        </section>
      </div>
    </Container>
  );
}

/** El motivo que devolvió el contrato, donde se ve mientras se corrige. */
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
