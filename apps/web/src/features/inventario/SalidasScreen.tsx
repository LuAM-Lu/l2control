"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardCheck, FileText, PackageMinus, Plus, Printer, Search, TriangleAlert, X } from "lucide-react";
import type { AjusteInventarioDto, AjustesInventarioDto, CatalogoDto, MotivoSalida, Problema, ProductoDto, Rechazo, Resultado } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { diferenciasDeConteo, nameKey, normalizeBarcode } from "@l2/domain-inventory";
import { money, toMajor } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, Sheet, avisar, cn, formatMoneyVE, useLectorDeCodigos } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { autorizadoresDeInventario, registrarConteo, registrarSalida } from "./salidas.acciones";

/**
 * Panel → Inventario → Salidas y conteo (B9-4, F8-07). Lo que sale sin venderse, con su motivo de una
 * lista cerrada, y el conteo físico, que deja la existencia igual a lo contado. Las dos cosas con la
 * autorización de quien puede darla (administración confirma con su PIN; supervisión pide el de
 * administración). Nada se edita ni se borra: un error se corrige con otro movimiento.
 */

const CAMPO =
  "min-h-9 w-full rounded-[var(--radius-control)] border bg-surface px-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

const MOTIVOS: readonly { id: MotivoSalida; texto: string; detalle: string }[] = [
  { id: "MERMA", texto: "Merma o daño", detalle: "Se rompió, se venció o se perdió" },
  { id: "CONSUMO_INTERNO", texto: "Consumo interno", detalle: "Lo usó el personal o el local" },
  { id: "REGALO", texto: "Regalo", detalle: "Se dio fuera de una cuenta" },
  { id: "DEVOLUCION_PROVEEDOR", texto: "Devolución al proveedor", detalle: "Volvió a quien lo vendió" },
];
const NOMBRE_MOTIVO = Object.fromEntries(MOTIVOS.map((m) => [m.id, m.texto])) as Record<MotivoSalida, string>;

/** Un importe con su signo, sin el «-» pegado al símbolo: «− $ 2.00». */
const conSigno = (m: { minor: string }) => {
  const v = BigInt(m.minor);
  const abs = formatMoneyVE(toMajor(money(v < 0n ? -v : v, "USD")), "USD");
  return v < 0n ? `− ${abs}` : v > 0n ? `+ ${abs}` : abs;
};
const unidades = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

export function SalidasScreen({ catalogo, ajustes: inicial }: { catalogo: CatalogoDto; ajustes: AjustesInventarioDto | null }) {
  const actor = useActorEnSesion();
  const puede = actor !== null && can(actor, "inventario.ajustar") !== "DENEGADO";
  const { ajustes: sucursal } = useSucursal();
  const reloj = useReloj();
  const [ajustes, setAjustes] = useState(inicial?.ajustes ?? null);
  const huella = JSON.stringify(inicial);
  useEffect(() => setAjustes(inicial?.ajustes ?? null), [huella]);
  const [abierta, setAbierta] = useState<"SALIDA" | "CONTEO" | null>(null);

  const contables = useMemo(
    () =>
      catalogo.productos
        .filter((p) => p.controlaStock)
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.categoria.localeCompare(b.categoria, "es") || a.nombre.localeCompare(b.nombre, "es")),
    [catalogo],
  );
  const adoptar = (a: AjusteInventarioDto) => {
    setAjustes((prev) => [a, ...(prev ?? []).filter((x) => x.id !== a.id)]);
    setAbierta(null);
  };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: sucursal.nombre, href: "/panel" }, { texto: "Inventario", href: "/panel/inventario" }, { texto: "Salidas y conteo" }]}
        titulo="Salidas y conteo"
        descripcion="Lo que sale sin venderse, con su motivo, y el conteo físico, que deja la existencia igual a lo contado. Cada uno con su autorización."
        acciones={
          puede &&
          contables.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setAbierta("CONTEO")}>
                <ClipboardCheck size={15} aria-hidden="true" />
                Contar
              </Button>
              <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setAbierta("SALIDA")}>
                <PackageMinus size={15} aria-hidden="true" />
                Registrar salida
              </Button>
            </div>
          )
        }
      />

      {ajustes === null ? (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {puede ? "No se pudieron leer las salidas y los conteos. Recarga la página; si sigue así, avisa a administración." : "Las salidas y los conteos los registra administración, o supervisión con su autorización."}
        </p>
      ) : ajustes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
          <ClipboardCheck size={28} className="text-ink-3" aria-hidden="true" />
          <p className="font-display text-[16px] font-bold text-ink">Ni salidas ni conteos todavía</p>
          <p className="max-w-md text-[13px] text-ink-2">
            Lo que se rompe, se consume o se regala sale de aquí con su motivo. Contar de vez en cuando deja el sistema igual a lo que hay en el estante.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {ajustes.map((a) => (
            <FilaAjuste key={a.id} ajuste={a} cuando={`${reloj.diaConAnio(Date.parse(a.en))} · ${reloj.hora(Date.parse(a.en))}`} />
          ))}
        </ul>
      )}

      {abierta === "SALIDA" && <NuevaSalida contables={contables} onCerrar={() => setAbierta(null)} onHecha={adoptar} />}
      {abierta === "CONTEO" && <NuevoConteo contables={contables} onCerrar={() => setAbierta(null)} onHecho={adoptar} />}
    </Container>
  );
}

