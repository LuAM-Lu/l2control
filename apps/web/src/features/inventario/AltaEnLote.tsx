"use client";

import { useMemo, useRef, useState } from "react";
import { ClipboardPaste, ListPlus, Plus, ScanLine, TriangleAlert, X } from "lucide-react";
import { MAX_ALTA_EN_LOTE, type CatalogoDto, type Problema, type TaxCodeDelCatalogo } from "@l2/contracts";
import { barcodeProblem, nameKey, normalizeBarcode } from "@l2/domain-inventory";
import { Button, Dialog, Sheet, TAMANO_ICONO, avisar, cn, useLectorDeCodigos } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { altaEnLote } from "./productos.acciones";
import { CampoCategoria } from "./CampoCategoria.tsx";

/**
 * Inventario → Productos → «Alta en lote» (B9-7, M-28). El catálogo se carga de una vez, en una hoja y
 * sin cantidades: nombre, categoría, presentación, precio, IVA, mínimo y código de barras. Cada producto
 * nace «Sin inventario inicial» (no se vende) y su stock se cuenta otro día, en el inventario inicial.
 * Se llena con el teclado (Intro pasa a la fila siguiente), se pega desde Excel o Google Sheets y el
 * lector pone el código en la fila en la que se está. Todo o nada: si una fila no vale, el servidor no
 * crea ninguna y señala cuál. La pantalla revisa lo que puede ver; el que decide es el servidor.
 */

const ETIQUETA = "text-etiqueta font-semibold text-ink-2 uppercase";
const CAMPO =
  "min-h-9 w-full min-w-0 rounded-[var(--radius-control)] border bg-surface px-2.5 text-cuerpo text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
const COLUMNAS = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem_8rem_5rem_minmax(0,1.1fr)_2.25rem]";

/** Una fila tal como se teclea: nada se convierte hasta que se entiende. */
type Fila = {
  uid: string;
  nombre: string;
  categoria: string;
  presentacion: string;
  precio: string;
  taxCode: TaxCodeDelCatalogo;
  minimo: string;
  codigo: string;
};

type Campo = "nombre" | "categoria" | "presentacion" | "precioMinor" | "taxCode" | "minimo" | "codigoBarras";

const filaVacia = (): Fila => ({ uid: globalThis.crypto.randomUUID(), nombre: "", categoria: "", presentacion: "", precio: "", taxCode: "GENERAL", minimo: "", codigo: "" });
const vacia = (f: Fila) => [f.nombre, f.categoria, f.presentacion, f.precio, f.minimo, f.codigo].every((x) => x.trim() === "");

/** «1,50», «$ 1.50», «1.234,50» → centavos; `null` si no se entiende o no es mayor que cero. */
function centavos(texto: string): string | null {
  const limpio = texto.replace(/US\$|\$|USD/gi, "").trim();
  const m = limpio === "" ? null : importeTecleado(limpio, "USD");
  return m && m.amount > 0n ? String(m.amount) : null;
}

/** Un mínimo tecleado o pegado («6», «6,0»): `undefined` si está vacío, `null` si no se entiende. */
function minimoDe(texto: string): number | undefined | null {
  const t = texto.trim().replace(/[.,]0+$/, "");
  if (t === "") return undefined;
  return /^\d{1,7}$/.test(t) ? Number(t) : null;
}

/** El IVA como lo escribe una persona en una hoja: «General», «16 %», «Exento», «E», «0»… `null` si no se entiende. */
function ivaDe(texto: string): TaxCodeDelCatalogo | null {
  const t = nameKey(texto).replace(/[%\s]/g, "");
  if (["", "general", "g", "16", "si", "iva"].includes(t)) return "GENERAL";
  if (["exento", "exenta", "e", "0", "no", "sin", "siniva"].includes(t)) return "EXENTA";
  return null;
}

