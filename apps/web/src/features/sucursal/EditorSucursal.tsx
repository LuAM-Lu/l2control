"use client";

import { useState } from "react";
import { Redo2, Undo2, Save, TriangleAlert } from "lucide-react";
import { AjustesSucursalSchema, type AjustesSucursalDto } from "@l2/contracts";
import { fromMajor, toMajor } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, avisar, cn } from "@l2/ui";
import { useSucursal } from "./SucursalProvider";

type Borrador = AjustesSucursalDto;

const DIAS_SEMANA = [
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
] as const;

/** El enum no lleva tildes; la pantalla sí, que la lee una persona. */
const NOMBRE_DIA: Readonly<Record<(typeof DIAS_SEMANA)[number], string>> = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};

export function EditorSucursal() {
  const { ajustes: publicado, publicar } = useSucursal();
  const [historial, setHistorial] = useState<Borrador[]>([publicado]);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<readonly string[]>([]);

  const borrador = historial[paso]!;
  const sucio = JSON.stringify(borrador) !== JSON.stringify(publicado);

  function cambiar(siguiente: Borrador) {
    setHistorial((h) => [...h.slice(0, paso + 1), siguiente]);
    setPaso((p) => p + 1);
    setErrores([]);
  }

  function alPublicar() {
    const r = AjustesSucursalSchema.safeParse(borrador);
    if (!r.success) {
      setErrores([r.error.issues[0]?.message ?? "Error de validación"]);
      return;
    }
    publicar(r.data);
    setHistorial([r.data]);
    setPaso(0);
    setErrores([]);
    avisar.ok("Ajustes publicados", { detalle: "Los cambios ya están en servicio." });
  }

  function descartar() {
    setHistorial([publicado]);
    setPaso(0);
    setErrores([]);
  }

  // Validación en tiempo real del RIF
  const rifResult = AjustesSucursalSchema.shape.rif.safeParse(borrador.rif);
  const errorRif = !rifResult.success ? rifResult.error.issues[0]?.message : undefined;

  const maxRetenidoTexto = toMajor({ amount: BigInt(borrador.maxRetenido.minor), currency: borrador.maxRetenido.currency });
  const [maxRetenidoDraft, setMaxRetenidoDraft] = useState<string | null>(null);
  const [errorMaxRetenido, setErrorMaxRetenido] = useState<string | null>(null);

  function onChangeMaxRetenido(valor: string) {
    setMaxRetenidoDraft(valor);
    try {
      const limpio = valor.trim().replace(",", ".");
      const m = fromMajor(limpio, "USD");
      if (m.amount <= 0n) {
        setErrorMaxRetenido("El umbral de residuo tiene que ser mayor que cero");
      } else {
        setErrorMaxRetenido(null);
      }
    } catch {
      setErrorMaxRetenido("Escribe el monto en dólares, por ejemplo 0,50");
    }
  }

  function onBlurMaxRetenido() {
    if (maxRetenidoDraft === null) return;
    try {
      const limpio = maxRetenidoDraft.trim().replace(",", ".");
      const m = fromMajor(limpio, "USD");
      if (m.amount > 0n) {
        cambiar({ ...borrador, maxRetenido: { minor: String(m.amount), currency: "USD" } });
      }
    } catch {
      // Si está roto, no se guarda, el error queda visible
    }
  }

  function toggleServicio(activo: boolean) {
    cambiar({
      ...borrador,
      servicio: activo ? { kind: "SUGERIDO", basisPoints: 1000 } : { kind: "SIN_SERVICIO" },
    });
  }

  function onChangeServicioPorcentaje(valorStr: string) {
    if (borrador.servicio.kind !== "SUGERIDO") return;
    const entero = parseInt(valorStr, 10);
    if (!isNaN(entero) && entero >= 1 && entero <= 30) {
      cambiar({ ...borrador, servicio: { kind: "SUGERIDO", basisPoints: entero * 100 } });
    }
  }

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Configuración", href: "/panel/configuracion" },
          { texto: "Sucursal" },
        ]}
        titulo="Sucursal"
        descripcion="Los datos de la empresa, el horario y las políticas de cobro del local."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Button surface="admin" variant="ghost" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
              <Undo2 size={15} aria-hidden="true" />
              Deshacer
            </Button>
            <Button
              surface="admin"
              variant="ghost"
              onClick={() => setPaso((p) => Math.min(historial.length - 1, p + 1))}
              disabled={paso >= historial.length - 1}
            >
              <Redo2 size={15} aria-hidden="true" />
              Rehacer
            </Button>
            <Button surface="admin" variant="ghost" onClick={descartar} disabled={!sucio}>
              Descartar cambios
            </Button>
            <Button surface="admin" variant="primary" onClick={alPublicar} disabled={!sucio}>
              <Save size={15} aria-hidden="true" />
              Publicar
            </Button>
          </div>
        }
      />

      {errores.length > 0 && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {errores[0]}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {/* === El local === */}
        <section aria-label="El local">
          <h2 className="font-display mb-3 text-lg font-bold text-ink">El local</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre"
              surface="admin"
              value={borrador.nombre}
              onChange={(e) => cambiar({ ...borrador, nombre: e.target.value })}
            />
            <Input
              label="RIF"
              surface="admin"
              value={borrador.rif}
              error={errorRif}
              onChange={(e) => cambiar({ ...borrador, rif: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Dirección fiscal"
                surface="admin"
                value={borrador.direccionFiscal}
                onChange={(e) => cambiar({ ...borrador, direccionFiscal: e.target.value })}
              />
            </div>
            <Input
              label="Teléfono (opcional)"
              surface="admin"
              value={borrador.telefono ?? ""}
              onChange={(e) => cambiar({ ...borrador, telefono: e.target.value || undefined })}
            />
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">Moneda funcional</p>
              <div className="min-h-8 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-ink-2 opacity-70">
                Dólar estadounidense (USD)
              </div>
              <p className="mt-1 text-[12px] text-ink-3">Cambiarla es una decisión del plan (DEC-2), no un ajuste.</p>
            </div>
          </div>
        </section>

        {/* === Horario === */}
        <section aria-label="Horario" className="border-t border-line pt-6">
          <h2 className="font-display mb-3 text-lg font-bold text-ink">Horario</h2>
          <div className="flex flex-col gap-2">
            {DIAS_SEMANA.map((dia) => {
              const h = borrador.horario.find((x) => x.dia === dia) ?? { dia, kind: "CERRADO" };
              const abierto = h.kind === "ABIERTO";
              
              // Validación del día actual para mostrar error inline
              const rDia = AjustesSucursalSchema.shape.horario.element.safeParse(h);
              const errorDia = !rDia.success ? rDia.error.issues[0]?.message : undefined;

              return (
                <div key={dia} className="flex flex-wrap items-start gap-4 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3">
                  <div className="flex w-32 shrink-0 items-center gap-2 pt-1">
                    <span className="text-[13px] font-semibold text-ink">{NOMBRE_DIA[dia]}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-pressed={abierto}
                          onClick={() => cambiar({
                            ...borrador,
                            horario: borrador.horario.map((x) => x.dia === dia ? { dia, kind: "ABIERTO", abre: "10:00", cierra: "20:00" } : x),
                          })}
                          className={cn(
                            "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                            abierto
                              ? "border-brand bg-brand font-semibold text-on-brand"
                              : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          )}
                        >
                          Abierto
                        </button>
                        <button
                          type="button"
                          aria-pressed={!abierto}
                          onClick={() => cambiar({
                            ...borrador,
                            horario: borrador.horario.map((x) => x.dia === dia ? { dia, kind: "CERRADO" } : x),
                          })}
                          className={cn(
                            "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                            !abierto
                              ? "border-line-strong bg-surface-2 font-semibold text-ink"
                              : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          )}
                        >
                          Cerrado
                        </button>
                      </div>
                      
                      {abierto && (
                        <div className="flex items-center gap-2">
                          <Input
                            label="Abre"
                            surface="admin"
                            type="time"
                            value={h.abre}
                            onChange={(e) => cambiar({
                              ...borrador,
                              horario: borrador.horario.map((x) => x.dia === dia ? { ...x, kind: "ABIERTO", abre: e.target.value, cierra: x.kind === "ABIERTO" ? x.cierra : "20:00" } : x),
                            })}
                          />
                          <span className="text-[13px] text-ink-3 mt-5">a</span>
                          <Input
                            label="Cierra"
                            surface="admin"
                            type="time"
                            value={h.cierra}
                            onChange={(e) => cambiar({
                              ...borrador,
                              horario: borrador.horario.map((x) => x.dia === dia ? { ...x, kind: "ABIERTO", abre: x.kind === "ABIERTO" ? x.abre : "10:00", cierra: e.target.value } : x),
                            })}
                          />
                        </div>
                      )}
                    </div>
                    {errorDia && (
                      <p className="flex items-center gap-1.5 text-[12px] text-state-crit">
                        <TriangleAlert size={12} aria-hidden="true" />
                        {errorDia}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* === Formato de hora === */}
        <section aria-label="Formato de hora" className="border-t border-line pt-6">
          <h2 className="font-display mb-3 text-lg font-bold text-ink">Formato de hora</h2>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={borrador.formatoHora === "12h"}
                onClick={() => cambiar({ ...borrador, formatoHora: "12h" })}
                className={cn(
                  "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                  borrador.formatoHora === "12h"
                    ? "border-brand bg-brand font-semibold text-on-brand"
                    : "border-line bg-surface text-ink-2 hover:text-ink"
                )}
              >
                12 horas (2:00 pm)
              </button>
              <button
                type="button"
                aria-pressed={borrador.formatoHora === "24h"}
                onClick={() => cambiar({ ...borrador, formatoHora: "24h" })}
                className={cn(
                  "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                  borrador.formatoHora === "24h"
                    ? "border-brand bg-brand font-semibold text-on-brand"
                    : "border-line bg-surface text-ink-2 hover:text-ink"
                )}
              >
                24 horas (14:00)
              </button>
            </div>
            <p className="text-[12px] text-ink-3">Este formato aplica a todas las pantallas, incluyendo el monitor del parque y la caja.</p>
          </div>
        </section>

        {/* === Caja === */}
        <section aria-label="Caja" className="border-t border-line pt-6">
          <h2 className="font-display mb-3 text-lg font-bold text-ink">Caja</h2>
          <div className="max-w-xs">
            <Input
              label="Residuo máximo (USD)"
              surface="admin"
              type="text"
              inputMode="decimal"
              value={maxRetenidoDraft ?? maxRetenidoTexto}
              error={errorMaxRetenido ?? undefined}
              onChange={(e) => onChangeMaxRetenido(e.target.value)}
              onBlur={onBlurMaxRetenido}
              hint="Lo máximo que la caja puede quedarse cuando no hay vuelto exacto."
            />
          </div>
        </section>

        {/* === Servicio y propina === */}
        <section aria-label="Servicio y propina" className="border-t border-line pt-6">
          <h2 className="font-display mb-3 text-lg font-bold text-ink">Servicio y propina</h2>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={borrador.servicio.kind === "SIN_SERVICIO"}
                onClick={() => toggleServicio(false)}
                className={cn(
                  "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                  borrador.servicio.kind === "SIN_SERVICIO"
                    ? "border-brand bg-brand font-semibold text-on-brand"
                    : "border-line bg-surface text-ink-2 hover:text-ink"
                )}
              >
                Sin servicio
              </button>
              <button
                type="button"
                aria-pressed={borrador.servicio.kind === "SUGERIDO"}
                onClick={() => toggleServicio(true)}
                className={cn(
                  "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                  borrador.servicio.kind === "SUGERIDO"
                    ? "border-brand bg-brand font-semibold text-on-brand"
                    : "border-line bg-surface text-ink-2 hover:text-ink"
                )}
              >
                Sugerido
              </button>
            </div>
            {borrador.servicio.kind === "SUGERIDO" && (
              <div className="max-w-[12rem]">
                <Input
                  label="Porcentaje (%)"
                  surface="admin"
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={String(borrador.servicio.basisPoints / 100)}
                  onChange={(e) => onChangeServicioPorcentaje(e.target.value)}
                />
              </div>
            )}
            <p className="text-[12px] text-ink-3">Es un ajuste del local (D8), no un paso del cobro, y hoy no se cobra automáticamente.</p>
          </div>
        </section>
      </div>
    </Container>
  );
}