function FilaAjuste({ ajuste: a, cuando }: { ajuste: AjusteInventarioDto; cuando: string }) {
  const conDiferencia = a.lineas.filter((l) => l.cantidad !== 0);
  const cuadran = a.lineas.length - conDiferencia.length;
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-2">{a.tipo === "SALIDA" ? "Salida" : "Conteo"}</span>
        <span className="text-[14px] font-semibold text-ink">{a.tipo === "SALIDA" && a.motivo ? NOMBRE_MOTIVO[a.motivo] : `${a.lineas.length} ${a.lineas.length === 1 ? "producto contado" : "productos contados"}`}</span>
        {a.detalle && <span className="min-w-0 truncate text-[12.5px] text-ink-3">{a.detalle}</span>}
        <span className="tnum ml-auto text-[15px] font-bold text-ink">{conSigno(a.valor)}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-2">
        {conDiferencia.length === 0 ? (
          <span className="text-ink-3">Todo cuadró: no se movió nada.</span>
        ) : (
          conDiferencia.map((l, i) => (
            <span key={l.productId}>
              {i > 0 && <span className="text-ink-3"> · </span>}
              {l.nombre}{" "}
              <span className="tnum text-ink-3">
                {a.tipo === "CONTEO" ? `${l.esperado} → ${l.contado} (${unidades(l.cantidad)})` : unidades(l.cantidad)}
              </span>
            </span>
          ))
        )}
        {a.tipo === "CONTEO" && conDiferencia.length > 0 && cuadran > 0 && <span className="text-ink-3"> · {cuadran} cuadraron</span>}
      </p>
      <p className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
        {cuando} · {a.por} · autorizó {a.autorizadoPor}
        {a.tipo === "CONTEO" && (
          // B9-10: el informe de diferencias queda con el conteo, para compararlo con otro.
          <a href={`/informes/conteo/${a.id}`} className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline">
            <FileText size={12} aria-hidden="true" />
            Informe de diferencias
          </a>
        )}
      </p>
    </li>
  );
}

/** Los problemas del servidor por línea y campo («lineas.0.cantidad» → «0.cantidad»). */
function porLinea(problemas: readonly Problema[]): Record<string, string> {
  const e: Record<string, string> = {};
  for (const p of problemas) {
    if (p.path[0] !== "lineas" || typeof p.path[1] !== "number") continue;
    e[`${p.path[1]}.${String(p.path[2] ?? "productId")}`] ??= p.message.replace(/^SIN_CONTROL_DE_STOCK$/, "No lleva existencia").replace(/^CAMBIO: ahora (\d+)$/, "El sistema dice ahora $1: revisa lo contado y vuelve a registrar");
  }
  return e;
}