/** El producto que manda la fila, o lo que le falta campo a campo. */
function entender(f: Fila) {
  const problemas: Partial<Record<Campo, string>> = {};
  const nombre = f.nombre.trim();
  const categoria = f.categoria.trim();
  const presentacion = f.presentacion.trim();
  const precioMinor = centavos(f.precio);
  const minimo = minimoDe(f.minimo);
  const codigo = normalizeBarcode(f.codigo);
  if (nombre.length < 2) problemas.nombre = "Escribe el nombre";
  else if (nombre.length > 40) problemas.nombre = "Hasta 40 caracteres";
  if (categoria.length < 2) problemas.categoria = "Escribe la categoría";
  else if (categoria.length > 24) problemas.categoria = "Hasta 24 caracteres";
  if (presentacion.length === 1 || presentacion.length > 40) problemas.presentacion = "De 2 a 40 caracteres";
  if (!precioMinor) problemas.precioMinor = f.precio.trim() === "" ? "Falta el precio" : "Un precio en dólares mayor que cero";
  if (minimo === null) problemas.minimo = "Unidades enteras";
  if (codigo !== "" && barcodeProblem(codigo) !== null) problemas.codigoBarras = barcodeProblem(codigo) === "DIGITO_DE_CONTROL" ? "El dígito de control no cuadra" : "De 4 a 32 dígitos o letras";
  const producto =
    Object.keys(problemas).length === 0
      ? {
          nombre,
          categoria,
          taxCode: f.taxCode,
          tipo: "PRODUCTO" as const,
          precioMinor: precioMinor!,
          ...(presentacion ? { presentacion } : {}),
          ...(minimo !== undefined && minimo !== null ? { minimo } : {}),
          ...(codigo ? { codigoBarras: codigo } : {}),
        }
      : null;
  return { producto, problemas };
}

