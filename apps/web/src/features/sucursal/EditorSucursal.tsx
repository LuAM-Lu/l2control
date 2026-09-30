"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Info, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { AjustesSucursalSchema, HorarioDelDiaSchema, type AjustesSucursalDto, type DiaSemana, type HorarioDelDiaDto } from "@l2/contracts";
import { fromMajor, money, toMajor } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, avisar, cn } from "@l2/ui";
import { useReloj, useSucursal } from "./SucursalProvider";

/**
 * Ajustes → Sucursal (B4-4, F5-08b). Los datos del local, su horario y cómo opera: formato de hora,
 * zona, residuo de la caja, umbral del arqueo, horas de una huérfana y servicio.
 *
 * Se edita un borrador y se publica entero como versión nueva; el servidor lo revalida, lo audita y
 * lo cuenta en vivo a todas las pantallas. Si otra persona publica mientras tanto, se avisa aquí y el
 * servidor rechaza pisarla.
 */

const DIAS: readonly DiaSemana[] = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

/** El enum no lleva tildes; la pantalla sí, que la lee una persona. */
const NOMBRE_DIA: Readonly<Record<DiaSemana, string>> = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};

/** Un punto de partida para declarar el horario: se edita antes de publicar. */
const HORARIO_INICIAL: readonly HorarioDelDiaDto[] = DIAS.map((dia) => ({ dia, kind: "ABIERTO", abre: "10:00", cierra: "20:00" }));

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const TARJETA = "flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card";
/** Un campo de hora del horario: sin el icono del selector, para que quepan dos en la fila. */
const HORA_DEL_DIA =
  "tnum min-h-8 min-w-0 flex-1 rounded-[var(--radius-control)] border bg-surface px-1.5 text-[13px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-calendar-picker-indicator]:hidden";
const CAMPO =
  "min-h-8 w-full rounded-[var(--radius-control)] border bg-surface px-2.5 text-[13px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Las zonas de América que conoce el navegador; la vigente siempre está, aunque sea de otro lado. */
function zonasPosibles(actual: string): readonly string[] {
  const todas = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const america = todas.filter((z) => z.startsWith("America/"));
  return america.includes(actual) ? america : [actual, ...america];
}

/** «0,05» ↔ unidades menores. El texto es el del borrador; el dinero se valida al publicar. */
const aTexto = (minor: string) => toMajor(money(BigInt(minor), "USD")).replace(".", ",");
function aMinor(texto: string): string | null {
  try {
    return String(fromMajor(texto.trim().replace(",", "."), "USD").amount);
  } catch {
    return null;
  }
}

type Errores = Readonly<Record<string, string>>;