/** Envía con la autorización y traduce el rechazo: el del PIN junto al PIN, el resto arriba o en su línea. */
function useEnvio(onHecho: (a: AjusteInventarioDto) => void, abierto: boolean) {
  const a = useAutorizacion("inventario.ajustar", abierto, { cargar: autorizadoresDeInventario });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [clave, setClave] = useState(() => globalThis.crypto.randomUUID());
  const nuevaClave = () => setClave(globalThis.crypto.randomUUID());

  async function enviar(mandar: (autorizacion: unknown) => Promise<Resultado<AjusteInventarioDto>>, razon: string, aviso: (x: AjusteInventarioDto) => string) {
    const falta = a.falta();
    if (falta) {
      setErrores(falta as Record<string, string>);
      return;
    }
    setEnviando(true);
    const r = await mandar(a.autorizacion(razon)).catch(() => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se movió nada." }) as Rechazo);
    setEnviando(false);
    if (r.ok) {
      avisar.ok(aviso(r.valor));
      onHecho(r.valor);
      return;
    }
    const e = erroresDeRechazo(r.mensaje);
    if (e.pin) a.borrarPin();
    setErrores({ ...porLinea(r.problemas ?? []), ...(e as Record<string, string>) });
  }
  return { a, errores, setErrores, enviando, clave, nuevaClave, enviar };
}

type LineaSalida = { uid: string; productId: string; cantidad: string };

function NuevaSalida({ contables, onCerrar, onHecha }: { contables: readonly ProductoDto[]; onCerrar: () => void; onHecha: (a: AjusteInventarioDto) => void }) {
  const [motivo, setMotivo] = useState<MotivoSalida | null>(null);
  const [detalle, setDetalle] = useState("");
  const [lineas, setLineas] = useState<LineaSalida[]>(() => [{ uid: globalThis.crypto.randomUUID(), productId: "", cantidad: "1" }]);
  const { a, errores, setErrores, enviando, clave, nuevaClave, enviar } = useEnvio(onHecha, true);
  const porId = useMemo(() => new Map(contables.map((p) => [p.id, p])), [contables]);
  const listas = lineas.every((l) => l.productId && Number.isInteger(Number(l.cantidad)) && Number(l.cantidad) >= 1);
  const repetido = new Set(lineas.map((l) => l.productId).filter(Boolean)).size !== lineas.filter((l) => l.productId).length;

  const cambiar = (uid: string, c: Partial<LineaSalida>) => {
    setLineas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...c } : l)));
    nuevaClave();
    setErrores({});
  };

  async function registrar() {
    if (!motivo) {
      setErrores({ motivo: "Elige por qué sale" });
      return;
    }
    if (!listas || repetido) return;
    const n = lineas.reduce((t, l) => t + Number(l.cantidad), 0);
    await enviar(
      (autorizacion) =>
        registrarSalida(
          { idempotencyKey: clave, motivo, ...(detalle.trim() ? { detalle: detalle.trim() } : {}), lineas: lineas.map((l) => ({ productId: l.productId, cantidad: Number(l.cantidad) })) },
          autorizacion,
        ),
      `${NOMBRE_MOTIVO[motivo]}: ${n} ${n === 1 ? "unidad" : "unidades"}${detalle.trim() ? ` · ${detalle.trim()}` : ""}`,
      (x) => `Salida registrada: ${NOMBRE_MOTIVO[motivo]}, ${conSigno(x.valor)} al costo`,
    );
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Registrar una salida"
      descripcion="Lo que sale sin venderse. Sale al costo promedio y queda con su motivo y quién lo autorizó."
      pie={
        <div className="flex w-full flex-col gap-2">
          {errores.general && (
            <p role="alert" className="flex items-start gap-1.5 text-[12.5px] font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errores.general}
            </p>
          )}
          <Button type="button" variant="primary" surface="admin" className="gap-1.5" disabled={!listas || repetido || enviando || a.permiso === "DENEGADO"} onClick={() => void registrar()}>
            <PackageMinus size={15} aria-hidden="true" />
            {enviando ? "Registrando…" : "Registrar salida"}
          </Button>
          {repetido && <p className="text-center text-[12px] text-state-warn">Un producto va una vez: suma sus unidades en una sola línea.</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Por qué sale</legend>
          <div role="radiogroup" aria-label="Motivo de la salida" className="grid grid-cols-2 gap-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={motivo === m.id}
                onClick={() => {
                  setMotivo(m.id);
                  setErrores((e) => ({ ...e, motivo: "" }));
                }}
                className={cn(
                  "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 py-1.5 text-left transition-colors",
                  motivo === m.id ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                <span className="text-[13px] font-semibold">{m.texto}</span>
                <span className="text-[11px] text-ink-3">{m.detalle}</span>
              </button>
            ))}
          </div>
          {errores.motivo && <p className="text-[12px] text-state-crit">{errores.motivo}</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">2 · Qué sale</legend>
          <ul className="flex flex-col gap-2">
            {lineas.map((l, i) => {
              const p = porId.get(l.productId);
              return (
                <li key={l.uid} className="flex items-start gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="sr-only">Producto de la línea {i + 1}</span>
                    <select className={cn(CAMPO, errores[`${i}.productId`] ? "border-state-crit" : "border-line")} value={l.productId} onChange={(e) => cambiar(l.uid, { productId: e.target.value })}>
                      <option value="">Elige un producto…</option>
                      {contables.map((c) => (
                        <option key={c.id} value={c.id} disabled={(c.existencia ?? 0) === 0}>
                          {c.nombre} · {(c.existencia ?? 0) === 0 ? "agotado" : `quedan ${c.existencia}`}
                        </option>
                      ))}
                    </select>
                    {(errores[`${i}.productId`] || errores[`${i}.cantidad`]) && (
                      <span className="text-[12px] text-state-crit">{errores[`${i}.productId`] ?? errores[`${i}.cantidad`]}</span>
                    )}
                  </label>
                  <label className="flex w-24 shrink-0 flex-col">
                    <span className="sr-only">Unidades de la línea {i + 1}</span>
                    <input
                      type="number"
                      min={1}
                      max={p?.existencia ?? undefined}
                      step={1}
                      inputMode="numeric"
                      aria-label={`Unidades de ${p?.nombre ?? `la línea ${i + 1}`}`}
                      className={cn(CAMPO, "tnum", errores[`${i}.cantidad`] ? "border-state-crit" : "border-line")}
                      value={l.cantidad}
                      onChange={(e) => cambiar(l.uid, { cantidad: e.target.value })}
                    />
                  </label>
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Quitar la línea ${i + 1}`}
                      onClick={() => setLineas((ls) => ls.filter((x) => x.uid !== l.uid))}
                      className="grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-state-crit-bg hover:text-state-crit"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="ghost"
            surface="admin"
            className="gap-1.5 self-start"
            onClick={() => setLineas((ls) => [...ls, { uid: globalThis.crypto.randomUUID(), productId: "", cantidad: "1" }])}
          >
            <Plus size={15} aria-hidden="true" />
            Otro producto
          </Button>
          <Input label="Detalle (opcional)" surface="admin" value={detalle} maxLength={280} placeholder="Qué pasó" onChange={(e) => setDetalle(e.target.value)} />
        </fieldset>

        <CampoAutorizacion
          a={a}
          numero={3}
          denegado="Tu puesto no puede sacar mercancía del inventario."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void registrar()}
        />
      </div>
    </Sheet>
  );
}

/** Lo contado de un producto, con lo que el sistema decía en el momento de contarlo. */
type Contado = { contado: string; esperado: number };

function NuevoConteo({ contables, onCerrar, onHecho }: { contables: readonly ProductoDto[]; onCerrar: () => void; onHecho: (a: AjusteInventarioDto) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState("");
  const [contados, setContados] = useState<Record<string, Contado>>({});
  /** B9-10: qué se cuenta (una categoría o todo) y si ya se terminó de contar y se revisan las diferencias. */
  const [categoria, setCategoria] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const { a, errores, setErrores, enviando, clave, nuevaClave, enviar } = useEnvio(onHecho, true);
  const categorias = useMemo(() => [...new Set(contables.map((p) => p.categoria))].sort((x, y) => x.localeCompare(y, "es")), [contables]);
  const visibles = contables.filter((p) => (categoria === null || p.categoria === categoria) && nameKey(p.nombre).includes(nameKey(busqueda)));
  // Lo que se envía, en el orden en que se contó: el servidor señala las líneas por su posición.
  const enviados = contables.filter((p) => contados[p.id] && contados[p.id]!.contado.trim() !== "");
  const valido = (x: Contado) => Number.isInteger(Number(x.contado)) && Number(x.contado) >= 0;
  const listos = enviados.length > 0 && enviados.every((p) => valido(contados[p.id]!));
  const conDiferencia = enviados.filter((p) => valido(contados[p.id]!) && Number(contados[p.id]!.contado) !== contados[p.id]!.esperado).length;
  const errorDe = (id: string) => {
    const i = enviados.findIndex((p) => p.id === id);
    return i < 0 ? undefined : (errores[`${i}.contado`] ?? errores[`${i}.esperado`] ?? errores[`${i}.productId`]);
  };

  // Pasar un producto por el lector (B9-6) lo busca en la lista y pone el cursor en su casilla.
  useLectorDeCodigos((leido) => {
    const codigo = normalizeBarcode(leido);
    const p = contables.find((x) => x.codigoBarras === codigo || x.sku === codigo);
    if (!p) {
      avisar.error(`Ningún producto que se cuente con el código ${codigo}`);
      return;
    }
    setBusqueda(p.nombre);
    window.setTimeout(() => {
      const campo = document.querySelector<HTMLInputElement>(`input[aria-label="Contado de ${CSS.escape(p.nombre)}"]`);
      campo?.focus();
      campo?.select();
    }, 50);
  });

  function contar(p: ProductoDto, texto: string) {
    // Lo que el sistema decía se fija al empezar a contar ese producto: si después se vende algo, el
    // servidor lo nota y pide revisar, en vez de ajustar contra otro número.
    setContados((c) => ({ ...c, [p.id]: { contado: texto.replace(/\D/g, ""), esperado: c[p.id]?.esperado ?? p.existencia ?? 0 } }));
    nuevaClave();
    setErrores({});
  }

  // Si el servidor dice que la existencia cambió mientras se contaba, esa línea pasa a compararse con lo
  // que dice ahora: la diferencia nueva queda a la vista y basta revisar y volver a registrar.
  useEffect(() => {
    const nuevos: Record<string, number> = {};
    for (const [campo, mensaje] of Object.entries(errores)) {
      const i = /^(\d+)\.esperado$/.exec(campo)?.[1];
      const ahora = /dice ahora (\d+)/.exec(mensaje)?.[1];
      const p = i === undefined ? undefined : enviados[Number(i)];
      if (p && ahora !== undefined) nuevos[p.id] = Number(ahora);
    }
    if (Object.keys(nuevos).length === 0) return;
    setContados((c) => Object.fromEntries(Object.entries(c).map(([id, x]) => [id, id in nuevos ? { ...x, esperado: nuevos[id]! } : x])));
    setRevisando(true);
    // Solo cuando llega un rechazo nuevo.
  }, [errores]);

  async function registrar() {
    if (!listos) return;
    await enviar(
      (autorizacion) =>
        registrarConteo(
          {
            idempotencyKey: clave,
            ...(detalle.trim() ? { detalle: detalle.trim() } : {}),
            lineas: enviados.map((p) => ({ productId: p.id, esperado: contados[p.id]!.esperado, contado: Number(contados[p.id]!.contado) })),
          },
          autorizacion,
        ),
      `Conteo físico: ${enviados.length} contados, ${conDiferencia} con diferencia${detalle.trim() ? ` · ${detalle.trim()}` : ""}`,
      (x) => (conDiferencia === 0 ? `Conteo registrado: todo cuadró` : `Conteo registrado: ${conDiferencia} ajustados, ${conSigno(x.valor)} al costo`),
    );
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Conteo físico"
      descripcion="A ciegas: escribe lo que hay en el estante sin ver lo que dice el sistema. Al terminar ves las diferencias; lo que falta sale y lo que sobra entra, al costo."
      pie={
        <div className="flex w-full flex-col gap-2">
          {errores.general && (
            <p role="alert" className="flex items-start gap-1.5 text-[12.5px] font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errores.general}
            </p>
          )}
          <div className="flex items-center gap-3">
            <p className="tnum text-[12.5px] text-ink-2">
              {enviados.length === 0 ? "Nada contado todavía" : revisando ? `${enviados.length} contados · ${conDiferencia} con diferencia` : `${enviados.length} contados`}
            </p>
            {revisando ? (
              <>
                <Button type="button" variant="ghost" surface="admin" className="ml-auto gap-1.5" disabled={enviando} onClick={() => setRevisando(false)}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  Seguir contando
                </Button>
                <Button type="button" variant="primary" surface="admin" className="gap-1.5" disabled={!listos || enviando || a.permiso === "DENEGADO"} onClick={() => void registrar()}>
                  <ClipboardCheck size={15} aria-hidden="true" />
                  {enviando ? "Registrando…" : "Registrar conteo"}
                </Button>
              </>
            ) : (
              <Button type="button" variant="primary" surface="admin" className="ml-auto gap-1.5" disabled={!listos} onClick={() => setRevisando(true)}>
                <ClipboardCheck size={15} aria-hidden="true" />
                Terminé: ver diferencias
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {revisando ? (
          <Diferencias contables={contables} contados={contados} />
        ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Lo que hay</legend>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              Qué cuentas
              <select value={categoria ?? ""} onChange={(e) => setCategoria(e.target.value || null)} className={cn(CAMPO, "w-auto border-line")}>
                <option value="">Todo</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <a
              href={categoria ? `/informes/hoja-de-conteo?categoria=${encodeURIComponent(categoria)}` : "/informes/hoja-de-conteo"}
              target="_blank"
              rel="noopener"
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[12.5px] font-semibold text-ink hover:border-line-strong"
            >
              <Printer size={14} aria-hidden="true" />
              Hoja para imprimir
            </a>
          </div>
          <p className="text-[12px] text-ink-3">Pasa cada producto por el lector para ir a su casilla. Lo que dice el sistema se ve al terminar.</p>
          <label className="relative flex">
            <span className="sr-only">Buscar un producto</span>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input type="search" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={cn(CAMPO, "border-line pl-9")} />
          </label>
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {visibles.map((p) => {
              const c = contados[p.id];
              const error = errorDe(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {p.nombre}
                      {!p.activo && <span className="font-normal text-ink-3"> · apartado</span>}
                    </span>
                    <span className="tnum text-[12px] text-ink-3">{[p.sku, p.presentacion].filter(Boolean).join(" · ")}</span>
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Contado de ${p.nombre}`}
                    placeholder="—"
                    className={cn(CAMPO, "tnum w-20 text-right", error ? "border-state-crit" : "border-line")}
                    value={c?.contado ?? ""}
                    onChange={(e) => contar(p, e.target.value)}
                  />
                  {error && <span className="w-full text-[12px] text-state-crit">{error}</span>}
                </li>
              );
            })}
            {visibles.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-ink-3">Ningún producto con ese nombre.</li>}
          </ul>
          <Input label="Detalle (opcional)" surface="admin" value={detalle} maxLength={280} placeholder="Conteo de cierre de mes, por ejemplo" onChange={(e) => setDetalle(e.target.value)} />
        </fieldset>
        )}

        {revisando && (
        <CampoAutorizacion
          a={a}
          numero={2}
          denegado="Tu puesto no puede ajustar el inventario."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void registrar()}
        />
        )}
      </div>
    </Sheet>
  );
}