export function AltaEnLote({
  catalogo,
  categorias,
  onCerrar,
  onCreados,
}: {
  catalogo: CatalogoDto;
  categorias: readonly string[];
  onCerrar: () => void;
  onCreados: (c: CatalogoDto) => void;
}) {
  const conElevacion = useConElevacion();
  const [filas, setFilas] = useState<Fila[]>(() => [filaVacia()]);
  const [delServidor, setDelServidor] = useState<Readonly<Record<string, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pegando, setPegando] = useState(false);
  const activa = useRef<string | null>(null);
  const casillas = useRef(new Map<string, HTMLInputElement | null>());
  const enfocar = (uid: string, campo: "nombre" | "codigo") => requestAnimationFrame(() => casillas.current.get(`${uid}:${campo}`)?.focus());

  // Lo que ya existe en el local: un nombre o un código no se repiten (el servidor lo vuelve a mirar).
  const nombres = useMemo(() => new Map(catalogo.productos.map((p) => [nameKey(p.nombre), p.nombre])), [catalogo]);
  const codigos = useMemo(() => new Map(catalogo.productos.flatMap((p) => (p.codigoBarras ? [[p.codigoBarras, p.nombre] as const] : []))), [catalogo]);

  const cuentan = useMemo(() => filas.filter((f) => !vacia(f)), [filas]);
  const revisadas = useMemo(() => {
    const vistos = new Map<string, number>();
    const codigosVistos = new Map<string, number>();
    return cuentan.map((f, i) => {
      const r = entender(f);
      const clave = nameKey(f.nombre);
      const codigo = normalizeBarcode(f.codigo);
      if (!r.problemas.nombre && nombres.has(clave)) r.problemas.nombre = `Ya existe «${nombres.get(clave)}»`;
      else if (!r.problemas.nombre && vistos.has(clave)) r.problemas.nombre = `Repetido: ya está en la fila ${vistos.get(clave)! + 1}`;
      if (!r.problemas.codigoBarras && codigo && codigos.has(codigo)) r.problemas.codigoBarras = `Ya es de «${codigos.get(codigo)}»`;
      else if (!r.problemas.codigoBarras && codigo && codigosVistos.has(codigo)) r.problemas.codigoBarras = `Repetido: fila ${codigosVistos.get(codigo)! + 1}`;
      if (clave) vistos.set(clave, vistos.get(clave) ?? i);
      if (codigo) codigosVistos.set(codigo, codigosVistos.get(codigo) ?? i);
      return { ...r, producto: Object.keys(r.problemas).length === 0 ? r.producto : null };
    });
  }, [cuentan, nombres, codigos]);
  const conProblemas = revisadas.filter((r) => r.producto === null).length;
  const demasiadas = cuentan.length > MAX_ALTA_EN_LOTE;
  const listas = cuentan.length > 0 && conProblemas === 0 && !demasiadas;

  function cambiar(uid: string, cambio: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.uid === uid ? { ...f, ...cambio } : f)));
    setDelServidor({});
    setGeneral(null);
  }

  /** Pone filas nuevas en la hoja: ocupan el sitio de las que estén en blanco. */
  function añadir(nuevas: Fila[]) {
    setFilas((fs) => {
      const resultado = [...fs.filter((f) => !vacia(f)), ...nuevas];
      return resultado.length > 0 ? resultado : [filaVacia()];
    });
    setDelServidor({});
    setGeneral(null);
  }

  /** Intro en la última casilla de una fila: la siguiente, o una nueva. */
  function siguiente(uid: string) {
    const i = filas.findIndex((f) => f.uid === uid);
    const proxima = filas[i + 1];
    if (proxima) return enfocar(proxima.uid, "nombre");
    const nueva = filaVacia();
    setFilas((fs) => [...fs, nueva]);
    enfocar(nueva.uid, "nombre");
  }

  // El lector pone el código en la fila en la que se está; si ya tiene uno, abre otra con él.
  useLectorDeCodigos((leido) => {
    const codigo = normalizeBarcode(leido);
    const ajeno = codigos.get(codigo);
    if (ajeno) return avisar.error(`El código ${codigo} ya es de «${ajeno}»`);
    const fila = filas.find((f) => f.uid === activa.current);
    if (fila && fila.codigo.trim() === "") return cambiar(fila.uid, { codigo });
    const nueva = { ...filaVacia(), codigo };
    añadir([nueva]);
    enfocar(nueva.uid, "nombre");
  }, !pegando);

  async function registrar() {
    if (!listas) return;
    setEnviando(true);
    try {
      const productos = revisadas.map((r) => r.producto!);
      const r = await conElevacion(() => altaEnLote({ productos }));
      if (r.ok) {
        avisar.ok(`${productos.length} ${productos.length === 1 ? "producto dado de alta" : "productos dados de alta"}`, {
          detalle: "Nacen «Sin inventario inicial»: no se venden hasta contarlos en el inventario inicial.",
        });
        onCreados(r.valor);
        return;
      }
      setDelServidor(porFila(r.problemas ?? []));
      setGeneral(r.mensaje);
    } catch {
      setGeneral("No hubo respuesta del servidor. No se dio de alta nada: vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      className="md:w-[min(80rem,100vw)]"
      titulo="Alta en lote"
      descripcion="El catálogo de una vez y sin cantidades. Cada producto nace «Sin inventario inicial»: no se vende hasta que se cuente su stock en el inventario inicial."
      pie={
        <div className="flex w-full flex-col gap-2">
          {general && (
            <p role="alert" className="flex items-start gap-1.5 text-detalle font-medium text-state-crit">
              <TriangleAlert size={TAMANO_ICONO.texto} className="mt-0.5 shrink-0" aria-hidden="true" />
              {general}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="tnum text-detalle text-ink-2">
              {cuentan.length} {cuentan.length === 1 ? "producto" : "productos"}
              {conProblemas > 0 && <span className="text-state-warn"> · {conProblemas === 1 ? "1 fila por corregir" : `${conProblemas} filas por corregir`}</span>}
            </span>
            <Button type="button" variant="primary" surface="admin" className="ml-auto gap-1.5" disabled={!listas || enviando} onClick={() => void registrar()}>
              <ListPlus size={TAMANO_ICONO.admin} aria-hidden="true" />
              {enviando ? "Dando de alta…" : cuentan.length > 0 ? `Dar de alta ${cuentan.length} ${cuentan.length === 1 ? "producto" : "productos"}` : "Dar de alta"}
            </Button>
          </div>
          {cuentan.length === 0 && <p className="text-right text-nota text-ink-3">Escribe o pega al menos un producto con su categoría y su precio.</p>}
          {demasiadas && <p className="text-right text-nota text-state-warn">Hasta {MAX_ALTA_EN_LOTE} productos de una vez: parte la lista en dos.</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-nota text-ink-3">
            <ScanLine size={TAMANO_ICONO.etiqueta} aria-hidden="true" />
            Intro en el código pasa a la fila siguiente. El lector pone el código en la fila en la que estás.
          </p>
          <Button type="button" variant="neutral" surface="admin" className="ml-auto gap-1.5" onClick={() => setPegando(true)}>
            <ClipboardPaste size={TAMANO_ICONO.admin} aria-hidden="true" />
            Pegar desde Excel
          </Button>
        </div>

        <div role="table" aria-label="Productos del alta" className="flex flex-col gap-2">
          <div role="row" className={cn("hidden gap-2 px-2 lg:grid", COLUMNAS)}>
            {["Nombre", "Categoría", "Presentación", "Precio ($)", "IVA", "Mínimo", "Código de barras", ""].map((t, i) => (
              <span key={i} role="columnheader" className={ETIQUETA}>
                {t}
              </span>
            ))}
          </div>
          {filas.map((f, n) => {
            const i = cuentan.indexOf(f);
            const revisada = i >= 0 ? revisadas[i] : undefined;
            const error = (campo: Campo) => (i >= 0 ? (delServidor[`${i}.${campo}`] ?? revisada?.problemas[campo]) : undefined);
            return (
              <FilaDelAlta
                key={f.uid}
                f={f}
                n={n + 1}
                categorias={categorias}
                error={error}
                casilla={(campo, el) => casillas.current.set(`${f.uid}:${campo}`, el)}
                onFoco={() => {
                  activa.current = f.uid;
                }}
                onCambiar={(c) => cambiar(f.uid, c)}
                onSiguiente={() => siguiente(f.uid)}
                onQuitar={filas.length > 1 ? () => setFilas((fs) => fs.filter((x) => x.uid !== f.uid)) : null}
              />
            );
          })}
        </div>
        <div>
          <Button
            type="button"
            variant="ghost"
            surface="admin"
            className="gap-1.5"
            onClick={() => {
              const nueva = filaVacia();
              setFilas((fs) => [...fs, nueva]);
              enfocar(nueva.uid, "nombre");
            }}
          >
            <Plus size={TAMANO_ICONO.admin} aria-hidden="true" />
            Añadir fila
          </Button>
        </div>
      </div>

      {pegando && (
        <PegarCatalogo
          onCerrar={() => setPegando(false)}
          onAñadir={(nuevas) => {
            añadir(nuevas);
            setPegando(false);
            avisar.ok(`${nuevas.length} ${nuevas.length === 1 ? "fila añadida" : "filas añadidas"} a la hoja`, { detalle: "Revísalas antes de dar de alta." });
          }}
        />
      )}
    </Sheet>
  );
}

function FilaDelAlta({
  f,
  n,
  categorias,
  error,
  casilla,
  onFoco,
  onCambiar,
  onSiguiente,
  onQuitar,
}: {
  f: Fila;
  n: number;
  categorias: readonly string[];
  error: (campo: Campo) => string | undefined;
  casilla: (campo: "nombre" | "codigo", el: HTMLInputElement | null) => void;
  onFoco: () => void;
  onCambiar: (c: Partial<Fila>) => void;
  onSiguiente: () => void;
  onQuitar: (() => void) | null;
}) {
  const campo = (c: Campo, extra = "") => cn(CAMPO, extra, error(c) ? "border-state-crit" : "border-line");
  const problemas = (["nombre", "categoria", "presentacion", "precioMinor", "minimo", "codigoBarras"] as const).flatMap((c) => {
    const e = error(c);
    return e ? [e] : [];
  });
  return (
    <div
      role="row"
      aria-label={`Fila ${n}`}
      onFocus={onFoco}
      className={cn("flex flex-col gap-1.5 rounded-[var(--radius-control)] border bg-base p-2", problemas.length > 0 ? "border-state-crit/60" : "border-line")}
    >
      <div className={cn("grid grid-cols-2 items-start gap-2 sm:grid-cols-4 lg:items-center", COLUMNAS)}>
        <div role="cell" className="col-span-2 flex flex-col gap-1 lg:col-span-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Nombre</span>
          <span className="flex items-center gap-1">
            <input
              ref={(el) => casilla("nombre", el)}
              aria-label={`Nombre de la fila ${n}`}
              className={campo("nombre")}
              autoComplete="off"
              placeholder="Refresco de uva"
              value={f.nombre}
              onChange={(e) => onCambiar({ nombre: e.target.value })}
            />
            {/* En la tableta y el teléfono, quitar va junto al nombre; en el escritorio, en su columna. */}
            {onQuitar && <Quitar n={n} onQuitar={onQuitar} className="lg:hidden" />}
          </span>
        </div>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Categoría</span>
          {/* B9-11: la categoría, de una lista que se despliega; «Escribir una nueva…» para la que no está. */}
          <CampoCategoria etiqueta={`Categoría de la fila ${n}`} className={campo("categoria")} valor={f.categoria} categorias={categorias} onCambio={(categoria) => onCambiar({ categoria })} />
        </label>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Presentación</span>
          <input aria-label={`Presentación de la fila ${n}`} className={campo("presentacion")} autoComplete="off" placeholder="Lata 355 ml" value={f.presentacion} onChange={(e) => onCambiar({ presentacion: e.target.value })} />
        </label>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Precio ($)</span>
          <input aria-label={`Precio de la fila ${n}`} className={campo("precioMinor", "tnum text-right")} inputMode="decimal" autoComplete="off" placeholder="1,50" value={f.precio} onChange={(e) => onCambiar({ precio: e.target.value })} />
        </label>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>IVA</span>
          <select aria-label={`IVA de la fila ${n}`} className={campo("taxCode", "px-1.5")} value={f.taxCode} onChange={(e) => onCambiar({ taxCode: e.target.value as TaxCodeDelCatalogo })}>
            <option value="GENERAL">IVA general</option>
            <option value="EXENTA">Exento</option>
          </select>
        </label>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Mínimo</span>
          <input
            aria-label={`Mínimo de la fila ${n}`}
            className={campo("minimo", "tnum text-right")}
            inputMode="numeric"
            autoComplete="off"
            placeholder="—"
            value={f.minimo}
            onChange={(e) => onCambiar({ minimo: e.target.value.replace(/[^\d]/g, "") })}
          />
        </label>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Código de barras</span>
          <input
            ref={(el) => casilla("codigo", el)}
            aria-label={`Código de barras de la fila ${n}`}
            className={campo("codigoBarras", "tnum font-mono")}
            autoComplete="off"
            placeholder="Opcional"
            value={f.codigo}
            onChange={(e) => onCambiar({ codigo: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSiguiente();
              }
            }}
          />
        </label>
        <div role="cell" className="hidden justify-end lg:flex">
          {onQuitar && <Quitar n={n} onQuitar={onQuitar} />}
        </div>
      </div>
      {problemas.length > 0 && <p className="text-nota text-state-crit">{problemas.join(" · ")}</p>}
    </div>
  );
}

function Quitar({ n, onQuitar, className }: { n: number; onQuitar: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Quitar la fila ${n}`}
      onClick={onQuitar}
      className={cn(
        "grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-state-crit-bg hover:text-state-crit",
        className,
      )}
    >
      <X size={TAMANO_ICONO.admin} aria-hidden="true" />
    </button>
  );
}

/**
 * Lo pegado de Excel o Google Sheets, fila a fila. Columnas, en este orden: nombre, categoría,
 * presentación, precio, IVA, mínimo y código de barras (las últimas cinco pueden faltar). Una primera
 * fila de títulos se salta sola. Las celdas van separadas por tabuladores (lo que copia una hoja de
 * cálculo) o por «;».
 */
function entenderPegado(texto: string): Fila[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const separador = lineas.some((l) => l.includes("\t")) ? "\t" : ";";
  const filas: Fila[] = [];
  for (const [i, linea] of lineas.entries()) {
    const [nombre = "", categoria = "", presentacion = "", precio = "", iva = "", minimo = "", codigo = ""] = linea.split(separador).map((c) => c.trim());
    // Una primera fila cuyo precio no es un importe es la de los títulos.
    if (i === 0 && centavos(precio) === null && nombre !== "") continue;
    filas.push({ uid: globalThis.crypto.randomUUID(), nombre, categoria, presentacion, precio: precio.replace(/US\$|\$|USD/gi, "").trim(), taxCode: ivaDe(iva) ?? "GENERAL", minimo, codigo });
  }
  return filas;
}

function PegarCatalogo({ onCerrar, onAñadir }: { onCerrar: () => void; onAñadir: (filas: Fila[]) => void }) {
  const [texto, setTexto] = useState("");
  const filas = useMemo(() => entenderPegado(texto), [texto]);
  const conProblemas = filas.filter((f) => Object.keys(entender(f).problemas).length > 0).length;
  // Un IVA que no se entiende entra como general: se avisa para que se revise en la hoja.
  const ivaDudoso = useMemo(
    () => texto.split(/\r?\n/).filter((l) => l.trim() !== "").filter((l, i) => {
      const celdas = l.split(l.includes("\t") ? "\t" : ";");
      return !(i === 0 && centavos(celdas[3] ?? "") === null) && ivaDe(celdas[4] ?? "") === null;
    }).length,
    [texto],
  );
  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Pegar desde Excel"
      descripcion="Copia las filas en la hoja de cálculo y pégalas aquí. Columnas: nombre, categoría, presentación, precio, IVA (general o exento), mínimo y código de barras."
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" disabled={filas.length === 0} onClick={() => onAñadir(filas)}>
            {filas.length === 0 ? "Añadir a la hoja" : `Añadir ${filas.length} a la hoja`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <textarea
          aria-label="Lista pegada"
          rows={7}
          autoFocus
          className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-base px-3 py-2 font-mono text-detalle text-ink outline-none focus:border-brand"
          placeholder={"Refresco de uva\tBebidas\tLata 355 ml\t1,50\tGeneral\t12\t7591234567891\nGomitas\tGolosinas\tBolsa 45 g\t0,80\tExento"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {filas.length > 0 && (
          <p className="tnum text-detalle text-ink-2">
            {filas.length} {filas.length === 1 ? "fila" : "filas"} · {filas.length - conProblemas} {filas.length - conProblemas === 1 ? "lista" : "listas"}
            {conProblemas > 0 && <span className="text-state-warn"> · {conProblemas} con algo que completar en la hoja</span>}
            {ivaDudoso > 0 && <span className="text-state-warn"> · {ivaDudoso} con un IVA que no se entiende (entra como general)</span>}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Los problemas del servidor por fila y campo: «productos.3.nombre» → «3.nombre». Las filas son las que cuentan. */
function porFila(problemas: readonly Problema[]): Record<string, string> {
  const e: Record<string, string> = {};
  for (const p of problemas) {
    if (p.path[0] !== "productos" || typeof p.path[1] !== "number") continue;
    e[`${p.path[1]}.${String(p.path[2] ?? "nombre")}`] ??= p.message;
  }
  return e;
}