/** Los problemas del contrato, por campo (el primero de cada uno). */
function erroresDe(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Errores {
  const e: Record<string, string> = {};
  for (const i of issues) {
    const campo = i.path.filter((p) => p !== "ajustes").map(String).join(".") || "general";
    e[campo] ??= i.message;
  }
  return e;
}

export function EditorSucursal() {
  const { ajustes: vigentes, version, publicadoEn, publicadoPor, publicar } = useSucursal();
  const reloj = useReloj();
  const [borrador, setBorrador] = useState<AjustesSucursalDto>(vigentes);
  const [base, setBase] = useState(version);
  /** Los importes y las horas se teclean como texto: no se convierten hasta que se entiende lo escrito. */
  const [textos, setTextos] = useState(() => ({ residuo: aTexto(vigentes.maxRetenido.minor), umbral: aTexto(vigentes.umbralArqueo.minor) }));
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sucio = JSON.stringify(borrador) !== JSON.stringify(vigentes);
  // Otra persona (u otro equipo) publicó: sin cambios propios se adopta; con cambios, se avisa.
  const ajena = version !== base;
  useEffect(() => {
    if (ajena && !sucio) cargarVigentes();
    // Solo cuando cambia la versión publicada.
  }, [version]);

  const zonas = useMemo(() => zonasPosibles(borrador.zonaHoraria), [borrador.zonaHoraria]);

  function cambiar(cambio: Partial<AjustesSucursalDto>) {
    setBorrador((b) => ({ ...b, ...cambio }));
    setErrores((e) => {
      const resto = { ...e };
      for (const k of Object.keys(cambio)) for (const c of Object.keys(resto)) if (c === k || c.startsWith(`${k}.`)) delete resto[c];
      return resto;
    });
    setGeneral(null);
  }

  function cargarVigentes() {
    setBorrador(vigentes);
    setBase(version);
    setTextos({ residuo: aTexto(vigentes.maxRetenido.minor), umbral: aTexto(vigentes.umbralArqueo.minor) });
    setErrores({});
    setGeneral(null);
  }

  function importe(campo: "residuo" | "umbral", texto: string) {
    setTextos((t) => ({ ...t, [campo]: texto }));
    const minor = aMinor(texto);
    const clave = campo === "residuo" ? "maxRetenido" : "umbralArqueo";
    if (minor === null) {
      setErrores((e) => ({ ...e, [clave]: "Escribe el monto en dólares, por ejemplo 0,50" }));
      return;
    }
    cambiar({ [clave]: { minor, currency: "USD" } });
  }

  function horarioDe(dia: DiaSemana, h: HorarioDelDiaDto) {
    if (!borrador.horario) return;
    cambiar({ horario: borrador.horario.map((x) => (x.dia === dia ? h : x)) });
  }

  async function alPublicar() {
    if (Object.keys(errores).length > 0) return;
    const r = AjustesSucursalSchema.safeParse(borrador);
    if (!r.success) {
      setErrores(erroresDe(r.error.issues));
      return;
    }
    setEnviando(true);
    try {
      const hecho = await publicar(r.data);
      if (hecho.ok) {
        setBase(hecho.valor.version);
        setBorrador(hecho.valor.ajustes);
        avisar.ok("Ajustes publicados", { detalle: `Versión ${hecho.valor.version}: todas las pantallas los usan ya.` });
        return;
      }
      if (hecho.problemas?.length) setErrores(erroresDe(hecho.problemas));
      setGeneral(hecho.mensaje);
    } catch {
      setGeneral("No hubo respuesta del servidor. Revisa la conexión y vuelve a publicar.");
    } finally {
      setEnviando(false);
    }
  }

  const texto = (campo: "nombre" | "rif" | "direccionFiscal" | "telefono", etiqueta: string, extra: { placeholder?: string; className?: string } = {}) => (
    <div className={extra.className}>
      <Input
        label={etiqueta}
        surface="admin"
        value={borrador[campo] ?? ""}
        placeholder={extra.placeholder}
        error={errores[campo]}
        autoComplete="off"
        onChange={(e) => cambiar({ [campo]: campo === "nombre" ? e.target.value : e.target.value.trim() === "" ? null : e.target.value })}
      />
    </div>
  );

  const segmento = (activo: boolean) =>
    cn(
      "min-h-8 flex-1 cursor-pointer rounded-[var(--radius-control)] border px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
      activo ? "border-brand bg-brand font-semibold text-on-brand" : "border-line bg-surface text-ink-2 hover:text-ink",
    );

  return (
    <Container ancho="panel" className="py-6">
      <PageHeader
        migas={[
          { texto: vigentes.nombre, href: "/panel" },
          { texto: "Ajustes", href: "/panel/ajustes" },
          { texto: "Sucursal" },
        ]}
        titulo="Sucursal"
        descripcion="Los datos del local, su horario y cómo opera. Al publicar, todas las pantallas cambian a la vez."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Button surface="admin" variant="ghost" onClick={cargarVigentes} disabled={!sucio || enviando}>
              <RotateCcw size={15} aria-hidden="true" />
              Descartar cambios
            </Button>
            <Button surface="admin" variant="primary" onClick={() => void alPublicar()} disabled={!sucio || enviando || Object.keys(errores).length > 0}>
              <Save size={15} aria-hidden="true" />
              {enviando ? "Publicando…" : "Publicar"}
            </Button>
          </div>
        }
      />

      <p className="-mt-2 mb-3 flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <Info size={13} aria-hidden="true" />
        {version === 0
          ? "Valores de fábrica: estos ajustes nunca se han publicado."
          : `Versión ${version} · publicada por ${publicadoPor ?? "—"}${publicadoEn ? ` el ${reloj.diaConAnio(Date.parse(publicadoEn))} a las ${reloj.hora(Date.parse(publicadoEn))}` : ""}.`}
      </p>

      {ajena && sucio && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[13px] text-ink">
          <TriangleAlert size={16} className="text-state-warn" aria-hidden="true" />
          Otra persona publicó la versión {version} mientras editabas. Publicar ahora la pisaría: el servidor no lo deja.
          <Button surface="admin" variant="ghost" className="ml-auto" onClick={cargarVigentes}>
            Cargar la vigente
          </Button>
        </div>
      )}
      {general && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {general}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.1fr)]">
        {/* === El local === */}
        <section aria-labelledby="suc-local" className={TARJETA}>
          <h2 id="suc-local" className="font-display text-[14px] font-bold text-ink">
            El local
          </h2>
          {texto("nombre", "Nombre")}
          <div className="grid grid-cols-2 gap-3">
            {texto("rif", "RIF", { placeholder: "Sin declarar" })}
            {texto("telefono", "Teléfono", { placeholder: "Sin declarar" })}
          </div>
          {texto("direccionFiscal", "Dirección fiscal", { placeholder: "Sin declarar" })}
          <p className="text-[12px] text-ink-3">
            El nombre, el RIF y la dirección salen en el recibo. Moneda funcional: dólar (DEC-2); cambiarla es una decisión del plan, no un ajuste.
          </p>
        </section>

        {/* === Horario === */}
        <section aria-labelledby="suc-horario" className={TARJETA}>
          <div className="flex items-center justify-between gap-2">
            <h2 id="suc-horario" className="font-display text-[14px] font-bold text-ink">
              Horario
            </h2>
            {borrador.horario && (
              <button type="button" className="cursor-pointer text-[12px] font-semibold text-ink-2 underline-offset-2 hover:underline" onClick={() => cambiar({ horario: null })}>
                Dejar sin declarar
              </button>
            )}
          </div>
          {borrador.horario === null ? (
            <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-[var(--radius-control)] border border-dashed border-line px-4 py-6">
              <p className="flex items-center gap-2 text-[13px] text-ink-2">
                <CalendarClock size={16} aria-hidden="true" />
                Sin declarar. Hoy no bloquea nada.
              </p>
              <Button surface="admin" variant="neutral" onClick={() => cambiar({ horario: [...HORARIO_INICIAL] })}>
                Declarar el horario
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {DIAS.map((dia) => {
                const h = borrador.horario!.find((x) => x.dia === dia) ?? { dia, kind: "CERRADO" as const };
                const abierto = h.kind === "ABIERTO";
                const r = HorarioDelDiaSchema.safeParse(h);
                const error = r.success ? undefined : r.error.issues[0]?.message;
                return (
                  <li key={dia} className="flex flex-col gap-0.5">
                    <div className="flex min-h-8 items-center gap-2">
                      <label className="flex w-[6.25rem] shrink-0 cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 cursor-pointer accent-[var(--color-brand)]"
                          checked={abierto}
                          onChange={() => horarioDe(dia, abierto ? { dia, kind: "CERRADO" } : { dia, kind: "ABIERTO", abre: "10:00", cierra: "20:00" })}
                        />
                        {NOMBRE_DIA[dia]}
                      </label>
                      {abierto ? (
                        <>
                          <input
                            type="time"
                            aria-label={`${NOMBRE_DIA[dia]}: abre`}
                            className={cn(HORA_DEL_DIA, error ? "border-state-crit" : "border-line")}
                            value={h.abre}
                            onChange={(e) => horarioDe(dia, { ...h, abre: e.target.value })}
                          />
                          <span className="text-[12px] text-ink-3">a</span>
                          <input
                            type="time"
                            aria-label={`${NOMBRE_DIA[dia]}: cierra`}
                            aria-invalid={error ? true : undefined}
                            className={cn(HORA_DEL_DIA, error ? "border-state-crit" : "border-line")}
                            value={h.cierra}
                            onChange={(e) => horarioDe(dia, { ...h, cierra: e.target.value })}
                          />
                        </>
                      ) : (
                        <span className="text-[13px] text-ink-3">Cerrado</span>
                      )}
                    </div>
                    {error && (
                      <p className="flex items-center gap-1 pl-[6.75rem] text-[12px] text-state-crit">
                        <TriangleAlert size={12} className="shrink-0" aria-hidden="true" />
                        {error}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {errores.horario && <p className="text-[12px] font-medium text-state-crit">{errores.horario}</p>}
        </section>

        {/* === Cómo opera === */}
        <section aria-labelledby="suc-opera" className={TARJETA}>
          <h2 id="suc-opera" className="font-display text-[14px] font-bold text-ink">
            Cómo opera
          </h2>
          <div className="flex flex-col gap-1.5">
            <span className={ETIQUETA}>Formato de hora</span>
            <div className="flex gap-2" role="group" aria-label="Formato de hora">
              <button type="button" aria-pressed={borrador.formatoHora === "12h"} className={segmento(borrador.formatoHora === "12h")} onClick={() => cambiar({ formatoHora: "12h" })}>
                12 h · 2:00 pm
              </button>
              <button type="button" aria-pressed={borrador.formatoHora === "24h"} className={segmento(borrador.formatoHora === "24h")} onClick={() => cambiar({ formatoHora: "24h" })}>
                24 h · 14:00
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="suc-zona" className={ETIQUETA}>
              Zona horaria
            </label>
            <select
              id="suc-zona"
              className={cn(CAMPO, errores.zonaHoraria ? "border-state-crit" : "border-line")}
              value={borrador.zonaHoraria}
              aria-invalid={errores.zonaHoraria ? true : undefined}
              aria-describedby="suc-zona-nota"
              onChange={(e) => cambiar({ zonaHoraria: e.target.value })}
            >
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z.replace("America/", "").replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <p id="suc-zona-nota" className={cn("flex items-start gap-1 text-[12px]", errores.zonaHoraria ? "font-medium text-state-crit" : "text-ink-3")}>
              {errores.zonaHoraria && <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />}
              {errores.zonaHoraria ?? "Decide el día de negocio: se cambia sin turnos abiertos ni niños en sala."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Residuo ($)"
              surface="admin"
              inputMode="decimal"
              className="tnum"
              value={textos.residuo}
              error={errores.maxRetenido}
              hint="Hasta $ 1,00"
              onChange={(e) => importe("residuo", e.target.value)}
            />
            <Input
              label="Arqueo ($)"
              surface="admin"
              inputMode="decimal"
              className="tnum"
              value={textos.umbral}
              error={errores.umbralArqueo}
              hint="Más, supervisión"
              onChange={(e) => importe("umbral", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Huérfana (h)"
              surface="admin"
              type="number"
              min={2}
              max={16}
              step={1}
              className="tnum"
              value={String(borrador.horasHuerfana)}
              error={errores.horasHuerfana}
              hint="De 2 a 16"
              onChange={(e) => cambiar({ horasHuerfana: Number(e.target.value) })}
            />
            <div className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Servicio</span>
              <div className="flex items-center gap-1" role="group" aria-label="Servicio sugerido">
                <button
                  type="button"
                  aria-pressed={borrador.servicio.kind === "SIN_SERVICIO"}
                  className={cn(segmento(borrador.servicio.kind === "SIN_SERVICIO"), "w-9 flex-none px-0")}
                  onClick={() => cambiar({ servicio: { kind: "SIN_SERVICIO" } })}
                >
                  No
                </button>
                <button
                  type="button"
                  aria-pressed={borrador.servicio.kind === "SUGERIDO"}
                  className={cn(segmento(borrador.servicio.kind === "SUGERIDO"), "w-9 flex-none px-0")}
                  onClick={() => borrador.servicio.kind !== "SUGERIDO" && cambiar({ servicio: { kind: "SUGERIDO", basisPoints: 1000 } })}
                >
                  Sí
                </button>
                {borrador.servicio.kind === "SUGERIDO" && (
                  <label className="flex items-center gap-0.5 text-[13px] text-ink-2">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      aria-label="Servicio sugerido, en porcentaje"
                      className={cn(CAMPO, "tnum w-10 px-1", errores["servicio.basisPoints"] ? "border-state-crit" : "border-line")}
                      value={String(borrador.servicio.basisPoints / 100)}
                      onChange={(e) => cambiar({ servicio: { kind: "SUGERIDO", basisPoints: Math.round(Number(e.target.value) * 100) } })}
                    />
                    %
                  </label>
                )}
              </div>
              {errores["servicio.basisPoints"] && <p className="text-[12px] font-medium text-state-crit">{errores["servicio.basisPoints"]}</p>}
            </div>
          </div>
          <p className="text-[12px] text-ink-3">
            El residuo es lo que la caja se queda si no hay vuelto exacto. Una estancia que pasa de sus horas (o del día) queda a revisar y deja de contar en el aforo.
          </p>
        </section>
      </div>
    </Container>
  );
}