/**
 * Las diferencias antes de ajustar (B9-10): lo contado contra lo que decía el sistema al empezar a contar cada producto,
 * por categoría y por producto. El valor es una estimación al costo promedio de hoy; el que queda es el que asienta el
 * servidor al registrar, y ese es el del informe.
 */
function Diferencias({ contables, contados }: { contables: readonly ProductoDto[]; contados: Record<string, Contado> }) {
  const lineas = contables
    .filter((p) => contados[p.id] && contados[p.id]!.contado.trim() !== "")
    .map((p) => {
      const c = contados[p.id]!;
      const diferencia = Number(c.contado) - c.esperado;
      const costo = p.costoPromedio ? BigInt(p.costoPromedio.minor) : 0n;
      return { p, esperado: c.esperado, contado: Number(c.contado), categoria: p.categoria, diferencia, valorMinor: costo * BigInt(diferencia) };
    });
  const { total, porCategoria } = diferenciasDeConteo(lineas);
  const usd = (m: bigint) => (m < 0n ? `− ${formatMoneyVE(toMajor(money(-m, "USD")), "USD")}` : formatMoneyVE(toMajor(money(m, "USD")), "USD"));
  return (
    <section className="flex flex-col gap-3" aria-label="Diferencias del conteo">
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Las diferencias, antes de ajustar</h3>
      <p className="tnum text-[13px] text-ink-2">
        {total.contados} contados · {total.cuadran} cuadran · faltan {total.faltan} ({usd(total.faltanMinor)}) · sobran {total.sobran} ({usd(total.sobranMinor)})
      </p>
      <ul className="flex flex-col gap-1 text-[12.5px]">
        {porCategoria.map((c) => (
          <li key={c.categoria} className="tnum flex justify-between gap-3 text-ink-2">
            <span className="font-semibold text-ink">{c.categoria}</span>
            <span>
              {c.contados} contados · −{c.faltan} / +{c.sobran} · {usd(c.netoMinor)}
            </span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
        {lineas.map((l) => (
          <li key={l.p.id} className="tnum flex items-center gap-3 px-3 py-1.5 text-[13px]">
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{l.p.nombre}</span>
            <span className="text-ink-3">
              sistema {l.esperado} · contado {l.contado}
            </span>
            <span className={cn("w-14 text-right font-semibold", l.diferencia === 0 ? "text-state-ok" : "text-ink")}>{l.diferencia === 0 ? "cuadra" : unidades(l.diferencia)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-3">Al costo promedio de hoy, estimado: el valor que queda es el que asienta el registro, y sale en su informe de diferencias.</p>
    </section>
  );
}
