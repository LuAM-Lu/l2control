"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, MinusCircle, PlusCircle, Sprout, TriangleAlert } from "lucide-react";
import type { InformeDeSemillaDto, ParteDeSemilla } from "@l2/contracts";
import { Button, Container, PageHeader, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useReloj, useSucursal } from "./SucursalProvider.tsx";
import { cargarSemilla, exportarSemilla } from "./semilla.acciones";

/**
 * Ajustes → Semilla del local (B7-2, M-24). Lo tedioso de teclear viaja en un archivo: se descarga de un
 * local y se carga en otro, que solo AÑADE lo que le falta. Antes de cargar se revisa: la pantalla
 * enseña qué entra, qué ya está y qué no trae, y lo que se salta. Todo lo decide el servidor; aquí solo
 * se elige el archivo y se enseña su informe.
 */

const NOMBRE: Readonly<Record<ParteDeSemilla, string>> = {
  AJUSTES: "Ajustes de la sucursal",
  TARIFARIO: "Tarifas y paquetes",
  CATEGORIAS: "Categorías",
  PRODUCTOS: "Carta y productos",
  PLANO: "Plano del local",
  CUMPLEANOS: "Paquetes de cumpleaños",
};

const ESTADO = {
  CARGA: { texto: "Entra", icono: PlusCircle, clase: "text-state-ok" },
  YA_ESTA: { texto: "Ya está", icono: CheckCircle2, clase: "text-ink-2" },
  NO_TRAE: { texto: "No la trae", icono: MinusCircle, clase: "text-ink-3" },
} as const;

/** «Abby Kingdom» → «abby-kingdom», para el nombre del archivo. */
const enArchivo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "local";

export function SemillaScreen() {
  const conElevacion = useConElevacion();
  const reloj = useReloj();
  const { ajustes } = useSucursal();
  const archivo = useRef<HTMLInputElement>(null);
  const [descargando, setDescargando] = useState(false);
  const [semilla, setSemilla] = useState<{ nombre: string; contenido: unknown } | null>(null);
  const [informe, setInforme] = useState<InformeDeSemillaDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"revisar" | "cargar" | null>(null);

  async function descargar() {
    setDescargando(true);
    try {
      const r = await conElevacion(() => exportarSemilla());
      if (!r.ok) return avisar.error(r.mensaje);
      const blob = new Blob([JSON.stringify(r.valor, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `semilla-${enArchivo(r.valor.local)}-${r.valor.exportadaEn.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      avisar.ok("Semilla descargada", { detalle: `${r.valor.productos.length} productos, ${r.valor.categorias.length} categorías.` });
    } catch {
      avisar.error("El servidor no respondió. No se descargó nada.");
    } finally {
      setDescargando(false);
    }
  }

  async function enviar(contenido: unknown, cargar: boolean) {
    setOcupado(cargar ? "cargar" : "revisar");
    setError(null);
    try {
      const r = await conElevacion(() => cargarSemilla({ semilla: contenido, cargar }));
      if (!r.ok) {
        setInforme(null);
        return setError(r.mensaje);
      }
      setInforme(r.valor);
      if (r.valor.cargada) avisar.ok("Semilla cargada", { detalle: "Lo que faltaba ya está en este local." });
    } catch {
      setError("El servidor no respondió. No se cargó nada: vuelve a intentarlo.");
    } finally {
      setOcupado(null);
    }
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    setInforme(null);
    setError(null);
    let contenido: unknown;
    try {
      contenido = JSON.parse(await f.text());
    } catch {
      setSemilla(null);
      return setError(`«${f.name}» no es una semilla: no se puede leer.`);
    }
    setSemilla({ nombre: f.name, contenido });
    await enviar(contenido, false);
  }

  const algoEntra = informe?.partes.some((p) => p.estado === "CARGA") ?? false;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Semilla del local" }]}
        titulo="Semilla del local"
        descripcion="Lo que se tarda en teclear, en un archivo: se descarga de un local y se carga en otro, que solo añade lo que le falta."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="semilla-descargar" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <h2 id="semilla-descargar" className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Download size={17} aria-hidden="true" />
            Descargar la de este local
          </h2>
          <p className="text-[13px] text-ink-2">
            Lleva los ajustes de la sucursal, las tarifas y paquetes, las categorías y la carta con sus precios, el plano y los
            paquetes de cumpleaños.
          </p>
          <p className="text-[12.5px] text-ink-3">
            No lleva personas, medios de pago, impuestos ni existencias: eso se configura en cada local.
          </p>
          <Button type="button" variant="primary" surface="admin" className="mt-1 gap-1.5 self-start" disabled={descargando} onClick={() => void descargar()}>
            <Download size={15} aria-hidden="true" />
            {descargando ? "Preparando…" : "Descargar semilla"}
          </Button>
        </section>

        <section aria-labelledby="semilla-cargar" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <h2 id="semilla-cargar" className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Sprout size={17} aria-hidden="true" />
            Cargar una semilla
          </h2>
          <p className="text-[13px] text-ink-2">
            Elige el archivo: primero se revisa qué entra y qué ya está. Solo se añade lo que falta; lo que este local ya tiene no se
            toca.
          </p>
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Archivo de la semilla"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={informe ? "neutral" : "primary"} surface="admin" className="gap-1.5" disabled={ocupado !== null} onClick={() => archivo.current?.click()}>
              <FileUp size={15} aria-hidden="true" />
              {ocupado === "revisar" ? "Revisando…" : semilla ? "Elegir otro archivo" : "Elegir archivo"}
            </Button>
            {semilla && <span className="min-w-0 truncate text-[12.5px] text-ink-3">{semilla.nombre}</span>}
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-[13px] text-state-crit">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {informe && (
            <div className="flex flex-col gap-3">
              <p className="tnum text-[12.5px] text-ink-2">
                De <strong className="text-ink">{informe.local}</strong>, descargada el {reloj.diaConAnio(Date.parse(informe.exportadaEn))} a las{" "}
                {reloj.hora(Date.parse(informe.exportadaEn))}.
              </p>
              {informe.cargada && (
                <p role="status" className="flex items-center gap-2 rounded-[var(--radius-control)] bg-state-ok-bg p-3 text-[13px] font-medium text-state-ok">
                  <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                  Cargada. Lo que dice «Entra» ya está en este local.
                </p>
              )}
              <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
                {informe.partes.map((p) => {
                  const e = ESTADO[p.estado];
                  const Icono = e.icono;
                  return (
                    <li key={p.parte} className="flex flex-col gap-1 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">{NOMBRE[p.parte]}</span>
                        <span className={cn("flex shrink-0 items-center gap-1 text-[12.5px] font-semibold", e.clase)}>
                          <Icono size={14} aria-hidden="true" />
                          {informe.cargada && p.estado === "CARGA" ? "Entró" : e.texto}
                          {p.cuantos !== null && p.estado === "CARGA" && <span className="tnum">· {p.cuantos}</span>}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-ink-2">{p.detalle}</p>
                      {p.avisos.map((a) => (
                        <p key={a} className="flex items-start gap-1.5 text-[12px] text-state-warn">
                          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {a}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ul>
              {!informe.cargada && (
                <Button
                  type="button"
                  variant="primary"
                  surface="admin"
                  className="gap-1.5 self-start"
                  disabled={!algoEntra || ocupado !== null || !semilla}
                  onClick={() => semilla && void enviar(semilla.contenido, true)}
                >
                  <Sprout size={15} aria-hidden="true" />
                  {ocupado === "cargar" ? "Cargando…" : algoEntra ? "Cargar lo que falta" : "No falta nada"}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </Container>
  );
}
